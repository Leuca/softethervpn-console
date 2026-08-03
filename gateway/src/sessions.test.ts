import { describe, expect, it, vi } from 'vitest';
import { SessionCredentials, SessionStore } from './sessions.js';

const credentials: SessionCredentials = {
  host: 'vpn.example.com',
  port: 443,
  hub: 'DEFAULT',
  password: 'secret',
  allowSelfSigned: false,
};

describe('SessionStore', () => {
  it('stores credentials under an opaque random ID', () => {
    const store = new SessionStore({ now: () => 1_000, ttlMs: 5_000 });

    const id = store.create(credentials);

    expect(id).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(store.get(id)).toEqual({ ...credentials, expiresAt: 6_000 });
  });

  it('removes expired sessions when they are read', () => {
    let now = 1_000;
    const store = new SessionStore({ now: () => now, ttlMs: 5_000 });
    const id = store.create(credentials);

    now = 6_000;

    expect(store.get(id)).toBeUndefined();
  });

  it('deletes sessions explicitly', () => {
    const store = new SessionStore();
    const id = store.create(credentials);

    expect(store.delete(id)).toBe(true);
    expect(store.get(id)).toBeUndefined();
  });

  it('removes credentials when the session lifetime elapses without another read', () => {
    vi.useFakeTimers();

    try {
      const store = new SessionStore({ ttlMs: 5_000 });
      const id = store.create(credentials);

      vi.advanceTimersByTime(5_000);

      expect(store.delete(id)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
