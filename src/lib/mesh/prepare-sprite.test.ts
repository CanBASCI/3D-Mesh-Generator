import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cropOpaque,
  depthFromSilhouette,
  hasUsefulAlpha,
  punchBackground,
  prepareSprite,
} from "./prepare-sprite.ts";
import { createRgba, type RgbaImage } from "./rgba.ts";

function paintRect(img: RgbaImage, x0: number, y0: number, x1: number, y1: number, rgba: number[]) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * img.width + x) * 4;
      img.data[i] = rgba[0]!;
      img.data[i + 1] = rgba[1]!;
      img.data[i + 2] = rgba[2]!;
      img.data[i + 3] = rgba[3]!;
    }
  }
}

describe("prepare-sprite", () => {
  it("keeps existing alpha instead of punching", () => {
    const img = createRgba(8, 8, 0);
    paintRect(img, 2, 2, 6, 6, [200, 20, 20, 255]);
    assert.equal(hasUsefulAlpha(img), true);
    const punched = punchBackground(img);
    assert.equal(punched.data[3], 0);
    assert.equal(punched.data[(2 * 8 + 2) * 4 + 3], 255);
  });

  it("floods a solid white background from the edges", () => {
    const img = createRgba(16, 16);
    paintRect(img, 0, 0, 16, 16, [255, 255, 255, 255]);
    paintRect(img, 4, 4, 12, 12, [30, 80, 200, 255]);
    const punched = punchBackground(img);
    assert.equal(punched.data[3], 0);
    assert.ok((punched.data[(8 * 16 + 8) * 4 + 3] ?? 0) > 200);
  });

  it("crops to the opaque bounds with padding", () => {
    const img = createRgba(20, 20);
    paintRect(img, 8, 8, 12, 12, [10, 10, 10, 255]);
    const cropped = cropOpaque(img, 2);
    assert.equal(cropped.width, 8);
    assert.equal(cropped.height, 8);
  });

  it("puts more depth in the silhouette interior", () => {
    const img = createRgba(24, 24);
    paintRect(img, 4, 4, 20, 20, [40, 40, 40, 255]);
    const depth = depthFromSilhouette(img);
    const edge = depth.data[(4 * 24 + 4) * 4] ?? 0;
    const center = depth.data[(12 * 24 + 12) * 4] ?? 0;
    assert.ok(center > edge);
    assert.equal(depth.data[3], 0);
  });

  it("builds a sprite from a white-backed figure", () => {
    const img = createRgba(32, 32);
    paintRect(img, 0, 0, 32, 32, [250, 250, 250, 255]);
    paintRect(img, 10, 6, 22, 28, [180, 40, 40, 255]);
    const { color, depth } = prepareSprite(img);
    assert.ok(color.width <= 32);
    assert.ok(color.height <= 32);
    let opaque = 0;
    for (let i = 3; i < color.data.length; i += 4) if (color.data[i]! > 40) opaque++;
    assert.ok(opaque > 50);
    const mid = ((color.height >> 1) * color.width + (color.width >> 1)) * 4;
    assert.ok((depth.data[mid] ?? 0) > 10);
  });
});
