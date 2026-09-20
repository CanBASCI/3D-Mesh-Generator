import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fileStem, isImageFile, pickImageFile } from "./from-file.ts";

describe("from-file helpers", () => {
  it("accepts image mime and extensions", () => {
    assert.equal(isImageFile(new File([], "hero.png", { type: "image/png" })), true);
    assert.equal(isImageFile(new File([], "shot.JPG", { type: "" })), true);
    assert.equal(isImageFile(new File([], "notes.txt", { type: "text/plain" })), false);
  });

  it("picks the first image from a mixed drop", () => {
    const picked = pickImageFile([
      new File([], "readme.md", { type: "text/markdown" }),
      new File([], "char.webp", { type: "image/webp" }),
    ]);
    assert.equal(picked?.name, "char.webp");
  });

  it("sanitizes download stems", () => {
    assert.equal(fileStem("My Ninja!!.png"), "My-Ninja");
    assert.equal(fileStem(""), "figure");
  });
});
