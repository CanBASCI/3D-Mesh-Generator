import { cloneRgba, createRgba, type RgbaImage } from "./rgba.ts";

const MAX_EDGE = 1024;
const ALPHA_CUT = 40;

export function prepareSprite(src: RgbaImage): { color: RgbaImage; depth: RgbaImage } {
  const sized = scaleToMaxEdge(src, MAX_EDGE);
  const punched = punchBackground(sized);
  const fg = largestOpaque(punched);
  applyMask(punched, fg);
  const color = cropOpaque(punched, 12);
  if (opaqueCount(color) < 24) {
    throw new Error("Görselde figür bulunamadı.");
  }
  const depth = depthFromSilhouette(color);
  return { color, depth };
}

export function scaleToMaxEdge(src: RgbaImage, maxEdge: number): RgbaImage {
  const edge = Math.max(src.width, src.height);
  if (edge <= maxEdge) return cloneRgba(src);
  const scale = maxEdge / edge;
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));
  const out = createRgba(w, h);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(src.height - 1, Math.floor((y + 0.5) / scale));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(src.width - 1, Math.floor((x + 0.5) / scale));
      const si = (sy * src.width + sx) * 4;
      const di = (y * w + x) * 4;
      out.data[di] = src.data[si]!;
      out.data[di + 1] = src.data[si + 1]!;
      out.data[di + 2] = src.data[si + 2]!;
      out.data[di + 3] = src.data[si + 3]!;
    }
  }
  return out;
}

export function hasUsefulAlpha(img: RgbaImage): boolean {
  let clear = 0;
  let solid = 0;
  const { data } = img;
  for (let i = 3; i < data.length; i += 4) {
    const a = data[i]!;
    if (a < ALPHA_CUT) clear++;
    else if (a > 200) solid++;
  }
  const n = img.width * img.height;
  return clear > n * 0.02 && solid > n * 0.02;
}

export function punchBackground(src: RgbaImage): RgbaImage {
  const img = cloneRgba(src);
  if (hasUsefulAlpha(img)) return img;

  const { width: w, height: h, data } = img;
  const n = w * h;
  const visited = new Uint8Array(n);
  const q = new Int32Array(n);
  let qs = 0;
  let qe = 0;

  const checkerMode = edgeLooksLikeChecker(img);

  const seed = (x: number, y: number) => {
    const i = y * w + x;
    if (visited[i]) return;
    if (checkerMode && !isCheckerPixel(data, i * 4)) return;
    visited[i] = 1;
    q[qe++] = i;
  };

  for (let x = 0; x < w; x++) {
    seed(x, 0);
    seed(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    seed(0, y);
    seed(w - 1, y);
  }

  const thresh = checkerMode ? 54 : 42;
  while (qs < qe) {
    const i = q[qs++]!;
    const x = i % w;
    const y = (i - x) / w;
    const ia = i * 4;
    const tryN = (nx: number, ny: number) => {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) return;
      const j = ny * w + nx;
      if (visited[j]) return;
      const ja = j * 4;
      if (checkerMode) {
        if (!isCheckerPixel(data, ja) && colorDist(data, ia, ja) > thresh) return;
      } else if (colorDist(data, ia, ja) > thresh) {
        return;
      }
      visited[j] = 1;
      q[qe++] = j;
    };
    tryN(x + 1, y);
    tryN(x - 1, y);
    tryN(x, y + 1);
    tryN(x, y - 1);
  }

  const removed = visited.reduce((a, b) => a + b, 0);
  if (removed < n * 0.04 || removed > n * 0.92) return img;

  for (let i = 0; i < n; i++) {
    if (visited[i]) data[i * 4 + 3] = 0;
  }
  return img;
}

export function largestOpaque(img: RgbaImage): Uint8Array {
  const { width: w, height: h, data } = img;
  const n = w * h;
  const labels = new Int32Array(n);
  const q = new Int32Array(n);
  let bestId = 0;
  let bestCount = 0;
  let nextId = 1;

  for (let i = 0; i < n; i++) {
    if ((data[i * 4 + 3] ?? 0) < ALPHA_CUT || labels[i]) continue;
    let qs = 0;
    let qe = 0;
    labels[i] = nextId;
    q[qe++] = i;
    let count = 0;
    while (qs < qe) {
      const cur = q[qs++]!;
      count++;
      const x = cur % w;
      const y = (cur - x) / w;
      const visit = (nx: number, ny: number) => {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) return;
        const j = ny * w + nx;
        if (labels[j]) return;
        if ((data[j * 4 + 3] ?? 0) < ALPHA_CUT) return;
        labels[j] = nextId;
        q[qe++] = j;
      };
      visit(x + 1, y);
      visit(x - 1, y);
      visit(x, y + 1);
      visit(x, y - 1);
    }
    if (count > bestCount) {
      bestCount = count;
      bestId = nextId;
    }
    nextId++;
  }

  const mask = new Uint8Array(n);
  if (!bestId) return mask;
  for (let i = 0; i < n; i++) if (labels[i] === bestId) mask[i] = 1;
  return mask;
}

