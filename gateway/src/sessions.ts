import { randomBytes } from 'node:crypto';

const DEFAULT_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export interface SessionCredentials {
  host: string;
  port: number;
  hub: string;
  password: string;
  allowSelfSigned: boolean;
}

export interface GatewaySession extends SessionCredentials {
  expiresAt: number;
}

interface SessionStoreOptions {
  ttlMs?: number;
  now?: () => number;
}

export class SessionStore {
  private readonly expiryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly sessions = new Map<string, GatewaySession>();
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(options: SessionStoreOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_SESSION_TTL_MS;
    this.now = options.now ?? Date.now;

    if (!Number.isFinite(this.ttlMs) || this.ttlMs <= 0) {
      throw new Error('Session TTL must be a positive number.');
    }
  }

  create(credentials: SessionCredentials): string {
    const id = randomBytes(32).toString('base64url');

    this.sessions.set(id, {
      ...credentials,
      expiresAt: this.now() + this.ttlMs,
    });

    const expiryTimer = setTimeout(() => {
      this.expiryTimers.delete(id);
      this.sessions.delete(id);
    }, this.ttlMs);
    expiryTimer.unref();
    this.expiryTimers.set(id, expiryTimer);

    return id;
  }

  get(id: string): GatewaySession | undefined {
    const session = this.sessions.get(id);

    if (session && session.expiresAt <= this.now()) {
      this.delete(id);
      return undefined;
    }

    return session;
  }

  delete(id: string): boolean {
    const expiryTimer = this.expiryTimers.get(id);
    if (expiryTimer) {
      clearTimeout(expiryTimer);
      this.expiryTimers.delete(id);
    }
    return this.sessions.delete(id);
  }
}
