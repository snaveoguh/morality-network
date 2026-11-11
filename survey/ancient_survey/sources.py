"""Elevation sources. Every fetcher returns a DTM on a metric grid:

    Dem(z: float32 array with NaN for nodata, transform: affine (UTM), crs: EPSG int, res: metres, source: str)

All downloads are cached under survey/.data/ (gitignored). Only public, licence-clean sources are fetched
automatically; anything needing a login takes a token from the environment and fails with a clear message.
"""
from __future__ import annotations

import math
import os
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import rasterio
import rasterio.windows
import requests
from pyproj import Transformer
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / ".data"

# GDAL's bundled curl does not read the system CA store behind some proxies; point it at the same bundle requests uses.
for _var in ("REQUESTS_CA_BUNDLE", "SSL_CERT_FILE"):
    if os.environ.get(_var) and not os.environ.get("CURL_CA_BUNDLE"):
        os.environ["CURL_CA_BUNDLE"] = os.environ[_var]
if not os.environ.get("CURL_CA_BUNDLE") and Path("/root/.ccr/ca-bundle.crt").exists():
    os.environ["CURL_CA_BUNDLE"] = "/root/.ccr/ca-bundle.crt"
os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")


@dataclass
class Dem:
    z: np.ndarray
    transform: object
    crs: int
    res: float
    source: str

    @property
    def shape(self):
        return self.z.shape

    def xy(self, row, col):
        """Pixel centre -> projected x, y."""
        x, y = self.transform * (col + 0.5, row + 0.5)
        return x, y

    def lonlat(self, row, col):
        x, y = self.xy(row, col)
        return Transformer.from_crs(self.crs, 4326, always_xy=True).transform(x, y)


