const DEFAULT_ATTEMPT_LIMIT = 10;
const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_CLIENTS = 10_000;

interface LoginRateLimiterOptions {
  attemptLimit?: number;
  maxClients?: number;
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
    this.now = options.now ?? Date.now;
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

  retryAfterSeconds(client: string): number | undefined {
    const now = this.now();
    const attempt = this.attempts.get(client);

    if (!attempt) {
      return undefined;
    }
    if (attempt.expiresAt <= now) {
      this.attempts.delete(client);
      return undefined;
    }
    if (attempt.attempts < this.attemptLimit) {
      return undefined;
    }

    return Math.max(1, Math.ceil((attempt.expiresAt - now) / 1000));
  }

  recordAttempt(client: string): void {
    const now = this.now();
    const attempt = this.attempts.get(client);

    if (attempt && attempt.expiresAt > now) {
      attempt.attempts += 1;
      return;
    }

    if (!attempt && this.attempts.size >= this.maxClients) {
      const oldestClient = this.attempts.keys().next().value;
      if (oldestClient !== undefined) {
        this.attempts.delete(oldestClient);
      }
    }

    this.attempts.set(client, { attempts: 1, expiresAt: now + this.windowMs });
  }
}
