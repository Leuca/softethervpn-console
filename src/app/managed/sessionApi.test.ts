import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSession, login, logout, ManagedSessionApiError, ManagedLoginPayload } from './sessionApi';

const jsonResponse = (body: unknown, init?: ResponseInit): Response =>
  new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });

describe('managed session API', () => {
  it('loads the current session', async () => {
    const session = { authenticated: true, host: 'vpn.example.com', port: 443, hub: '' };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(session));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getSession()).resolves.toEqual(session);
    expect(fetchMock).toHaveBeenCalledWith('/session', { credentials: 'same-origin' });
  });

  it('posts login details without keeping the password in the response shape', async () => {
    const payload: ManagedLoginPayload = {
      host: 'vpn.example.com',
      port: 443,
      hub: '',
      password: 'secret',
      allowSelfSigned: true,
    };
    const session = { authenticated: true, host: 'vpn.example.com', port: 443, hub: '' };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(session));
    vi.stubGlobal('fetch', fetchMock);

    await expect(login(payload)).resolves.toEqual(session);
    expect(fetchMock).toHaveBeenCalledWith('/login', {
      credentials: 'same-origin',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    expect(session).not.toHaveProperty('password');
  });

  it('posts logout without a body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(logout()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith('/logout', {
      credentials: 'same-origin',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: undefined,
    });
  });

  it('throws a status-bearing error for failed requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'Login failed' }, { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getSession()).rejects.toMatchObject({
      name: 'ManagedSessionApiError',
      message: 'Login failed',
      status: 401,
    } satisfies Partial<ManagedSessionApiError>);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});
