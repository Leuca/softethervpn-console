import { execFileSync } from "node:child_process";
import { mkdtempSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";

it.each([undefined, "vpn.example.test"])("verifies the HTTPS upstream for %s", (host) => {
  // dotenv resolves .env from cwd. Keep both the directory and the child environment isolated.
  const cwd = mkdtempSync(join(tmpdir(), "dev-proxy-tls-"));
  try {
    const options = execFileSync(
      process.execPath,
      [
        "-p",
        "JSON.stringify(require(process.argv[1]).devServer.proxy.find(p => p.context.includes('/api')))",
        resolve("webpack.dev.js"),
      ],
      { cwd, env: host ? { VPN_DEV_HOST: host } : {}, encoding: "utf8" },
    );
    expect(JSON.parse(options)).toMatchObject({
      target: `https://${host ?? "127.0.0.1"}:5555`,
      secure: true,
    });
  } finally {
    rmdirSync(cwd);
  }
});