def utm_epsg(lon: float, lat: float) -> int:
    return (32600 if lat >= 0 else 32700) + int((lon + 180) // 6) + 1


def target_grid(bbox, res):
    """UTM grid (transform, shape, epsg) covering a WGS84 bbox at `res` metres."""
    w, s, e, n = bbox
    epsg = utm_epsg((w + e) / 2, (s + n) / 2)
    t = Transformer.from_crs(4326, epsg, always_xy=True)
    xs, ys = t.transform([w, e, w, e], [s, s, n, n])
    x0, x1 = math.floor(min(xs) / res) * res, math.ceil(max(xs) / res) * res
    y0, y1 = math.floor(min(ys) / res) * res, math.ceil(max(ys) / res) * res
    width, height = int(round((x1 - x0) / res)), int(round((y1 - y0) / res))
    return from_origin(x0, y1, res, res), (height, width), epsg


def _warp_into(srcs, bbox, res, label):
    """Reproject one or more rasterio-openable paths/URLs onto the UTM target grid. Later sources fill gaps only."""
    transform, shape, epsg = target_grid(bbox, res)
    out = np.full(shape, np.nan, dtype="float32")
    for src_path in srcs:
        with rasterio.open(src_path) as src:
            # Read only the window that covers the target (COGs over HTTP: range reads, not the whole tile).
            from rasterio.windows import from_bounds
            from rasterio.warp import transform_bounds
            h, w_ = shape
            tb = (transform.c, transform.f - h * res, transform.c + w_ * res, transform.f)
            sb = transform_bounds(f"EPSG:{epsg}", src.crs, *tb, densify_pts=21)
            pad = 3 * max(src.res)
            win = from_bounds(sb[0] - pad, sb[1] - pad, sb[2] + pad, sb[3] + pad, src.transform)
            win = win.intersection(rasterio.windows.Window(0, 0, src.width, src.height)).round_offsets().round_lengths()
            if win.width < 2 or win.height < 2:
                continue
            arr = src.read(1, window=win).astype("float32")
            if src.nodata is not None:
                arr[arr == src.nodata] = np.nan
            tmp = np.full(shape, np.nan, dtype="float32")
            reproject(
                source=arr, destination=tmp, src_transform=src.window_transform(win), src_crs=src.crs,
                src_nodata=np.nan, dst_nodata=np.nan,
                dst_transform=transform, dst_crs=f"EPSG:{epsg}",
                resampling=Resampling.bilinear,
            )
        tmp[(tmp < -1000) | (tmp > 9000)] = np.nan  # 3DEP/G-LiHT nodata sentinels that survive resampling
        fill = np.isnan(out) & ~np.isnan(tmp)
        out[fill] = tmp[fill]
    if np.isnan(out).all():
        raise RuntimeError(f"{label}: no valid elevation in {bbox}")
    return Dem(out, transform, epsg, res, label)


# --------------------------------------------------------------------------------------------- Copernicus GLO-30
GLO30 = "https://copernicus-dem-30m.s3.amazonaws.com/{n}/{n}.tif"


def _glo30_name(lat_i, lon_i):
    ns = f"N{lat_i:02d}" if lat_i >= 0 else f"S{-lat_i:02d}"
    ew = f"E{lon_i:03d}" if lon_i >= 0 else f"W{-lon_i:03d}"
    return f"Copernicus_DSM_COG_10_{ns}_00_{ew}_00_DEM"


def fetch_glo30(bbox, res=30.0):
    """Copernicus GLO-30 DSM (surface model: includes canopy and buildings). Public AWS Open Data, no login.
    Licence: Copernicus DEM licence (free, attribution 'produced using Copernicus WorldDEM-30 © DLR/Airbus')."""
    w, s, e, n = bbox
    paths = []
    for lat_i in range(math.floor(s), math.floor(n) + 1):
        for lon_i in range(math.floor(w), math.floor(e) + 1):
            name = _glo30_name(lat_i, lon_i)
            dest = DATA / "glo30" / f"{name}.tif"
            if not dest.exists():
                _download(GLO30.format(n=name), dest)
            paths.append(str(dest))
    return _warp_into(paths, bbox, res, "Copernicus GLO-30 DSM (30 m)")


# --------------------------------------------------------------------------------------------- USGS 3DEP 1 m
TNM = "https://prd-tnm.s3.amazonaws.com"
TNM_PREFIX = "StagedProducts/Elevation/1m/Projects/"
_TILE_RE = re.compile(r"USGS_1M_(\d+)_x(\d+)y(\d+)_(.+)\.tif$")


def _s3_list(bucket_url, prefix, delimiter=None):
    """Anonymous S3 ListObjectsV2 over HTTPS (no AWS SDK needed). Yields keys, or common prefixes with a delimiter."""
    token = None
    ns = "{http://s3.amazonaws.com/doc/2006-03-01/}"
    while True:
        params = {"list-type": "2", "prefix": prefix}
        if delimiter:
            params["delimiter"] = delimiter
        if token:
            params["continuation-token"] = token
        r = requests.get(bucket_url + "/", params=params, timeout=60)
        r.raise_for_status()
        root = ET.fromstring(r.content)
        if delimiter:
            for cp in root.iter(ns + "CommonPrefixes"):
                yield cp.find(ns + "Prefix").text
        else:
            for c in root.iter(ns + "Contents"):
                yield c.find(ns + "Key").text
        if root.findtext(ns + "IsTruncated") != "true":
            break
        token = root.findtext(ns + "NextContinuationToken")


def _3dep_index(state_prefix):
    """Cached list of (zone, x, y, url) for every 1 m tile in projects whose name starts with `state_prefix`."""
    import json
    cache = DATA / "3dep" / f"index_{state_prefix}.json"
    if cache.exists():
        return json.loads(cache.read_text())
    rows = []
    for proj in _s3_list(TNM, TNM_PREFIX, delimiter="/"):
        name = proj[len(TNM_PREFIX):].rstrip("/")
        if not name.startswith(state_prefix):
            continue
        for key in _s3_list(TNM, proj + "TIFF/"):
            m = _TILE_RE.search(key)
            if m:
                rows.append([int(m.group(1)), int(m.group(2)), int(m.group(3)), f"{TNM}/{key}", name])
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(rows))
    return rows


