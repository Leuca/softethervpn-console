import { describe, expect, it } from 'vitest';
import { LoginRateLimiter } from './loginRateLimit.js';

describe('LoginRateLimiter', () => {
  it('refuses new clients at capacity without changing either live quota', () => {
    let now = 0;
    const limiter = new LoginRateLimiter({
      attemptLimit: 2,
      maxClients: 2,
      windowMs: 2500,
      now: () => now,
    });

    expect(limiter.tryRecordAttempt('first')).toBeUndefined();
    expect(limiter.tryRecordAttempt('first')).toBeUndefined();
    now = 1000;
    expect(limiter.tryRecordAttempt('second')).toBeUndefined();
    expect(limiter.tryRecordAttempt('third')).toBe(2);
    expect(limiter.tryRecordAttempt('first')).toBe(2);
    expect(limiter.tryRecordAttempt('second')).toBeUndefined();

    now = 2499;
    expect(limiter.tryRecordAttempt('third')).toBe(1);
    now = 2500;
    expect(limiter.tryRecordAttempt('third')).toBeUndefined();
    expect(limiter.tryRecordAttempt('second')).toBe(1);
    expect(limiter.tryRecordAttempt('first')).toBe(1);
  });

  it('reclaims the earliest expiry even after an older client renews', () => {
    let now = 0;
    const limiter = new LoginRateLimiter({
      attemptLimit: 1,
      maxClients: 2,
      windowMs: 3000,
      now: () => now,
    });

    expect(limiter.tryRecordAttempt('first')).toBeUndefined();
    now = 1000;
    expect(limiter.tryRecordAttempt('second')).toBeUndefined();
    now = 3000;
    expect(limiter.tryRecordAttempt('first')).toBeUndefined();
    expect(limiter.tryRecordAttempt('third')).toBe(1);
    now = 4000;
    expect(limiter.tryRecordAttempt('third')).toBeUndefined();
    expect(limiter.tryRecordAttempt('first')).toBe(2);
  });
});
