import { cellPosition, type SampleGrid } from "./sample";

export type BuiltMesh = {
  position: Float32Array;
  normal: Float32Array;
  uv: Float32Array;
  color: Float32Array;
  index: Uint32Array;
};

type Mut = {
  pos: number[];
  nrm: number[];
  uv: number[];
  col: number[];
  idx: number[];
};

function pushV(
  m: Mut,
  x: number,
  y: number,
  z: number,
  nx: number,
  ny: number,
  nz: number,
  u: number,
  v: number,
  r: number,
  g: number,
  b: number,
) {
  m.pos.push(x, y, z);
  m.nrm.push(nx, ny, nz);
  m.uv.push(u, v);
  m.col.push(r, g, b);
}

function finish(m: Mut): BuiltMesh {
  return {
    position: new Float32Array(m.pos),
    normal: new Float32Array(m.nrm),
    uv: new Float32Array(m.uv),
    color: new Float32Array(m.col),
    index: Uint32Array.from(m.idx),
  };
}

export function buildInflatedMesh(grid: SampleGrid, puff: number): BuiltMesh {
  const { cols, rows, solid, color, u, v } = grid;
  const m: Mut = { pos: [], nrm: [], uv: [], col: [], idx: [] };
  const frontOf = new Int32Array(cols * rows).fill(-1);
  const backOf = new Int32Array(cols * rows).fill(-1);

  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const di = j * cols + i;
      if (!solid[di]) continue;
      const [x, y, z] = cellPosition(grid, i, j, puff);
      const r = color[di * 3] ?? 0.08;
      const g = color[di * 3 + 1] ?? 0.08;
      const b = color[di * 3 + 2] ?? 0.08;
      const uu = u[di] ?? 0.5;
      const vv = v[di] ?? 0.5;
      frontOf[di] = m.pos.length / 3;
      pushV(m, x, y, z, 0, 0, 1, uu, vv, r, g, b);
      backOf[di] = m.pos.length / 3;
      // Back UVs pin to a dark torso texel so the face never shows through.
      pushV(m, x, y, -z, 0, 0, -1, 0.5, 0.42, 0.07, 0.07, 0.08);
    }
  }

  const quad = (a: number, b: number, c: number, d: number) => {
    m.idx.push(a, c, b, b, c, d);
  };

  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      if (solid[a] && solid[b] && solid[c] && solid[d]) {
        quad(frontOf[a]!, frontOf[b]!, frontOf[c]!, frontOf[d]!);
        quad(backOf[b]!, backOf[a]!, backOf[d]!, backOf[c]!);
      } else {
        const fs = [frontOf[a]!, frontOf[b]!, frontOf[d]!, frontOf[c]!];
        const bs = [backOf[a]!, backOf[b]!, backOf[d]!, backOf[c]!];
        const on = [!!solid[a], !!solid[b], !!solid[d], !!solid[c]];
        const live: number[] = [];
        const liveB: number[] = [];
        for (let k = 0; k < 4; k++) {
          if (on[k]) {
            live.push(fs[k]!);
            liveB.push(bs[k]!);
          }
        }
        if (live.length === 3) {
          m.idx.push(live[0]!, live[2]!, live[1]!);
          m.idx.push(liveB[0]!, liveB[1]!, liveB[2]!);
        }
      }
    }
  }

  const rim = (i0: number, j0: number, i1: number, j1: number, nx: number, ny: number) => {
    const a = j0 * cols + i0;
    const b = j1 * cols + i1;
    if (!solid[a] || !solid[b]) return;
    const fa = frontOf[a]!;
    const fb = frontOf[b]!;
    const ba = backOf[a]!;
    const bb = backOf[b]!;
    const base = m.pos.length / 3;
    const take = (src: number, nx_: number, ny_: number, nz_: number) => {
      pushV(
        m,
        m.pos[src * 3]!,
        m.pos[src * 3 + 1]!,
        m.pos[src * 3 + 2]!,
        nx_,
        ny_,
        nz_,
        0.5,
        0.42,
        0.05,
        0.05,
        0.06,
      );
    };
    take(fa, nx, ny, 0);
    take(fb, nx, ny, 0);
    take(ba, nx, ny, 0);
    take(bb, nx, ny, 0);
    m.idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  };

  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      if (!solid[j * cols + i]) continue;
      if (i + 1 < cols && solid[j * cols + i + 1]) {
        const upMissing = j === 0 || !solid[(j - 1) * cols + i] || !solid[(j - 1) * cols + i + 1];
        const dnMissing = j === rows - 1 || !solid[(j + 1) * cols + i] || !solid[(j + 1) * cols + i + 1];
        if (upMissing) rim(i, j, i + 1, j, 0, 1);
        if (dnMissing) rim(i + 1, j, i, j, 0, -1);
      }
      if (j + 1 < rows && solid[(j + 1) * cols + i]) {
        const lfMissing = i === 0 || !solid[j * cols + i - 1] || !solid[(j + 1) * cols + i - 1];
        const rtMissing = i === cols - 1 || !solid[j * cols + i + 1] || !solid[(j + 1) * cols + i + 1];
        if (rtMissing) rim(i, j, i, j + 1, 1, 0);
        if (lfMissing) rim(i, j + 1, i, j, -1, 0);
      }
    }
  }

  return finish(m);
}
