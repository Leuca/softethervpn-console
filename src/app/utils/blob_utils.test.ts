import { describe, expect, it } from 'vitest';
import { binToBytes } from './blob_utils';

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
});
