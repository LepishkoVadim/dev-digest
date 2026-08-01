/** base64-encode an ArrayBuffer (browser btoa is Latin-1 only, so chunk bytes). */
export function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000; // avoid arg-length limits on String.fromCharCode
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function isZip(fileName: string): boolean {
  return /\.zip$/i.test(fileName);
}
