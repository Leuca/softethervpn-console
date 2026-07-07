// The vpnrpc client parses responses with plain JSON.parse, so binary (`*_bin`)
// fields arrive as base64 strings rather than the Uint8Array their TS types
// claim. Values we set locally (e.g. an uploaded certificate) are already
// Uint8Array. Normalize either form to bytes, or null when empty/unreadable.
export const binToBytes = (value: unknown): Uint8Array | null => {
  if (value instanceof Uint8Array) {
    return value.length > 0 ? value : null;
  }
  if (typeof value === 'string' && value.length > 0) {
    try {
      return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
    } catch {
      return null;
    }
  }
  return null;
};

export const b64toBlob = (b64Data: string, contentType = '', sliceSize = 512) => {
  const byteCharacters = atob(b64Data);
  const byteArrays: Uint8Array[] = [];

  for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
    const slice = byteCharacters.slice(offset, offset + sliceSize);

    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }

    const byteArray = new Uint8Array(byteNumbers);
    byteArrays.push(byteArray);
  }

  const blob = new Blob(byteArrays, { type: contentType });
  return blob;
};

export function downloadBlob(blob: Blob, name = 'file.txt') {
  // Convert your blob into a Blob URL (a special url that points to an object in the browser's memory)
  const blobUrl = URL.createObjectURL(blob);

  // Create a link element
  const link = document.createElement('a');

  // Set link's href to point to the Blob URL
  link.href = blobUrl;
  link.download = name;

  // Append link to the body
  document.body.appendChild(link);

  // Dispatch click event on the link
  // This is necessary as link.click() does not work on the latest firefox
  if (typeof (link as HTMLAnchorElement).click === 'function') {
    link.click();
  } else {
    link.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      }),
    );
  }

  // Remove link from body
  document.body.removeChild(link);

  // Clean up the object URL so repeated downloads do not accumulate
  // stale browser references.
  URL.revokeObjectURL(blobUrl);
}
