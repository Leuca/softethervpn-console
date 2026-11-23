import { describe, expect, it, vi } from 'vitest';
import { SessionCapacityError, SessionCredentials, SessionStore } from './sessions.js';

const credentials: SessionCredentials = {
  host: 'vpn.example.com',
  port: 443,
  hub: 'DEFAULT',
  password: 'secret',
  allowSelfSigned: false,
  resolvedAddresses: [{ address: '192.0.2.10', family: 4 }],
};

describe('SessionStore', () => {
  it.each([0, 1.5, Infinity])('rejects invalid session capacity %s', (maxSessions) => {
    expect(() => new SessionStore({ maxSessions })).toThrow('positive integer');
  });

  it('preserves a live slot and reuses it after expiry or revocation', () => {
    vi.useFakeTimers();
    let now = 0;
    const store = new SessionStore({ maxSessions: 1, now: () => now, ttlMs: 100 });
    try {
      const first = store.create(credentials);
      expect(() => store.create(credentials)).toThrow(SessionCapacityError);
      expect(store.owned(first.owner, first.id)?.expiresAt).toBe(100);
      expect(vi.getTimerCount()).toBe(1);

      now = 100; // Leave the expiry timer pending.
      const second = store.create(credentials);
      expect(store.delete(first.id)).toBe(false);
      expect(vi.getTimerCount()).toBe(1);
      expect(store.delete(second.id)).toBe(true);
      const third = store.create(credentials);
      expect(store.owned(third.owner, third.id)?.expiresAt).toBe(200);
    } finally {
      store.clear();
      vi.useRealTimers();
    }
  });

  it('stores credentials under an opaque random ID', () => {
    const store = new SessionStore({ now: () => 1_000, ttlMs: 5_000 });

    const { id } = store.create(credentials);

    expect(id).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(store.get(id)).toEqual({ ...credentials, expiresAt: 6_000 });
  });

  it('removes expired sessions when they are read', () => {
    let now = 1_000;
    const store = new SessionStore({ now: () => now, ttlMs: 5_000 });
    const { id } = store.create(credentials);

    now = 6_000;

    expect(store.get(id)).toBeUndefined();
  });

  it('deletes sessions explicitly', () => {
    const store = new SessionStore();
    const { id } = store.create(credentials);

    expect(store.delete(id)).toBe(true);
    expect(store.get(id)).toBeUndefined();
  });

  it('expires one connection without transferring it to another login', () => {
    let now = 0;
    const store = new SessionStore({ now: () => now, ttlMs: 100 });
    const a = store.create(credentials);
    now = 50;
    const b = store.create({ ...credentials, hub: 'SECOND' });
    now = 100;
    expect(store.owned(a.owner, a.id)).toBeUndefined();
    expect(store.owned(a.owner, b.id)).toBeUndefined();
    expect(store.owned(b.owner, b.id)?.hub).toBe('SECOND');
    expect(store.owned(b.id, b.id)).toBeUndefined();
    store.clear();
  });

  it('clears every session and expiry timer during shutdown', () => {
    vi.useFakeTimers();

    try {
      const store = new SessionStore({ ttlMs: 5_000 });
      const { id: firstId } = store.create(credentials);
      const { id: secondId } = store.create({ ...credentials, password: 'another-secret' });

      store.clear();

      expect(store.get(firstId)).toBeUndefined();
      expect(store.get(secondId)).toBeUndefined();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('removes credentials when the session lifetime elapses without another read', () => {
    vi.useFakeTimers();

    try {
      const store = new SessionStore({ ttlMs: 5_000 });
      const { id } = store.create(credentials);

      vi.advanceTimersByTime(5_000);

      expect(store.delete(id)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
