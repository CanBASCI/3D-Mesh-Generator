#!/usr/bin/env python3
"""Strip the baked checkerboard, crop, and write a transparent ninja PNG + depth map."""
from __future__ import annotations

from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

SRC = Path("/workspace/attachments/IMG_9353.jpg")
OUT_DIR = Path("/workspace/public")
OUT_PNG = OUT_DIR / "ninja.png"
OUT_DEPTH = OUT_DIR / "ninja-depth.png"
OUT_PREVIEW = OUT_DIR / "ninja-preview.png"
MAX_EDGE = 1600


def is_checker(rgb: np.ndarray) -> np.ndarray:
    r = rgb[..., 0].astype(np.int16)
    g = rgb[..., 1].astype(np.int16)
    b = rgb[..., 2].astype(np.int16)
    chroma = np.maximum(np.maximum(np.abs(r - g), np.abs(g - b)), np.abs(r - b))
    gray = (r.astype(np.int32) + g + b) / 3.0
    return (chroma <= 24) & (gray >= 165)


def flood_background(bg: np.ndarray) -> np.ndarray:
    h, w = bg.shape
    visited = np.zeros((h, w), dtype=bool)
    q: deque[tuple[int, int]] = deque()

    def seed(y: int, x: int) -> None:
        if bg[y, x] and not visited[y, x]:
            visited[y, x] = True
            q.append((y, x))

    for x in range(w):
        seed(0, x)
        seed(h - 1, x)
    for y in range(h):
        seed(y, 0)
        seed(y, w - 1)

    while q:
        y, x = q.popleft()
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and bg[ny, nx] and not visited[ny, nx]:
                visited[ny, nx] = True
                q.append((ny, nx))
    return visited


def dilate(mask: np.ndarray, r: int = 1) -> np.ndarray:
    out = mask.copy()
    h, w = mask.shape
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dy == 0 and dx == 0:
                continue
            shifted = np.zeros_like(mask)
            y0, y1 = max(0, dy), min(h, h + dy)
            x0, x1 = max(0, dx), min(w, w + dx)
            sy0, sy1 = max(0, -dy), min(h, h - dy)
            sx0, sx1 = max(0, -dx), min(w, w - dx)
            shifted[y0:y1, x0:x1] = mask[sy0:sy1, sx0:sx1]
            out |= shifted
    return out


def erode(mask: np.ndarray, r: int = 1) -> np.ndarray:
    return ~dilate(~mask, r)


def largest_component(fg: np.ndarray) -> np.ndarray:
    h, w = fg.shape
    labels = np.zeros((h, w), dtype=np.int32)
    best_id, best_count, next_id = 0, 0, 1
    for y in range(h):
        row = fg[y]
        for x in range(w):
            if not row[x] or labels[y, x]:
                continue
            q: deque[tuple[int, int]] = deque([(y, x)])
            labels[y, x] = next_id
            count = 0
            while q:
                cy, cx = q.popleft()
                count += 1
                for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < h and 0 <= nx < w and fg[ny, nx] and labels[ny, nx] == 0:
                        labels[ny, nx] = next_id
                        q.append((ny, nx))
            if count > best_count:
                best_count = count
                best_id = next_id
            next_id += 1
    return labels == best_id


def chamfer_distance(fg: np.ndarray) -> np.ndarray:
    h, w = fg.shape
    inf = 1.0e9
    dist = np.where(fg, inf, 0.0).astype(np.float64)
    for y in range(h):
        for x in range(w):
            if not fg[y, x]:
                continue
            best = dist[y, x]
            if x > 0:
                best = min(best, dist[y, x - 1] + 3)
            if y > 0:
                best = min(best, dist[y - 1, x] + 3)
                if x > 0:
                    best = min(best, dist[y - 1, x - 1] + 4)
                if x + 1 < w:
                    best = min(best, dist[y - 1, x + 1] + 4)
            dist[y, x] = best
    for y in range(h - 1, -1, -1):
        for x in range(w - 1, -1, -1):
            if not fg[y, x]:
                continue
            best = dist[y, x]
            if x + 1 < w:
                best = min(best, dist[y, x + 1] + 3)
            if y + 1 < h:
                best = min(best, dist[y + 1, x] + 3)
                if x + 1 < w:
                    best = min(best, dist[y + 1, x + 1] + 4)
                if x > 0:
                    best = min(best, dist[y + 1, x - 1] + 4)
            dist[y, x] = best
    dist[dist >= inf * 0.5] = 0
    return dist / 3.0


