import { describe, expect, it } from 'vitest';
import { dirtyValueEqual, recordChanged } from './dirty';

const bytesB64 = (bytes: number[]): string => btoa(String.fromCharCode(...bytes));

describe('dirty value comparison', () => {
  it('compares binary fields after normalizing base64 and byte arrays', () => {
    expect(dirtyValueEqual('Cert_bin', bytesB64([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
    expect(dirtyValueEqual('Cert_bin', bytesB64([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
  });

  it('compares date fields by timestamp', () => {
    expect(dirtyValueEqual('Expires_dt', '2026-07-05T12:00:00.000Z', new Date('2026-07-05T12:00:00.000Z'))).toBe(true);
    expect(dirtyValueEqual('Expires_dt', '2026-07-05T12:00:00.000Z', new Date('2026-07-05T12:00:01.000Z'))).toBe(false);
  });

  it('compares numeric rpc fields by value', () => {
    expect(dirtyValueEqual('policy:MaxConnection_u32', '1', 1)).toBe(true);
    expect(dirtyValueEqual('policy:MaxConnection_u32', undefined, 0)).toBe(true);
    expect(dirtyValueEqual('policy:MaxConnection_u32', '1', 2)).toBe(false);
  });

  it('detects when a record is changed or restored', () => {
    const original = { Name_str: 'alice', Note_utf: '', Cert_bin: bytesB64([1, 2]) };

    expect(recordChanged(original, { ...original })).toBe(false);
    expect(recordChanged(original, { ...original, Note_utf: 'changed' })).toBe(true);
    expect(recordChanged(original, { ...original, Cert_bin: new Uint8Array([1, 2]) })).toBe(false);
  });
});
