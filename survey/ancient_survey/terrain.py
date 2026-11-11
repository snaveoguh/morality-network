"""Terrain derivatives used by archaeological lidar work (cheap, numpy/scipy only).

- hillshade: single and multi-direction (removes the lighting-direction bias of one sun angle)
- slope (degrees)
- local relief model (LRM): DEM minus a smoothed DEM; positive = locally raised (mounds, platforms, causeways)
- sky-view factor (SVF): fraction of sky visible; low on ditches/hollows, high on summits; computed per crop
"""
from __future__ import annotations

import math

import numpy as np
from scipy import ndimage


def fill_nan(z):
    """Nearest-neighbour fill so filters don't smear NaN; returns (filled, nan_mask)."""
    nan = np.isnan(z)
    if not nan.any():
        return z, nan
    idx = ndimage.distance_transform_edt(nan, return_distances=False, return_indices=True)
    return z[tuple(idx)], nan


def gradient(z, res):
    zp = np.pad(z, 1, mode="edge")
    dzdx = ((zp[:-2, 2:] + 2 * zp[1:-1, 2:] + zp[2:, 2:]) - (zp[:-2, :-2] + 2 * zp[1:-1, :-2] + zp[2:, :-2])) / (8 * res)
    dzdy = ((zp[2:, :-2] + 2 * zp[2:, 1:-1] + zp[2:, 2:]) - (zp[:-2, :-2] + 2 * zp[:-2, 1:-1] + zp[:-2, 2:])) / (8 * res)
    return dzdx, dzdy


def slope_deg(z, res):
    dzdx, dzdy = gradient(z, res)
    return np.degrees(np.arctan(np.hypot(dzdx, dzdy))).astype("float32")


def hillshade(z, res, azimuth=315.0, altitude=35.0, exaggeration=1.0):
    dzdx, dzdy = gradient(z * exaggeration, res)
    slope = np.arctan(np.hypot(dzdx, dzdy))
    aspect = np.arctan2(dzdy, -dzdx)
    zen, az = math.radians(90 - altitude), math.radians(360 - azimuth + 90)
    hs = np.cos(zen) * np.cos(slope) + np.sin(zen) * np.sin(slope) * np.cos(az - aspect)
    return np.clip(hs, 0, 1).astype("float32")


def multi_hillshade(z, res, n=8, altitude=35.0, exaggeration=1.0):
    acc = np.zeros(z.shape, dtype="float32")
    for i in range(n):
        acc += hillshade(z, res, azimuth=i * 360.0 / n, altitude=altitude, exaggeration=exaggeration)
    return acc / n


def local_relief(z, res, scale_m):
    """Simple LRM: DEM minus mean-filtered DEM over a `scale_m` window."""
    size = max(3, int(round(scale_m / res)) | 1)
    return (z - ndimage.uniform_filter(z, size=size, mode="nearest")).astype("float32")


def multiscale_lrm(z, res, scales_m):
    """Max positive relief across scales (small scale finds house mounds, large scale finds big platforms)."""
    out = None
    for s in scales_m:
        l = local_relief(z, res, s)
        out = l if out is None else np.maximum(out, l)
    return out


def sky_view_factor(z, res, radius_m=None, n_dir=16, n_steps=12):
    """SVF = 1 - mean over directions of sin(max horizon elevation angle). Crop-sized arrays only."""
    if radius_m is None:
        radius_m = 10 * res
    r_px = max(2.0, radius_m / res)
    steps = np.unique(np.linspace(1, r_px, n_steps).round().astype(int))
    h, w = z.shape
    pad = int(steps.max()) + 1
    zp = np.pad(z, pad, mode="edge")
    acc = np.zeros_like(z, dtype="float32")
    for k in range(n_dir):
        ang = 2 * math.pi * k / n_dir
        dx, dy = math.cos(ang), math.sin(ang)
        best = np.full(z.shape, -np.inf, dtype="float32")
        for s in steps:
            ox, oy = int(round(dx * s)), int(round(dy * s))
            dist = math.hypot(ox, oy) * res
            if dist == 0:
                continue
            shifted = zp[pad + oy: pad + oy + h, pad + ox: pad + ox + w]
            best = np.maximum(best, np.arctan((shifted - z) / dist))
        acc += np.sin(np.maximum(best, 0))
    return (1 - acc / n_dir).astype("float32")
