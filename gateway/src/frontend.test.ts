import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildGatewayServer } from './server.js';

describe('managed frontend serving', () => {
  it('serves assets and falls back to the SPA only for frontend navigation', async () => {
    const frontendRoot = await mkdtemp(join(tmpdir(), 'softether-console-'));
    await writeFile(join(frontendRoot, 'index.html'), '<!doctype html><title>Managed console</title>');
    await writeFile(join(frontendRoot, 'asset.txt'), 'managed asset');
    const server = buildGatewayServer({ frontendRoot });

    try {
      const index = await server.inject({ method: 'GET', url: '/' });
      const asset = await server.inject({ method: 'GET', url: '/asset.txt' });
      const navigation = await server.inject({
        method: 'GET',
        url: '/settings/about',
        headers: { accept: 'text/html' },
      });
      const missingApi = await server.inject({
        method: 'GET',
        url: '/api/missing',
        headers: { accept: 'text/html' },
      });
      const missingAsset = await server.inject({ method: 'GET', url: '/missing.js' });

      expect(index.body).toContain('Managed console');
      expect(asset.body).toBe('managed asset');
      expect(navigation.body).toContain('Managed console');
      expect(missingApi.statusCode).toBe(404);
      expect(missingAsset.statusCode).toBe(404);
    } finally {
      await server.close();
      await rm(frontendRoot, { recursive: true, force: true });
    }
  });
});
