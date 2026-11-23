import { randomBytes } from 'node:crypto';

const DEFAULT_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const DEFAULT_MAX_SESSIONS = 128;

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
  maxSessions?: number;
  ttlMs?: number;
  now?: () => number;
}

export class SessionCapacityError extends Error {}

export class SessionStore {
  private readonly expiryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly sessions = new Map<string, { owner: string; session: GatewaySession }>();
  private readonly maxSessions: number;
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(options: SessionStoreOptions = {}) {
    this.maxSessions = options.maxSessions ?? DEFAULT_MAX_SESSIONS;
    this.ttlMs = options.ttlMs ?? DEFAULT_SESSION_TTL_MS;
    this.now = options.now ?? Date.now;

    if (!Number.isSafeInteger(this.maxSessions) || this.maxSessions <= 0) {
      throw new Error('Maximum live sessions must be a positive integer.');
    }
    if (!Number.isFinite(this.ttlMs) || this.ttlMs <= 0) {
      throw new Error('Session TTL must be a positive number.');
    }
  }

  create(credentials: SessionCredentials) {
    const now = this.now();
    if (this.sessions.size >= this.maxSessions) {
      // An expired record's timer may not have run yet.
      for (const [id, { session }] of this.sessions) {
        if (session.expiresAt <= now) this.delete(id);
      }
      if (this.sessions.size >= this.maxSessions) {
        throw new SessionCapacityError('Gateway session limit reached. Try again later.');
      }
    }
    const owner = randomBytes(32).toString('base64url');
    const id = randomBytes(32).toString('base64url');

    this.sessions.set(id, {
      owner,
      session: { ...credentials, expiresAt: now + this.ttlMs },
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