def blur(arr: np.ndarray, k: int = 5) -> np.ndarray:
    k = max(1, k | 1)
    pad = k // 2
    padded = np.pad(arr, pad, mode="edge")
    c = np.cumsum(padded, axis=1)
    hsum = c[:, k:] - c[:, :-k]
    c2 = np.cumsum(hsum, axis=0)
    out = c2[k:, :] - c2[:-k, :]
    return out / (k * k)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    im = Image.open(SRC).convert("RGB")
    im.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)
    rgb = np.array(im)
    print("working size", rgb.shape)

    bg = flood_background(is_checker(rgb))
    bg = dilate(bg, 1)
    fg = largest_component(~bg)
    print(f"foreground pixels: {int(fg.sum())} / {fg.size}")

    ys, xs = np.where(fg)
    pad = 12
    h, w = fg.shape
    y0, y1 = max(0, int(ys.min()) - pad), min(h, int(ys.max()) + pad + 1)
    x0, x1 = max(0, int(xs.min()) - pad), min(w, int(xs.max()) + pad + 1)
    rgb = rgb[y0:y1, x0:x1]
    fg = fg[y0:y1, x0:x1]

    rgba = np.dstack([rgb, np.where(fg, 255, 0).astype(np.uint8)])
    edge = fg ^ erode(fg, 1)
    rgba[edge, 3] = 230

    Image.fromarray(rgba, "RGBA").save(OUT_PNG, optimize=True)
    print("wrote", OUT_PNG, rgba.shape)

    # Depth at half-res, then upscale — chamfer is O(pixels) in pure Python.
    small_fg = np.array(
        Image.fromarray(fg.astype(np.uint8) * 255, "L").resize(
            (max(1, fg.shape[1] // 2), max(1, fg.shape[0] // 2)),
            Image.Resampling.NEAREST,
        )
    ) > 127
    dist = chamfer_distance(small_fg)
    if dist.max() > 0:
        depth = dist / dist.max()
        depth = blur(depth, 5)
        depth = np.clip(depth / (depth.max() + 1e-8), 0, 1)
    else:
        depth = np.zeros_like(dist)
    depth_img = Image.fromarray((depth * 255).astype(np.uint8), "L").resize(
        (fg.shape[1], fg.shape[0]), Image.Resampling.BILINEAR
    )
    depth_u8 = np.array(depth_img)
    depth_u8[~fg] = 0
    Image.fromarray(depth_u8, "L").save(OUT_DEPTH, optimize=True)
    print("wrote", OUT_DEPTH, "max dist px", float(dist.max()))

    ph, pw = rgba.shape[:2]
    prev = np.empty((ph, pw, 3), dtype=np.uint8)
    yy, xx = np.indices((ph, pw))
    tile = ((yy // 16) + (xx // 16)) % 2 == 0
    prev[tile] = (210, 210, 210)
    prev[~tile] = (255, 255, 255)
    a = rgba[..., 3:4].astype(np.float32) / 255.0
    prev = (rgba[..., :3].astype(np.float32) * a + prev.astype(np.float32) * (1 - a)).astype(
        np.uint8
    )
    Image.fromarray(prev, "RGB").save(OUT_PREVIEW)
    print("wrote", OUT_PREVIEW)


if __name__ == "__main__":
    main()
