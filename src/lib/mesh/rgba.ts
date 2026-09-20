export type RgbaImage = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

export function createRgba(width: number, height: number, fill = 0): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  if (fill) data.fill(fill);
  return { data, width, height };
}

export function cloneRgba(src: RgbaImage): RgbaImage {
  return { data: new Uint8ClampedArray(src.data), width: src.width, height: src.height };
}

export function toImageData(img: RgbaImage): ImageData {
  const copy = new Uint8ClampedArray(img.data);
  return new ImageData(copy as unknown as ImageDataArray, img.width, img.height);
}

export function fromImageData(img: ImageData): RgbaImage {
  return { data: new Uint8ClampedArray(img.data), width: img.width, height: img.height };
}

export function pixel(img: RgbaImage, x: number, y: number): number {
  return (y * img.width + x) * 4;
}
