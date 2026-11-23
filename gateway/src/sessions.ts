import { randomBytes } from 'node:crypto';

const DEFAULT_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export interface LoginCredentials {
  host: string;
  port: number;
  hub: string;
  password: string;
  allowSelfSigned: boolean;
}

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

export interface SessionCredentials extends LoginCredentials {
  resolvedAddresses: ResolvedAddress[];
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
  private readonly sessions = new Map<string, { owner: string; session: GatewaySession }>();
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(options: SessionStoreOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_SESSION_TTL_MS;
    this.now = options.now ?? Date.now;

    if (!Number.isFinite(this.ttlMs) || this.ttlMs <= 0) {
      throw new Error('Session TTL must be a positive number.');
    }
  }

  create(credentials: SessionCredentials) {
    const owner = randomBytes(32).toString('base64url');
    const id = randomBytes(32).toString('base64url');

    this.sessions.set(id, {
      owner,
      session: { ...credentials, expiresAt: this.now() + this.ttlMs },
    });

    const expiryTimer = setTimeout(() => {
      this.delete(id);
    }, this.ttlMs);
    expiryTimer.unref();
    this.expiryTimers.set(id, expiryTimer);

    return { owner, id };
  }

  owned(owner: string | undefined, id: string): GatewaySession | undefined {
    return owner && this.sessions.get(id)?.owner === owner ? this.get(id) : undefined;
  }

  get(id: string): GatewaySession | undefined {
    const session = this.sessions.get(id)?.session;

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

  clear(): void {
    for (const expiryTimer of this.expiryTimers.values()) {
      clearTimeout(expiryTimer);
    }
    this.expiryTimers.clear();
    this.sessions.clear();
  }
}
