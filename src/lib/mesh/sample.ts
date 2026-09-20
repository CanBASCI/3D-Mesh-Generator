export type SampleGrid = {
  cols: number;
  rows: number;
  worldW: number;
  worldH: number;
  minI: number;
  maxI: number;
  minJ: number;
  maxJ: number;
  solid: Uint8Array;
  depth: Float32Array;
  color: Float32Array;
  u: Float32Array;
  v: Float32Array;
};

const WORLD_H = 1.72;

export function sampleImages(
  color: ImageData,
  depth: ImageData,
  targetCols = 168,
): SampleGrid {
  const step = Math.max(1, Math.round(color.width / targetCols));
  const cols = Math.max(8, Math.floor(color.width / step));
  const rows = Math.max(8, Math.floor(color.height / step));
  const solid = new Uint8Array(cols * rows);
  const depthArr = new Float32Array(cols * rows);
  const colorArr = new Float32Array(cols * rows * 3);
  const u = new Float32Array(cols * rows);
  const v = new Float32Array(cols * rows);

  let minI = cols;
  let maxI = 0;
  let minJ = rows;
  let maxJ = 0;

  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const sx = Math.min(color.width - 1, i * step + Math.floor(step / 2));
      const sy = Math.min(color.height - 1, j * step + Math.floor(step / 2));
      const idx = (sy * color.width + sx) * 4;
      const a = color.data[idx + 3] ?? 0;
      const di = j * cols + i;
      u[di] = sx / Math.max(1, color.width - 1);
      v[di] = 1 - sy / Math.max(1, color.height - 1);
      if (a < 40) continue;
      solid[di] = 1;
      colorArr[di * 3] = (color.data[idx] ?? 0) / 255;
      colorArr[di * 3 + 1] = (color.data[idx + 1] ?? 0) / 255;
      colorArr[di * 3 + 2] = (color.data[idx + 2] ?? 0) / 255;
      const dIdx = (sy * depth.width + sx) * 4;
      depthArr[di] = (depth.data[dIdx] ?? 0) / 255;
      if (i < minI) minI = i;
      if (i > maxI) maxI = i;
      if (j < minJ) minJ = j;
      if (j > maxJ) maxJ = j;
    }
  }

  const spanJ = Math.max(1, maxJ - minJ);
  const spanI = Math.max(1, maxI - minI);
  const worldH = WORLD_H;
  const worldW = worldH * (spanI / spanJ);

  return {
    cols,
    rows,
    worldW,
    worldH,
    minI,
    maxI,
    minJ,
    maxJ,
    solid,
    depth: depthArr,
    color: colorArr,
    u,
    v,
  };
}

export function cellPosition(
  grid: SampleGrid,
  i: number,
  j: number,
  puff: number,
): [number, number, number] {
  const { worldW, worldH, depth, cols, minI, maxI, minJ, maxJ } = grid;
  const spanJ = Math.max(1, maxJ - minJ);
  const midI = (minI + maxI) / 2;
  const x = ((i - midI) / spanJ) * worldH;
  const y = ((maxJ - j) / spanJ) * worldH;
  const d = Math.pow(depth[j * cols + i] ?? 0, 0.82);
  const z = d * puff * worldH * 0.2 + 0.016;
  void worldW;
  return [x, y, z];
}
