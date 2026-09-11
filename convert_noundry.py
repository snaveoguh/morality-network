#!/usr/bin/env python3
"""
Convert Noundry VoxEdit assets (.vxr + .vxm + .vxa) to VoxelMap JSON format.

VXM format (version 12 / VXMC):
  - Header: magic(4) + dims(12) + pivot(12) + surface(1) + LOD(16) + LOD levels + palette(2048) + materials
  - Palette: 256 BGRA entries (albedo) + 256 BGRA entries (emissive)
  - Voxel data: RLE pairs (length, palette_index), 0xFF=air, length=0 terminates

VXR format (version 9 / VXR9):
  - Header: magic(4) + anim_name + child_count + base_template + isStatic
  - Recursive node tree: name, vxm_filename, properties, IK constraints, child_count

VXA format (version 3 / VXA3):
  - Header: magic(4) + md5(16) + anim_id + child_count
  - Per node: 7 channels (posX, posY, posZ, rotX, rotY, rotZ, scale) with keyframes
  - Recursive node tree matching VXR structure

Output format: {"head": {"x,y,z": "#rrggbb", ...}}
"""

import struct
import math
import json
import os
import sys


def read_cstr(data, offset):
    """Read a null-terminated string."""
    start = offset
    while offset < len(data) and data[offset] != 0:
        offset += 1
    s = data[start:offset].decode('ascii', errors='replace')
    offset += 1
    return s, offset


# ============================================================
# VXM Parser
# ============================================================

def parse_vxm(filepath):
    """Parse a VXM file, return dict with palette and voxels."""
    with open(filepath, 'rb') as f:
        data = f.read()

    if len(data) < 4 or data[0:3] != b'VXM':
        raise ValueError(f"Not a VXM file: {filepath}")

    vc = chr(data[3])
    if vc >= 'A':
        version = ord(vc) - ord('A') + 10
    elif vc.isdigit():
        version = int(vc)
    else:
        raise ValueError(f"Unknown VXM version: {vc!r}")

    offset = 4

    # Dimensions (v6+)
    if version >= 6:
        w, h, d = struct.unpack_from('<III', data, offset)
        offset += 12
    else:
        w, h, d = 1, 1, 1

    # Normalized pivot (v5+)
    if version >= 5:
        px, py, pz = struct.unpack_from('<fff', data, offset)
        offset += 12
    else:
        px, py, pz = 0.5, 0.0, 0.5

    # Surface flag (v9+)
    if version >= 9:
        surface = data[offset]
        offset += 1
        if surface:
            offset += 36

    # LOD scale + pivot (v8+)
    if version >= 8:
        offset += 16

    # LOD levels (v7+)
    if version >= 7:
        lod_count = struct.unpack_from('<I', data, offset)[0]
        offset += 4
        for _ in range(lod_count):
            offset += 8  # texture width, height
            comp_size = struct.unpack_from('<I', data, offset)[0]
            offset += 4
            if comp_size > 0:
                offset += comp_size
            for _face in range(6):
                quad_count = struct.unpack_from('<I', data, offset)[0]
                offset += 4
                offset += quad_count * 4 * 20

    # Palette (v11+): 256 BGRA albedo + 256 BGRA emissive
    if version >= 11:
        offset += 256 * 4  # skip albedo (we use materials below)
        offset += 256 * 4  # skip emissive
        offset += 1        # chunk amount

    # Material palette: count + RGBA entries (always present)
    mat_count = data[offset]
    offset += 1
    palette = []
    for i in range(mat_count):
        r, g, b, a = struct.unpack_from('BBBB', data, offset)
        offset += 4
        palette.append((r, g, b, a))
        if version >= 3:
            offset += 1  # emissive flag

    # v12: maxModels
    max_models = 1
    if version >= 12:
        max_models = data[offset]
        offset += 1

    # Parse voxel data
    all_voxels = {}
    for mi in range(max_models):
        if version >= 12:
            _model_name, offset = read_cstr(data, offset)
            _visible = data[offset]
            offset += 1

        x, y, z = 0, 0, 0
        while offset < len(data) - 1:
            run_len = data[offset]
            offset += 1
            if run_len == 0:
                break
            pal_idx = data[offset]
            offset += 1

            for _ in range(run_len):
                if pal_idx != 0xFF and pal_idx < len(palette):
                    mx = w - 1 - x
                    all_voxels[(mx, y, z)] = pal_idx
                y += 1
                if y >= h:
                    y = 0
                    x += 1
                    if x >= w:
                        x = 0
                        z += 1

    return {
        'width': w, 'height': h, 'depth': d,
        'pivot': (px, py, pz),
        'palette': palette,
        'voxels': all_voxels,
    }


