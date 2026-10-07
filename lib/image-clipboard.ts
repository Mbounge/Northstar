/** Start the browser clipboard write in the user's gesture, while image loading continues. */
export function writeImageToClipboard(
  url: string,
  richCopy?: { html: string; text: string },
): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    throw new Error("Image clipboard access is unavailable in this browser.");
  }
  const entries: Record<string, Blob | Promise<Blob>> = {
    "image/png": imageUrlToPng(url),
  };
  if (richCopy) {
    entries["text/html"] = new Blob([richCopy.html], { type: "text/html" });
    entries["text/plain"] = new Blob([richCopy.text], { type: "text/plain" });
  }
  return navigator.clipboard.write([new ClipboardItem(entries)]);
}

async function imageUrlToPng(url: string): Promise<Blob> {
  const response = await fetch(url, { mode: "cors" });
  if (!response.ok) throw new Error(`Image fetch failed: ${response.status}`);
  const blob = await response.blob();
  if (blob.type === "image/png") return blob;

  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image conversion is unavailable.");
    context.drawImage(bitmap, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((png) => png ? resolve(png) : reject(new Error("PNG conversion failed.")), "image/png");
    });
  } finally {
    bitmap.close();
  }
}
