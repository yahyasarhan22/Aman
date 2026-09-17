/**
 * Spec §9: compress to max 1600px / ~200KB before storing.
 *
 * Re-encoding through a canvas is also what strips EXIF — the decoded pixels
 * are all that survives, so GPS coordinates and camera identifiers never reach
 * the wire. The server strips again on upload; this is the belt, that's the
 * braces.
 */
const MAX_EDGE = 1600;
const TARGET_BYTES = 200 * 1024;
const QUALITY_STEPS = [0.82, 0.7, 0.58, 0.45];

export async function compressPhoto(file: File | Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  let output: Blob | null = null;
  for (const quality of QUALITY_STEPS) {
    output = await toBlob(canvas, quality);
    if (output && output.size <= TARGET_BYTES) return output;
  }
  if (!output) throw new Error('encode failed');
  return output;
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

export function objectUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}