# ============================================================
# VXR Parser
# ============================================================

def parse_vxr(filepath):
    """Parse a VXR rig file, return node tree."""
    with open(filepath, 'rb') as f:
        data = f.read()

    if len(data) < 4 or data[0:3] != b'VXR':
        raise ValueError(f"Not a VXR file: {filepath}")

    version = int(chr(data[3]))
    offset = 4

    if version >= 7:
        _anim_name, offset = read_cstr(data, offset)

    child_count = struct.unpack_from('<i', data, offset)[0]
    offset += 4

    if version >= 8:
        _base_template, offset = read_cstr(data, offset)
        is_static = data[offset]
        offset += 1

        # When isStatic=true, skip embedded LOD texture + quad mesh data
        if is_static:
            lod_levels = struct.unpack_from('<i', data, offset)[0]
            offset += 4
            for _ in range(lod_levels):
                offset += 8  # two dummy uint32
                diff_size = struct.unpack_from('<I', data, offset)[0]
                offset += 4
                if diff_size > 0:
                    offset += diff_size
                has_emissive = data[offset]
                offset += 1
                if has_emissive:
                    emiss_size = struct.unpack_from('<I', data, offset)[0]
                    offset += 4
                    if emiss_size > 0:
                        offset += emiss_size
                quad_count = struct.unpack_from('<I', data, offset)[0]
                offset += 4
                offset += quad_count * 80  # 4 verts * 5 floats * 4 bytes

    def parse_node(data, offset):
        node = {}
        node['name'], offset = read_cstr(data, offset)
        node['vxm'], offset = read_cstr(data, offset)

        if version >= 9:
            offset += 2  # collidable, decorative

        if version >= 6:
            offset += 4 + 2  # color(uint32), favorite, visible

        if version >= 5:
            offset += 6  # 6 mirror bools

        if version >= 9:
            offset += 1  # anchor
            _eff_id, offset = read_cstr(data, offset)
            offset += 1  # ik_vis
            offset += 8  # rollMin, rollMax
            swing_count = struct.unpack_from('<I', data, offset)[0]
            offset += 4
            offset += swing_count * 12

        cc = struct.unpack_from('<I', data, offset)[0]
        offset += 4
        node['children'] = []
        for _ in range(cc):
            child, offset = parse_node(data, offset)
            node['children'].append(child)

        return node, offset

    nodes = []
    for _ in range(child_count):
        node, offset = parse_node(data, offset)
        nodes.append(node)

    return {'version': version, 'nodes': nodes}


# ============================================================
# VXA Parser
# ============================================================

def parse_vxa(filepath):
    """Parse a VXA animation file, return transform tree."""
    with open(filepath, 'rb') as f:
        data = f.read()

    if len(data) < 4 or data[0:3] != b'VXA':
        raise ValueError(f"Not a VXA file: {filepath}")

    version = int(chr(data[3]))
    offset = 4
    offset += 16  # MD5 hash
    _anim_id, offset = read_cstr(data, offset)

    child_count = struct.unpack_from('<i', data, offset)[0]
    offset += 4

    def parse_vxa_node(data, offset):
        pos = [0.0, 0.0, 0.0]
        rot = [0.0, 0.0, 0.0]
        scale = 1.0

        if version >= 3:
            for ch in range(7):
                kf_count = struct.unpack_from('<i', data, offset)[0]
                offset += 4
                for k in range(kf_count):
                    offset += 4  # frame_idx
                    offset += 4  # interp
                    value = struct.unpack_from('<f', data, offset)[0]
                    offset += 4
                    if ch == 3:
                        offset += 1  # slerp flag
                    if k == 0:
                        if ch < 3:
                            pos[ch] = value
                        elif ch < 6:
                            rot[ch - 3] = value
                        else:
                            scale = value
        else:
            kf_count = struct.unpack_from('<I', data, offset)[0]
            offset += 4
            for k in range(kf_count):
                offset += 4 + 4 + 1  # frame, interp, long_rot
                lt = struct.unpack_from('<fff', data, offset + 12)
                offset += 24  # world + local translation
                lo = struct.unpack_from('<ffff', data, offset + 16)
                offset += 32  # world + local orientation
                ls = struct.unpack_from('<f', data, offset + 4)[0]
                offset += 8  # world + local scale
                if k == 0:
                    pos = list(lt)
                    scale = ls

        cc = struct.unpack_from('<i', data, offset)[0]
        offset += 4
        children = []
        for _ in range(cc):
            child, offset = parse_vxa_node(data, offset)
            children.append(child)

        return {'pos': pos, 'rot': rot, 'scale': scale, 'children': children}, offset

    nodes = []
    for _ in range(child_count):
        node, offset = parse_vxa_node(data, offset)
        nodes.append(node)

    return {'version': version, 'nodes': nodes}