def fetch_3dep_1m(bbox, res=1.0, state_prefix=None):
    """USGS 3DEP 1 m bare-earth DTM (lidar). Public domain, AWS S3, read as cloud-optimised GeoTIFF windows.
    Tiles are 10 km UTM squares named by upper-left corner: USGS_1M_<zone>_x<E/10km>y<N/10km>_<project>.tif.
    When several projects cover a tile, the newest project (by name/year) wins."""
    w, s, e, n = bbox
    if state_prefix is None:
        state_prefix = _us_state_prefix((w + e) / 2, (s + n) / 2)
    rows = _3dep_index(state_prefix)
    hits = []
    for zone, x, y, url, proj in rows:
        epsg_nad83 = 26900 + zone
        t = Transformer.from_crs(4326, epsg_nad83, always_xy=True)
        xs, ys = t.transform([w, e, w, e], [s, s, n, n])
        tx0, tx1, ty1, ty0 = x * 10000, (x + 1) * 10000, y * 10000, (y - 1) * 10000
        if max(xs) >= tx0 and min(xs) <= tx1 and max(ys) >= ty0 and min(ys) <= ty1:
            year = re.findall(r"(20\d\d)", proj)
            hits.append((int(year[-1]) if year else 0, url))
    if not hits:
        raise RuntimeError(f"No 3DEP 1 m tiles for {bbox} in projects '{state_prefix}*'")
    hits.sort(reverse=True)
    return _warp_into(["/vsicurl/" + u for _, u in hits], bbox, res, "USGS 3DEP 1 m lidar DTM")


def _us_state_prefix(lon, lat):
    # Minimal lookup for the calibration areas; pass state_prefix explicitly elsewhere.
    if 30.3 < lat < 35.1 and -85.7 < lon < -80.8:
        return "GA_"
    raise ValueError("pass state_prefix (e.g. 'GA_') for 3DEP areas outside Georgia")


# --------------------------------------------------------------------------------------------- G-LiHT / local
def fetch_gliht(area, res=1.0):
    """NASA G-LiHT DTM. Two routes:
      1. Scholar@UC open mirror URL in the area config (no login; host scholar.uc.edu must be reachable).
      2. LP DAAC (GLDTMK.001) URL with EARTHDATA_TOKEN set (bearer token from urs.earthdata.nasa.gov).
    G-LiHT has NO coverage over Costa Rica, Nicaragua or Panama (flights: CONUS, Alaska, Puerto Rico, Mexico)."""
    dest = DATA / "gliht" / area["file"]
    if not dest.exists():
        headers = {}
        if "earthdata" in area["url"] or "lpdaac" in area["url"]:
            tok = os.environ.get("EARTHDATA_TOKEN")
            if not tok:
                raise RuntimeError("G-LiHT via LP DAAC needs EARTHDATA_TOKEN (free Earthdata login). See DATA.md.")
            headers["Authorization"] = f"Bearer {tok}"
        _download(area["url"], dest, headers=headers)
    return _warp_into([str(dest)], area["bbox"], res, "NASA G-LiHT DTM")


def fetch_local(area, res):
    path = Path(area["file"])
    if not path.is_absolute():
        path = ROOT / path
    if not path.exists():
        raise FileNotFoundError(f"{path} not found. Download the DTM yourself (see DATA.md) and put it there.")
    return _warp_into([str(path)], area["bbox"], res, f"local DTM ({path.name})")


def fetch_area(area):
    """Fetch (or load from the .data cache) the DTM for an area config."""
    import hashlib
    import json
    from affine import Affine
    key = hashlib.sha1(json.dumps([area["source"], area["bbox"], area.get("res_m"), area.get("file")]).encode()).hexdigest()[:12]
    cache = DATA / "dem" / f"{key}.npz"
    if cache.exists():
        d = np.load(cache, allow_pickle=False)
        return Dem(d["z"], Affine(*d["t"]), int(d["crs"]), float(d["res"]), str(d["source"]))
    dem = _fetch_area(area)
    cache.parent.mkdir(parents=True, exist_ok=True)
    np.savez(cache, z=dem.z, t=np.array(tuple(dem.transform)[:6]), crs=dem.crs, res=dem.res, source=dem.source)
    return dem


def _fetch_area(area):
    src, res = area["source"], float(area.get("res_m", 1.0))
    if src == "glo30":
        return fetch_glo30(area["bbox"], res)
    if src == "3dep_1m":
        return fetch_3dep_1m(area["bbox"], res, area.get("state_prefix"))
    if src == "gliht":
        return fetch_gliht(area, res)
    if src == "local":
        return fetch_local(area, res)
    raise ValueError(f"unknown source {src}")


def _download(url, dest: Path, headers=None, chunk=1 << 20):
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    with requests.get(url, headers=headers or {}, stream=True, timeout=120) as r:
        r.raise_for_status()
        with open(tmp, "wb") as f:
            for b in r.iter_content(chunk):
                f.write(b)
    tmp.rename(dest)
