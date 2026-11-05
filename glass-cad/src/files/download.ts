// Getting files out of the browser: a temporary link clicked on the user's behalf.

export function downloadUrl(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  downloadUrl(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** A design name made safe for a file name. */
export function fileStem(name: string): string {
  return (name.trim() || 'glass-piece').replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-').toLowerCase().slice(0, 60) || 'glass-piece';
}
