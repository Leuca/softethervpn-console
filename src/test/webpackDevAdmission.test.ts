import { createRequire } from "node:module";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const load = createRequire(import.meta.url);
const configPath = load.resolve("../../webpack.dev.js");

function devServer(host?: string) {
  vi.stubEnv("HOST", host);
  delete load.cache[configPath];
  return load(configPath).devServer;
}

beforeEach(() => {
  vi.spyOn(load("dotenv"), "config").mockReturnValue({});
  vi.stubEnv("VPN_DEV_HOST", "vpn.example.test");
  vi.stubEnv("VPN_DEV_PASSWORD", "");
  vi.stubEnv("VPN_DEV_HUB", "");
});

afterEach(() => {
  delete load.cache[configPath];
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it.each([
  [undefined, "127.0.0.1"],
  ["localhost", "127.0.0.1"],
  ["127.0.0.1", "127.0.0.1"],
  ["::1", "::1"],
])("binds HOST=%s to a literal loopback address", (host, expected) => {
  const config = devServer(host);
  expect(config.host).toBe(expected);
  const server = { options: { host: host ?? config.host } };
  const middlewares: unknown[] = [];
  expect(config.setupMiddlewares(middlewares, server)).toBe(middlewares);
  expect(server.options.host).toBe(expected);
});

const unsafe = [
  "",
  " ",
  "0.0.0.0",
  "::",
  "192.0.2.1",
  "dev.example.test",
  "local-ip",
  "127.1",
  " localhost",
];
it.each(unsafe)("rejects %j in both the environment and effective listener options", (host) => {
  const error = /HOST must be 127\.0\.0\.1, ::1, or localhost/;
  expect(() => devServer(host)).toThrow(error);
  const config = devServer();
  expect(() => config.setupMiddlewares([], { options: { host } })).toThrow(error);
});

it("rejects an IPC listener even with a loopback host", () => {
  const config = devServer();
  const server = { options: { host: config.host, ipc: "fixture.sock" } };
  expect(() => config.setupMiddlewares([], server)).toThrow(/IPC is not supported/);
});
