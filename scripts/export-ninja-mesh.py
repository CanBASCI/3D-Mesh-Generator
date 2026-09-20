#!/usr/bin/env python3
"""Build a watertight-ish inflated mesh (GLB / STL / OBJ) from the ninja sprite."""
from __future__ import annotations

import json
import struct
from pathlib import Path

import numpy as np
from PIL import Image

PNG = Path("/workspace/public/ninja.png")
DEPTH = Path("/workspace/public/ninja-depth.png")
OUT_GLB = Path("/workspace/public/shinobi.glb")
OUT_STL = Path("/workspace/public/shinobi.stl")
OUT_OBJ = Path("/workspace/public/shinobi.obj")
TARGET_COLS = 96
WORLD_H = 1.72
PUFF = 1.0


def load_grid():
    color = np.array(Image.open(PNG).convert("RGBA"))
    depth = np.array(Image.open(DEPTH).convert("L"))
    h, w = color.shape[:2]
    step = max(1, round(w / TARGET_COLS))
    cols = max(8, w // step)
    rows = max(8, h // step)
    solid = np.zeros((rows, cols), dtype=bool)
    depth_s = np.zeros((rows, cols), dtype=np.float32)
    rgb = np.zeros((rows, cols, 3), dtype=np.float32)
    uv = np.zeros((rows, cols, 2), dtype=np.float32)
    for j in range(rows):
        for i in range(cols):
            sx = min(w - 1, i * step + step // 2)
            sy = min(h - 1, j * step + step // 2)
            uv[j, i] = (sx / max(1, w - 1), 1.0 - sy / max(1, h - 1))
            a = color[sy, sx, 3]
            if a < 40:
                continue
            solid[j, i] = True
            rgb[j, i] = color[sy, sx, :3] / 255.0
            depth_s[j, i] = depth[sy, sx] / 255.0
    ys, xs = np.where(solid)
    min_i, max_i = int(xs.min()), int(xs.max())
    min_j, max_j = int(ys.min()), int(ys.max())
    span_j = max(1, max_j - min_j)
    mid_i = (min_i + max_i) / 2
    return solid, depth_s, rgb, uv, cols, rows, min_i, max_i, min_j, max_j, span_j, mid_i


def pos(i, j, depth_s, puff, span_j, mid_i, max_j):
    x = ((i - mid_i) / span_j) * WORLD_H
    y = ((max_j - j) / span_j) * WORLD_H
    d = float(depth_s[j, i]) ** 0.82
    z = d * puff * WORLD_H * 0.2 + 0.016
    return x, y, z


def build():
    solid, depth_s, rgb, uv, cols, rows, min_i, max_i, min_j, max_j, span_j, mid_i = load_grid()
    front = -np.ones((rows, cols), dtype=np.int32)
    verts = []
    uvs = []
    cols_v = []

    def add(x, y, z, u, v, r, g, b):
        verts.append((x, y, z))
        uvs.append((u, v))
        cols_v.append((r, g, b))
        return len(verts) - 1

    for j in range(rows):
        for i in range(cols):
            if not solid[j, i]:
                continue
            x, y, z = pos(i, j, depth_s, PUFF, span_j, mid_i, max_j)
            r, g, b = rgb[j, i]
            u, v = uv[j, i]
            fi = add(x, y, z, u, v, r, g, b)
            bi = add(x, y, -z, 0.5, 0.42, 0.07, 0.07, 0.08)
            front[j, i] = fi
            # store back as fi+1
            assert bi == fi + 1

    faces = []  # triangles as vertex indices

    def quad(a, b, c, d):
        faces.append((a, c, b))
        faces.append((b, c, d))

    for j in range(rows - 1):
        for i in range(cols - 1):
            a, b = front[j, i], front[j, i + 1]
            c, d = front[j + 1, i], front[j + 1, i + 1]
            if a >= 0 and b >= 0 and c >= 0 and d >= 0:
                quad(a, b, c, d)
                quad(b + 1, a + 1, d + 1, c + 1)

    def rim(i0, j0, i1, j1):
        a, b = front[j0, i0], front[j1, i1]
        if a < 0 or b < 0:
            return
        fa, fb, ba, bb = a, b, a + 1, b + 1
        base = len(verts)
        for src in (fa, fb, ba, bb):
            x, y, z = verts[src]
            add(x, y, z, 0.5, 0.42, 0.05, 0.05, 0.06)
        faces.append((base, base + 2, base + 1))
        faces.append((base + 1, base + 2, base + 3))

    for j in range(rows):
        for i in range(cols):
            if not solid[j, i]:
                continue
            if i + 1 < cols and solid[j, i + 1]:
                up = j == 0 or not solid[j - 1, i] or not solid[j - 1, i + 1]
                dn = j == rows - 1 or not solid[j + 1, i] or not solid[j + 1, i + 1]
                if up:
                    rim(i, j, i + 1, j)
                if dn:
                    rim(i + 1, j, i, j)
            if j + 1 < rows and solid[j + 1, i]:
                lf = i == 0 or not solid[j, i - 1] or not solid[j + 1, i - 1]
                rt = i == cols - 1 or not solid[j, i + 1] or not solid[j + 1, i + 1]
                if rt:
                    rim(i, j, i, j + 1)
                if lf:
                    rim(i, j + 1, i, j)

    pos_a = np.asarray(verts, dtype=np.float32)
    uv_a = np.asarray(uvs, dtype=np.float32)
    idx = np.asarray(faces, dtype=np.uint32).reshape(-1)
    nrm = np.zeros_like(pos_a)
    tri = idx.reshape(-1, 3)
    v0 = pos_a[tri[:, 0]]
    v1 = pos_a[tri[:, 1]]
    v2 = pos_a[tri[:, 2]]
    fn = np.cross(v1 - v0, v2 - v0)
    for k in range(3):
        np.add.at(nrm, tri[:, k], fn)
    lens = np.linalg.norm(nrm, axis=1, keepdims=True)
    lens[lens < 1e-8] = 1
    nrm = (nrm / lens).astype(np.float32)
    print(f"verts {len(pos_a)} tris {len(tri)}")
    return pos_a, nrm, uv_a, idx


def pad4(data: bytes, pad: bytes) -> bytes:
    extra = (4 - len(data) % 4) % 4
    return data + pad * extra


def write_glb(pos, nrm, uv, idx):
    img = Image.open(PNG).convert("RGBA")
    img.thumbnail((512, 512), Image.Resampling.LANCZOS)
    import io

    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    png = buf.getvalue()
    pos_b = pos.astype("<f4").tobytes()
    nrm_b = nrm.astype("<f4").tobytes()
    uv_b = uv.astype("<f4").tobytes()
    idx_b = idx.astype("<u4").tobytes()

    blobs = []
    offset = 0
    views = []

    def add(buf: bytes, target=None):
        nonlocal offset
        pad = (4 - offset % 4) % 4
        offset += pad
        view = {"buffer": 0, "byteOffset": offset, "byteLength": len(buf)}
        if target is not None:
            view["target"] = target
        views.append(view)
        blobs.append((pad, buf))
        offset += len(buf)
        return len(views) - 1

    iv_pos = add(pos_b, 34962)
    iv_nrm = add(nrm_b, 34962)
    iv_uv = add(uv_b, 34962)
    iv_idx = add(idx_b, 34963)
    iv_img = add(png)

    gltf = {
        "asset": {"version": "2.0", "generator": "Shinobi 3D"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": "Shinobi"}],
        "meshes": [
            {
                "name": "Shinobi",
                "primitives": [
                    {
                        "attributes": {"POSITION": 0, "NORMAL": 1, "TEXCOORD_0": 2},
                        "indices": 3,
                        "material": 0,
                    }
                ],
            }
        ],
        "materials": [
            {
                "name": "NinjaArt",
                "pbrMetallicRoughness": {
                    "baseColorTexture": {"index": 0},
                    "metallicFactor": 0.0,
                    "roughnessFactor": 0.52,
                },
            }
        ],
        "textures": [{"source": 0}],
        "images": [{"bufferView": iv_img, "mimeType": "image/png"}],
        "buffers": [{"byteLength": offset}],
        "bufferViews": views,
        "accessors": [
            {
                "bufferView": iv_pos,
                "componentType": 5126,
                "count": len(pos),
                "type": "VEC3",
                "min": pos.min(0).tolist(),
                "max": pos.max(0).tolist(),
            },
            {"bufferView": iv_nrm, "componentType": 5126, "count": len(nrm), "type": "VEC3"},
            {"bufferView": iv_uv, "componentType": 5126, "count": len(uv), "type": "VEC2"},
            {"bufferView": iv_idx, "componentType": 5125, "count": len(idx), "type": "SCALAR"},
        ],
    }
    json_b = pad4(json.dumps(gltf, separators=(",", ":")).encode("utf-8"), b" ")
    bin_b = bytearray()
    for pad, buf in blobs:
        bin_b.extend(b"\x00" * pad)
        bin_b.extend(buf)
    bin_b = pad4(bytes(bin_b), b"\x00")
    total = 12 + 8 + len(json_b) + 8 + len(bin_b)
    data = (
        struct.pack("<4sII", b"glTF", 2, total)
        + struct.pack("<I4s", len(json_b), b"JSON")
        + json_b
        + struct.pack("<I4s", len(bin_b), b"BIN\x00")
        + bin_b
    )
    OUT_GLB.write_bytes(data)
    print("wrote", OUT_GLB, "bytes", len(data))


def write_stl(pos, idx):
    tris = idx.reshape(-1, 3)
    header = b"Shinobi 3D" + b"\x00" * (80 - 10)
    body = [header, struct.pack("<I", len(tris))]
    v = pos[tris]
    n = np.cross(v[:, 1] - v[:, 0], v[:, 2] - v[:, 0])
    lens = np.linalg.norm(n, axis=1, keepdims=True)
    lens[lens < 1e-8] = 1
    n = n / lens
    for i in range(len(tris)):
        body.append(struct.pack("<3f", *n[i]))
        body.append(struct.pack("<9f", *v[i].reshape(-1)))
        body.append(struct.pack("<H", 0))
    OUT_STL.write_bytes(b"".join(body))
    print("wrote", OUT_STL)


def write_obj(pos, nrm, uv, idx):
    lines = ["# Shinobi 3D", "mtllib shinobi.mtl", "o Shinobi", "usemtl NinjaArt"]
    for x, y, z in pos:
        lines.append(f"v {x:.6f} {y:.6f} {z:.6f}")
    for x, y, z in nrm:
        lines.append(f"vn {x:.6f} {y:.6f} {z:.6f}")
    for u, v in uv:
        lines.append(f"vt {u:.6f} {v:.6f}")
    for a, b, c in idx.reshape(-1, 3) + 1:
        lines.append(f"f {a}/{a}/{a} {b}/{b}/{b} {c}/{c}/{c}")
    OUT_OBJ.write_text("\n".join(lines) + "\n")
    Path("/workspace/public/shinobi.mtl").write_text(
        "newmtl NinjaArt\nKd 1 1 1\nmap_Kd ninja.png\n"
    )
    print("wrote", OUT_OBJ)


def main():
    pos, nrm, uv, idx = build()
    write_glb(pos, nrm, uv, idx)


if __name__ == "__main__":
    main()