# ============================================================
# 3D Transform Math
# ============================================================

def euler_to_matrix(rx, ry, rz):
    """Convert Euler angles (radians) to 3x3 rotation matrix (Rz * Ry * Rx)."""
    # Guard against NaN/Inf values from bad VXA data
    if not (math.isfinite(rx) and math.isfinite(ry) and math.isfinite(rz)):
        return identity_mat()
    cx, sx = math.cos(rx), math.sin(rx)
    cy, sy = math.cos(ry), math.sin(ry)
    cz, sz = math.cos(rz), math.sin(rz)
    return [
        [cy * cz, sx * sy * cz - cx * sz, cx * sy * cz + sx * sz],
        [cy * sz, sx * sy * sz + cx * cz, cx * sy * sz - sx * cz],
        [-sy,     sx * cy,                cx * cy               ],
    ]


def mat_mul(a, b):
    """Multiply two 3x3 matrices."""
    r = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
    for i in range(3):
        for j in range(3):
            for k in range(3):
                r[i][j] += a[i][k] * b[k][j]
    return r


def mat_vec(m, v):
    """Multiply 3x3 matrix by 3-vector."""
    return [
        m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
        m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
        m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
    ]


def identity_mat():
    return [[1, 0, 0], [0, 1, 0], [0, 0, 1]]


# ============================================================
# Assembly
# ============================================================

def assemble_rig(vxr_path):
    """Load a VoxEdit rig and assemble all voxels in world space.
    Returns: dict of (x,y,z) -> "#rrggbb"
    """
    base_dir = os.path.dirname(vxr_path)
    vxr = parse_vxr(vxr_path)

    vxr_basename = os.path.splitext(os.path.basename(vxr_path))[0]
    vxa_path = os.path.join(base_dir, f"{vxr_basename}.x.vxa")
    vxa = None
    if os.path.exists(vxa_path):
        try:
            vxa = parse_vxa(vxa_path)
        except Exception as e:
            print(f"  Warning: VXA parse failed: {e}", file=sys.stderr)

    vxm_cache = {}

    def load_vxm(filename):
        if not filename:
            return None
        if filename in vxm_cache:
            return vxm_cache[filename]
        path = os.path.join(base_dir, filename)
        if not os.path.exists(path):
            vxm_cache[filename] = None
            return None
        try:
            result = parse_vxm(path)
            vxm_cache[filename] = result
            return result
        except Exception as e:
            print(f"  Warning: VXM parse failed {filename}: {e}", file=sys.stderr)
            vxm_cache[filename] = None
            return None

    world_voxels = {}

    def process_node(vxr_node, vxa_node, parent_pos, parent_rot_mat, parent_scale):
        if vxa_node:
            local_pos = vxa_node['pos']
            local_rot = vxa_node['rot']
            local_scale = vxa_node['scale']
        else:
            local_pos = [0.0, 0.0, 0.0]
            local_rot = [0.0, 0.0, 0.0]
            local_scale = 1.0

        # Sanitize NaN/Inf values
        for i in range(3):
            if not math.isfinite(local_pos[i]):
                local_pos[i] = 0.0
            if not math.isfinite(local_rot[i]):
                local_rot[i] = 0.0
        if not math.isfinite(local_scale):
            local_scale = 1.0

        scaled_pos = [local_pos[i] * parent_scale for i in range(3)]
        rotated_pos = mat_vec(parent_rot_mat, scaled_pos)
        world_pos = [parent_pos[i] + rotated_pos[i] for i in range(3)]

        local_rot_mat = euler_to_matrix(local_rot[0], local_rot[1], local_rot[2])
        world_rot_mat = mat_mul(parent_rot_mat, local_rot_mat)
        world_scale = parent_scale * local_scale

        vxm_file = vxr_node.get('vxm', '')
        if vxm_file:
            vxm = load_vxm(vxm_file)
            if vxm and vxm['voxels']:
                palette = vxm['palette']
                w, h, d = vxm['width'], vxm['height'], vxm['depth']
                pivot = vxm['pivot']
                pivot_x = pivot[0] * w
                pivot_y = pivot[1] * h
                pivot_z = pivot[2] * d

                for (vx, vy, vz), pal_idx in vxm['voxels'].items():
                    if pal_idx >= len(palette):
                        continue
                    r, g, b, a = palette[pal_idx]
                    if a == 0:
                        continue

                    rel_x = vx - pivot_x
                    rel_y = vy - pivot_y
                    rel_z = vz - pivot_z

                    scaled = [rel_x * world_scale, rel_y * world_scale, rel_z * world_scale]
                    rotated = mat_vec(world_rot_mat, scaled)
                    wx = world_pos[0] + rotated[0]
                    wy = world_pos[1] + rotated[1]
                    wz = world_pos[2] + rotated[2]

                    # Guard against NaN from bad transforms
                    if not (math.isfinite(wx) and math.isfinite(wy) and math.isfinite(wz)):
                        continue
                    ix, iy, iz = round(wx), round(wy), round(wz)
                    color = f"#{r:02x}{g:02x}{b:02x}"
                    world_voxels[(ix, iy, iz)] = color

        vxr_children = vxr_node.get('children', [])
        vxa_children = vxa_node['children'] if vxa_node else []

        for i, vxr_child in enumerate(vxr_children):
            vxa_child = vxa_children[i] if i < len(vxa_children) else None
            process_node(vxr_child, vxa_child, world_pos, world_rot_mat, world_scale)

    vxr_nodes = vxr['nodes']
    vxa_nodes = vxa['nodes'] if vxa else []

    for i, vxr_node in enumerate(vxr_nodes):
        vxa_node = vxa_nodes[i] if i < len(vxa_nodes) else None
        process_node(vxr_node, vxa_node, [0.0, 0.0, 0.0], identity_mat(), 1.0)

    return world_voxels


