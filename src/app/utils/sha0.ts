// SHA-0 (FIPS 180, the withdrawn predecessor of SHA-1). SoftEther hashes
// cascade/user passwords with it: HashedPassword = SHA0(password +
// UpperCase(username)), ASCII bytes. SHA-0 is identical to SHA-1 except the message
// schedule omits the 1-bit left rotate; WebCrypto does not provide it and the
// vpnrpc client has no helper, so it is implemented here.

const rotl = (x: number, n: number): number => (x << n) | (x >>> (32 - n));

export function sha0(data: Uint8Array): Uint8Array {
  const bitLen = data.length * 8;
  // Pad to a multiple of 64 bytes: 0x80, zeros, then the 64-bit big-endian length.
  const totalLen = (Math.floor((data.length + 8) / 64) + 1) * 64;
  const msg = new Uint8Array(totalLen);
  msg.set(data);
  msg[data.length] = 0x80;
  const dv = new DataView(msg.buffer);
  dv.setUint32(totalLen - 8, Math.floor(bitLen / 0x100000000), false);
  dv.setUint32(totalLen - 4, bitLen >>> 0, false);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);

  for (let off = 0; off < totalLen; off += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = dv.getUint32(off + i * 4, false);
    }
    for (let i = 16; i < 80; i++) {
      // SHA-1 wraps this in rotl(..., 1); SHA-0 does not.
      w[i] = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16];
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let i = 0; i < 80; i++) {
      let f: number;
      let k: number;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const t = (rotl(a, 5) + f + e + k + w[i]) | 0;
      e = d;
      d = c;
      c = rotl(b, 30);
      b = a;
      a = t;
    }

    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
  }

  const out = new Uint8Array(20);
  const odv = new DataView(out.buffer);
  odv.setUint32(0, h0 >>> 0, false);
  odv.setUint32(4, h1 >>> 0, false);
  odv.setUint32(8, h2 >>> 0, false);
  odv.setUint32(12, h3 >>> 0, false);
  odv.setUint32(16, h4 >>> 0, false);
  return out;
}

// The cascade/user password hash SoftEther expects. Per HashPassword() in the
// server source (Cedar/Account.c) the order is SHA0(password + UpperCase(user))
// - password FIRST, then the uppercased username. (The vpnrpc TypeScript
// comment states the reverse order and is wrong; the C source is authoritative.)
// The material is the raw UTF-8 bytes of both strings, and StrUpper
// (Mayaqua/Str.c) only uppercases ASCII a-z, so non-ASCII characters pass
// through unchanged; JS toUpperCase() would diverge from native clients.
export function hashSoftEtherPassword(username: string, password: string): Uint8Array {
  const usernameUpper = username.replace(/[a-z]/g, (c) => c.toUpperCase());
  return sha0(new TextEncoder().encode(password + usernameUpper));
}
