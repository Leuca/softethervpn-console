import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, Server } from 'node:https';
import { AddressInfo } from 'node:net';
import { chromium, type Page } from 'playwright-core';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { buildGatewayServer } from './server.js';

it('isolates concurrent first logins and overlapping commands in two fresh browser tabs', async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN || undefined,
    channel: process.env.CHROME_BIN ? undefined : 'chrome',
  });
  const dir = mkdtempSync(join(tmpdir(), 'console-rpc-test-'));
  const gateway = buildGatewayServer();
  const servers: Server[] = [];
  const seen: string[][] = [[], []];
  let probes = 0;
  let bothStarted!: () => void;
  const concurrent = new Promise<void>((resolve) => {
    bothStarted = resolve;
  });
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let arrived!: () => void;
  const received = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  try {
    const keyFile = join(dir, 'key.pem');
    const cert = execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-subj',
        '/CN=localhost',
        '-days',
        '1',
        '-keyout',
        keyFile,
      ],
      { stdio: ['ignore', 'pipe', 'ignore'] },
    );
    for (const log of seen) {
      const server = createServer({ key: readFileSync(keyFile), cert }, async (req, res) => {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const { id } = JSON.parse(Buffer.concat(chunks).toString());
        if (id === 'login-probe') {
          if (++probes === 2) bothStarted();
          await concurrent;
        } else {
          log.push(`${id}:${req.headers['x-vpnadmin-hubname']}`);
          if (id === 'held-A') {
            arrived();
            await held;
          }
        }
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ jsonrpc: '2.0', id, result: {} }));
      });
      servers.push(server);
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
    }
    const origin = await gateway.listen({ host: '127.0.0.1', port: 0 });
    const context = await browser.newContext();
    const [tabA, tabB] = await Promise.all([context.newPage(), context.newPage()]);
    await Promise.all([tabA, tabB].map((tab) => tab.goto(origin + '/healthz')));
    const login = (tab: Page, index: number, hub: string): Promise<string> =>
      tab.evaluate(
        async (payload) => {
          const response = await fetch('/login', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (!response.ok) throw new Error('Login failed: ' + response.status);
          return ((await response.json()) as { connectionId: string }).connectionId;
        },
        {
          host: '127.0.0.1',
          port: (servers[index].address() as AddressInfo).port,
          hub,
          password: 'test-only',
          allowSelfSigned: true,
        },
      );
    const rpc = (tab: Page, url: string, id: string) =>
      tab.evaluate(
        async ({ url, id }) =>
          (
            await fetch(url, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ jsonrpc: '2.0', method: 'SetHub', id, params: {} }),
            })
          ).status,
        { url, id },
      );
    const path = (id: string) => `/api/connections/${id}`;
    const [a, b] = await Promise.all([login(tabA, 0, 'FIRST'), login(tabB, 1, 'SECOND')]);
    expect(a).not.toBe(b);
    for (const [tab, id, index, hub] of [
      [tabA, a, 0, 'FIRST'],
      [tabB, b, 1, 'SECOND'],
    ] as const) {
      expect(
        await tab.evaluate(async (url) => (await fetch(url)).json(), path(id) + '/session'),
      ).toMatchObject({
        authenticated: true,
        connectionId: id,
        port: (servers[index].address() as AddressInfo).port,
        hub,
      });
    }
    const aPath = path(a);
    const pending = rpc(tabA, aPath + '/rpc', 'held-A');
    await received;
    expect(await rpc(tabB, path(b) + '/rpc', 'write-B')).toBe(200);
    expect(await rpc(tabA, aPath + '/rpc', 'stale-tab-A')).toBe(200);
    await tabA.evaluate(
      async (url) => (await fetch(url, { method: 'POST' })).status,
      aPath + '/logout',
    );
    const reconnected = await login(tabA, 0, 'OTHER-HUB');
    expect(reconnected).not.toBe(a);
    expect(await rpc(tabA, aPath + '/rpc', 'revoked')).toBe(401);
    expect(await rpc(tabB, path(b) + '/rpc', 'after-logout')).toBe(200);
    const foreign = await browser.newPage();
    await foreign.goto(origin + '/healthz');
    expect(await rpc(foreign, path(b) + '/rpc', 'foreign')).toBe(401);
    expect(await rpc(tabA, '/api/', 'legacy')).toBe(404);
    release();
    expect(await pending).toBe(200);
    expect(seen).toEqual([
      ['held-A:FIRST', 'stale-tab-A:FIRST'],
      ['write-B:SECOND', 'after-logout:SECOND'],
    ]);
  } finally {
    release();
    bothStarted();
    await browser.close();
    await gateway.close();
    await Promise.all(
      servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
    );
    rmSync(dir, { recursive: true, force: true });
  }
}, 30_000);