def voxels_to_json(voxels):
    """Convert voxel dict to JSON: {"head": {"x,y,z": "#rrggbb"}}."""
    head = {}
    for (x, y, z), color in voxels.items():
        head[f"{x},{y},{z}"] = color
    return {"head": head}


def convert_directory(head_dir, output_path):
    """Convert a single Noundry head directory to JSON."""
    vxr_files = [f for f in os.listdir(head_dir) if f.endswith('.vxr')]
    if not vxr_files:
        return False

    vxr_path = os.path.join(head_dir, vxr_files[0])
    try:
        voxels = assemble_rig(vxr_path)
        if not voxels:
            print(f"  No voxels for {os.path.basename(head_dir)}", file=sys.stderr)
            return False

        data = voxels_to_json(voxels)
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, 'w') as f:
            json.dump(data, f, separators=(',', ':'))

        print(f"  {os.path.basename(output_path)}: {len(voxels)} voxels")
        return True
    except Exception as e:
        print(f"  ERROR {os.path.basename(head_dir)}: {e}", file=sys.stderr)
        return False


def batch_convert(noundry_dir, output_dir):
    """Convert all Noundry head directories to VoxelMap JSON."""
    heads_dir = os.path.join(noundry_dir, 'HEAD', 'NOUNS')
    entries = sorted(os.listdir(heads_dir))
    head_dirs = [e for e in entries if os.path.isdir(os.path.join(heads_dir, e))]

    print(f"Found {len(head_dirs)} head directories")
    success = failed = skipped = 0

    for dirname in head_dirs:
        head_path = os.path.join(heads_dir, dirname)
        vxr_files = [f for f in os.listdir(head_path) if f.endswith('.vxr')]
        if not vxr_files:
            skipped += 1
            continue

        safe_name = dirname.replace(' ', '').replace('(', '').replace(')', '')
        output_name = f"noundry-{safe_name}Head.json"
        output_path = os.path.join(output_dir, output_name)

        print(f"Converting {dirname}...")
        if convert_directory(head_path, output_path):
            success += 1
        else:
            failed += 1

    print(f"\nDone: {success} converted, {failed} failed, {skipped} skipped")


if __name__ == '__main__':
    noundry_dir = '/Users/hugo/noundry-assets'
    output_dir = '/Users/hugo/noun-wtf/packages/nouns-webapp/public/models/heads/voxeldata'

    if len(sys.argv) > 1 and sys.argv[1] == '--test':
        test_dirs = ['Shark', 'AardVark', 'Fox', 'Bank']
        heads_dir = os.path.join(noundry_dir, 'HEAD', 'NOUNS')
        for name in test_dirs:
            path = os.path.join(heads_dir, name)
            if os.path.isdir(path):
                out = os.path.join(output_dir, f"noundry-{name}Head.json")
                print(f"\nTesting {name}...")
                convert_directory(path, out)
            else:
                print(f"  Not found: {path}")
    elif len(sys.argv) > 1 and sys.argv[1] == '--single':
        head_dir = sys.argv[2]
        name = os.path.basename(head_dir)
        out = os.path.join(output_dir, f"noundry-{name}Head.json")
        convert_directory(head_dir, out)
    else:
        batch_convert(noundry_dir, output_dir)
