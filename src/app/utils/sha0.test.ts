import { describe, expect, it } from 'vitest';
import { hashSoftEtherPassword, sha0 } from './sha0';

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

const ascii = (s: string): Uint8Array => {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    out[i] = s.charCodeAt(i);
  }
  return out;
};

describe('sha0', () => {
  // Published FIPS-180 SHA-0 test vectors.
  it('hashes "abc"', () => {
    expect(toHex(sha0(ascii('abc')))).toBe('0164b8a914cd2a5e74c4f7ff082c4d97f1edf880');
  });

  it('hashes the empty string', () => {
    expect(toHex(sha0(ascii('')))).toBe('f96cea198ad1dd5617ac084a3d92c6107708c0ef');
  });

  it('hashes the 448-bit multi-block vector', () => {
    expect(toHex(sha0(ascii('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')))).toBe(
      'd2516ee1acfa5baf33dfc1c471e438449ef134c8',
    );
  });

  it('hashes password then uppercased username (SoftEther HashPassword scheme)', () => {
    // Cedar/Account.c HashPassword: SHA0(password + UpperCase(username))
    expect(toHex(hashSoftEtherPassword('Alice', 'secret'))).toBe(toHex(sha0(ascii('secretALICE'))));
  });

  it('hashes non-ASCII credentials as UTF-8 bytes', () => {
    // Native HashPassword consumes the raw char* bytes, UTF-8 on the wire.
    expect(toHex(hashSoftEtherPassword('user', 'p\u00e4ssw\u00f6rd'))).toBe(
      toHex(sha0(new TextEncoder().encode('p\u00e4ssw\u00f6rdUSER'))),
    );
  });

  it('uppercases only ASCII letters in the username, like native StrUpper', () => {
    // Mayaqua/Str.c ToUpper only maps a-z; e-acute must pass through as-is,
    // where JS toUpperCase() would map it to E-acute and diverge.
    expect(toHex(hashSoftEtherPassword('caf\u00e9', 'secret'))).toBe(
      toHex(sha0(new TextEncoder().encode('secretCAF\u00e9'))),
    );
  });
});
