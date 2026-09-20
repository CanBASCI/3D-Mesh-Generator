import { cellPosition, type SampleGrid } from "./sample";

export type VoxelInstance = {
  count: number;
  matrices: Float32Array;
  colors: Float32Array;
};

export function buildVoxelInstances(grid: SampleGrid, puff: number): VoxelInstance {
  const { cols, rows, solid, color, worldW, worldH } = grid;
  const cellW = worldW / cols;
  const cellH = worldH / rows;
  let count = 0;
  for (let i = 0; i < solid.length; i++) if (solid[i]) count++;

  const matrices = new Float32Array(count * 16);
  const colors = new Float32Array(count * 3);
  const tmp = identity();
  let n = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const di = j * cols + i;
      if (!solid[di]) continue;
      const [x, y, z] = cellPosition(grid, i, j, puff);
      const depthZ = Math.max(z, cellW * 0.6);
      compose(tmp, x, y, 0, cellW * 0.94, cellH * 0.94, depthZ * 2);
      matrices.set(tmp, n * 16);
      colors[n * 3] = color[di * 3] ?? 0.08;
      colors[n * 3 + 1] = color[di * 3 + 1] ?? 0.08;
      colors[n * 3 + 2] = color[di * 3 + 2] ?? 0.08;
      n++;
    }
  }
  return { count: n, matrices, colors };
}

function identity(): Float32Array {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

function compose(
  out: Float32Array,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
) {
  out[0] = sx;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = sy;
  out[6] = 0;
  out[7] = 0;
  out[8] = 0;
  out[9] = 0;
  out[10] = sz;
  out[11] = 0;
  out[12] = x;
  out[13] = y;
  out[14] = z;
  out[15] = 1;
}