function applyMask(img: RgbaImage, mask: Uint8Array) {
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) img.data[i * 4 + 3] = 0;
  }
}

export function cropOpaque(img: RgbaImage, pad: number): RgbaImage {
  const { width: w, height: h, data } = img;
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if ((data[(y * w + x) * 4 + 3] ?? 0) < ALPHA_CUT) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return cloneRgba(img);
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad);
  maxY = Math.min(h - 1, maxY + pad);
  const nw = maxX - minX + 1;
  const nh = maxY - minY + 1;
  const out = createRgba(nw, nh);
  for (let y = 0; y < nh; y++) {
    const srcOff = ((minY + y) * w + minX) * 4;
    out.data.set(data.subarray(srcOff, srcOff + nw * 4), y * nw * 4);
  }
  return out;
}

export function depthFromSilhouette(img: RgbaImage): RgbaImage {
  const { width: w, height: h, data } = img;
  const fg = new Uint8Array(w * h);
  for (let i = 0; i < fg.length; i++) fg[i] = (data[i * 4 + 3] ?? 0) >= ALPHA_CUT ? 1 : 0;

  const step = Math.max(1, Math.round(Math.max(w, h) / 512));
  const sw = Math.max(1, Math.floor(w / step));
  const sh = Math.max(1, Math.floor(h / step));
  const small = new Uint8Array(sw * sh);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      small[y * sw + x] = fg[Math.min(h - 1, y * step) * w + Math.min(w - 1, x * step)]!;
    }
  }

  const dist = chamfer(small, sw, sh);
  let max = 0;
  for (let i = 0; i < dist.length; i++) if (dist[i]! > max) max = dist[i]!;
  const out = createRgba(w, h);
  if (max <= 0) return out;

  for (let y = 0; y < h; y++) {
    const sy = Math.min(sh - 1, Math.floor(y / step));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(sw - 1, Math.floor(x / step));
      const di = (y * w + x) * 4;
      if (!fg[y * w + x]) continue;
      const t = Math.pow(dist[sy * sw + sx]! / max, 0.72);
      const v = Math.round(t * 255);
      out.data[di] = v;
      out.data[di + 1] = v;
      out.data[di + 2] = v;
      out.data[di + 3] = 255;
    }
  }
  return out;
}

function chamfer(fg: Uint8Array, w: number, h: number): Float32Array {
  const inf = 1e9;
  const dist = new Float32Array(w * h);
  for (let i = 0; i < fg.length; i++) dist[i] = fg[i] ? inf : 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!fg[i]) continue;
      let best = dist[i]!;
      if (x > 0) best = Math.min(best, dist[i - 1]! + 3);
      if (y > 0) {
        best = Math.min(best, dist[i - w]! + 3);
        if (x > 0) best = Math.min(best, dist[i - w - 1]! + 4);
        if (x + 1 < w) best = Math.min(best, dist[i - w + 1]! + 4);
      }
      dist[i] = best;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!fg[i]) continue;
      let best = dist[i]!;
      if (x + 1 < w) best = Math.min(best, dist[i + 1]! + 3);
      if (y + 1 < h) {
        best = Math.min(best, dist[i + w]! + 3);
        if (x + 1 < w) best = Math.min(best, dist[i + w + 1]! + 4);
        if (x > 0) best = Math.min(best, dist[i + w - 1]! + 4);
      }
      dist[i] = best;
    }
  }
  for (let i = 0; i < dist.length; i++) {
    if (dist[i]! >= inf * 0.5) dist[i] = 0;
    else dist[i] = dist[i]! / 3;
  }
  return dist;
}

function opaqueCount(img: RgbaImage): number {
  let n = 0;
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i]! >= ALPHA_CUT) n++;
  return n;
}

function isCheckerPixel(data: Uint8ClampedArray, i: number): boolean {
  const r = data[i]!;
  const g = data[i + 1]!;
  const b = data[i + 2]!;
  const chroma = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
  const gray = (r + g + b) / 3;
  return chroma <= 24 && gray >= 165;
}

function edgeLooksLikeChecker(img: RgbaImage): boolean {
  const { width: w, height: h, data } = img;
  let hits = 0;
  let total = 0;
  const sample = (x: number, y: number) => {
    total++;
    if (isCheckerPixel(data, (y * w + x) * 4)) hits++;
  };
  for (let x = 0; x < w; x += 2) {
    sample(x, 0);
    sample(x, h - 1);
  }
  for (let y = 0; y < h; y += 2) {
    sample(0, y);
    sample(w - 1, y);
  }
  return total > 0 && hits / total > 0.45;
}

function colorDist(data: Uint8ClampedArray, a: number, b: number): number {
  return (
    Math.abs(data[a]! - data[b]!) +
    Math.abs(data[a + 1]! - data[b + 1]!) +
    Math.abs(data[a + 2]! - data[b + 2]!)
  );
}
