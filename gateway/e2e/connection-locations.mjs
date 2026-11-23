import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { buildGatewayServer } from '../dist/server.js';

const position = (id) => 'softether-vpn-console.position.' + id;
const saved = (page, id) => page.evaluate((key) => sessionStorage.getItem(key), position(id));

async function pauseNext(page, url) {
  const held = Promise.withResolvers();
  await page.route(url, (route) => held.resolve(route), { times: 1 });
  return { request: held.promise };
}

async function fixture(t) {
  const gateway = buildGatewayServer({
    frontendRoot:
      process.env.FRONTEND_ROOT || fileURLToPath(new URL('../../dist/', import.meta.url)),
    rpcForwarder: async (_session, body) => {
      const { id, method } = JSON.parse(body);
      return {
        statusCode: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id,
          result: method === 'GetCaps' ? { CapsList: [] } : {},
        }),
      };
    },
  });
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN || undefined,
    channel: process.env.CHROME_BIN ? undefined : 'chrome',
  });
  t.after(async () => {
    try {
      await browser.close();
    } finally {
      await gateway.close();
    }
  });
  const origin = await gateway.listen({ host: '127.0.0.1', port: 0 });
  const context = await browser.newContext();
  context.setDefaultTimeout(10000);
  const login = async (port) => {
    const response = await context.request.post(origin + '/login', {
      data: { host: '127.0.0.1', port, hub: '', password: 'fixture', allowSelfSigned: false },
    });
    assert.equal(response.status(), 200);
    return (await response.json()).connectionId;
  };
  const a = await login(443),
    b = await login(5555);
  const visit = async (page, id, hash) => {
    await page.goto(origin + '/?connection=' + id + hash);
    await page.waitForFunction(
      ([key, route]) => sessionStorage.getItem(key) === route,
      [position(id), hash],
    );
  };
  const first = await context.newPage(),
    second = await context.newPage();
  const disconnect = async () => {
    await first.getByRole('button', { name: /Switch connection/ }).click();
    await first.getByRole('menuitem', { name: 'Disconnect this connection' }).click();
    await first.getByRole('button', { name: 'Log in' }).waitFor();
  };
  return { a, b, first, second, visit, disconnect };
}

test('disconnect removes A in both tabs without losing either location for B', async (t) => {
  const { a, b, first, second, visit, disconnect } = await fixture(t);
  const firstB = '#/settings/about',
    secondB = '#/settings/listeners';
  await visit(first, b, firstB);
  await visit(first, a, '#/hubs/FIRST?tab=users');
  await visit(second, a, '#/hubs/SECOND?tab=groups');
  await visit(second, b, secondB);
  await disconnect();
  for (const [page, expectedB] of [
    [first, firstB],
    [second, secondB],
  ]) {
    await page.waitForFunction((key) => sessionStorage.getItem(key) === null, position(a), {
      timeout: 5000,
    });
    assert.equal(await saved(page, b), expectedB);
  }
  assert.equal(
    await second.getByRole('button', { name: /Switch connection: 127\.0\.0\.1:5555/ }).count(),
    1,
  );
});

test('a tab reloading B catches up on the disconnect of A', { timeout: 30000 }, async (t) => {
  const { a, b, first, second, visit, disconnect } = await fixture(t);
  await visit(first, a, '#/settings/about');
  await visit(second, a, '#/hubs/PRIVATE?tab=users');
  await visit(second, b, '#/settings/listeners');
  const held = await pauseNext(second, '**/main.bundle.js');
  await second.reload({ waitUntil: 'commit' });
  const script = await held.request;
  await disconnect();
  await script.continue();
  await second.getByRole('button', { name: /Switch connection: 127\.0\.0\.1:5555/ }).waitFor();
  assert.equal(await saved(second, a), null);
  assert.equal(await saved(second, b), '#/settings/listeners');
});

test('confirmed logout forgets navigation during revalidation', { timeout: 30000 }, async (t) => {
  const { a, b, first, second, visit, disconnect } = await fixture(t);
  await visit(first, a, '#/settings/about');
  await visit(second, b, '#/settings/listeners');
  await visit(second, a, '#/hubs/PRIVATE?tab=groups');
  await second.getByRole('tab', { name: 'Users', exact: true }).waitFor();
  const held = await pauseNext(second, `**/api/connections/${a}/session`);
  await disconnect();
  const check = await held.request;
  await second.getByRole('tab', { name: 'Users', exact: true }).click();
  await second.waitForFunction(
    (key) => sessionStorage.getItem(key) === '#/hubs/PRIVATE?tab=users',
    position(a),
  );
  await check.continue();
  await second.getByRole('button', { name: 'Log in' }).waitFor();
  assert.equal(await saved(second, a), null);
  assert.equal(await saved(second, b), '#/settings/listeners');
});
