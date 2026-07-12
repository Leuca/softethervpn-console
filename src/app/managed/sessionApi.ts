export interface ManagedLoginPayload {
  host: string;
  port: number;
  hub: string;
  password: string;
  allowSelfSigned: boolean;
}

export type ManagedSession =
  | {
      authenticated: false;
    }
  | {
      authenticated: true;
      host: string;
      port: number;
      hub: string;
    };

export class ManagedSessionApiError extends Error {
  public readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ManagedSessionApiError';
    this.status = status;
  }
}

const parseResponse = async <T>(response: Response): Promise<T> => {
  const text = await response.text();
  const body = text ? JSON.parse(text) : undefined;

  if (!response.ok) {
    const message =
      body && typeof body.error === 'string' ? body.error : `Managed session request failed (${response.status})`;
    throw new ManagedSessionApiError(message, response.status);
  }

  return body as T;
};

const requestJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...init,
  });

  return parseResponse<T>(response);
};

const postJson = <T>(path: string, body?: unknown): Promise<T> =>
  requestJson<T>(
    path,
    body === undefined
      ? { method: 'POST' }
      : {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
  );

export const getSession = (): Promise<ManagedSession> => requestJson<ManagedSession>('/session');

export const login = (payload: ManagedLoginPayload): Promise<ManagedSession> => postJson<ManagedSession>('/login', payload);

export const logout = (): Promise<void> => postJson<void>('/logout');
