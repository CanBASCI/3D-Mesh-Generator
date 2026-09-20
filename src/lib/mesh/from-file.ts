import type { RgbaImage } from "./rgba.ts";

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|bmp|svg|avif|heic|heif|tif{1,2})$/i;

export function isImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  return IMAGE_EXT.test(file.name);
}

export function pickImageFile(files: ArrayLike<File> | null | undefined): File | null {
  if (!files || files.length === 0) return null;
  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    if (isImageFile(file)) return file;
  }
  return null;
}

export function fileStem(name: string): string {
  const base = name.replace(/^.*[/\\]/, "").replace(/\.[^.]+$/, "");
  const clean = base.replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "");
  return clean.slice(0, 48) || "figure";
}

export async function imageDataFromFile(file: File): Promise<RgbaImage> {
  if (!isImageFile(file)) throw new Error("Bu dosya bir görsel değil.");
  const bitmap = await decodeBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas desteklenmiyor");
  ctx.drawImage(bitmap, 0, 0);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  bitmap.close();
  return { data: img.data, width: img.width, height: img.height };
}

async function decodeBitmap(file: File): Promise<ImageBitmap> {
  const svg = file.type.includes("svg") || /\.svg$/i.test(file.name);
  if (!svg) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // HEIC / odd types: fall through to HTMLImageElement
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return await createImageBitmap(image);
  } catch {
    throw new Error("Görsel okunamadı.");
  } finally {
    URL.revokeObjectURL(url);
  }
}
