import { afterEach, describe, expect, it, vi } from 'vitest';
import { binToBytes, downloadBlob } from './blob_utils';

describe('binToBytes', () => {
  it('decodes a base64 string (the RPC representation) to bytes', () => {
    // "hello" in base64
    const bytes = binToBytes('aGVsbG8=');
    expect(bytes).toEqual(new Uint8Array([104, 101, 108, 108, 111]));
  });

  it('passes through a non-empty Uint8Array (a locally staged value)', () => {
    const input = new Uint8Array([1, 2, 3]);
    expect(binToBytes(input)).toBe(input);
  });

  it('returns null for empty, missing or non-binary values', () => {
    expect(binToBytes('')).toBeNull();
    expect(binToBytes(new Uint8Array())).toBeNull();
    expect(binToBytes(null)).toBeNull();
    expect(binToBytes(undefined)).toBeNull();
  });

  it('revokes blob URLs after dispatching a download link', () => {
    const blob = new Blob(['hello'], { type: 'text/plain' });
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const appendChild = vi.spyOn(document.body, 'appendChild');
    const removeChild = vi.spyOn(document.body, 'removeChild');

    downloadBlob(blob, 'payload.txt');

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(appendChild).toHaveBeenCalled();
    expect(removeChild).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test');
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
