const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 2400;
const WEBP_QUALITY = 0.9;
const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export async function prepareImage(file: File) {
  if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
    throw new Error("Obsługiwane formaty zdjęć to JPG, PNG i WebP.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Zdjęcie nie może być większe niż 10 MB.");
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(
    1,
    MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height),
  );
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("Nie udało się przygotować zdjęcia.");
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) =>
        result
          ? resolve(result)
          : reject(new Error("Konwersja nie powiodła się.")),
      "image/webp",
      WEBP_QUALITY,
    );
  });
  const baseName = file.name.replace(/\.[^.]+$/, "") || "zdjecie";
  return {
    file: new File([blob], `${baseName}.webp`, { type: "image/webp" }),
    width,
    height,
  };
}
