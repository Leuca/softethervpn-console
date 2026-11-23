const DEFAULT_ATTEMPT_LIMIT = 10;
const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_CLIENTS = 10_000;

interface LoginRateLimiterOptions {
  attemptLimit?: number;
  maxClients?: number;
  // Monotonic milliseconds keep fixed-window expiries in insertion order.
  now?: () => number;
  windowMs?: number;
}

interface AttemptWindow {
  attempts: number;
  expiresAt: number;
}

export class LoginRateLimiter {
  private readonly attempts = new Map<string, AttemptWindow>();
  private readonly attemptLimit: number;
  private readonly maxClients: number;
  private readonly now: () => number;
  private readonly windowMs: number;

  constructor(options: LoginRateLimiterOptions = {}) {
    this.attemptLimit = options.attemptLimit ?? DEFAULT_ATTEMPT_LIMIT;
    this.maxClients = options.maxClients ?? DEFAULT_MAX_CLIENTS;
    this.now = options.now ?? (() => performance.now());
    this.windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;

    if (!Number.isInteger(this.attemptLimit) || this.attemptLimit <= 0) {
      throw new Error('Login attempt limit must be a positive integer.');
    }
    if (!Number.isInteger(this.maxClients) || this.maxClients <= 0) {
      throw new Error('Maximum tracked login clients must be a positive integer.');
    }
    if (!Number.isFinite(this.windowMs) || this.windowMs <= 0) {
      throw new Error('Login attempt window must be a positive number.');
    }
  }

  // Admit and count the attempt, or return the wait in whole seconds.
  tryRecordAttempt(client: string): number | undefined {
    const now = this.now();
    const attempt = this.attempts.get(client);

    if (attempt && attempt.expiresAt > now) {
      if (attempt.attempts >= this.attemptLimit) {
        return Math.ceil((attempt.expiresAt - now) / 1000);
      }
      attempt.attempts += 1;
      return undefined;
    }

    // Reinsert renewed windows at the end so insertion order stays in expiry order.
    if (attempt) {
      this.attempts.delete(client);
    } else if (this.attempts.size >= this.maxClients) {
      const [oldestClient, oldest] = this.attempts.entries().next().value!;
      if (oldest.expiresAt > now) {
        return Math.ceil((oldest.expiresAt - now) / 1000);
      }
      this.attempts.delete(oldestClient);
    }

    this.attempts.set(client, { attempts: 1, expiresAt: now + this.windowMs });
    return undefined;
  }
}
