import { afterEach, expect, it, vi } from "vitest";
import * as VPN from "vpnrpc/dist/vpnrpc";

vi.mock("@app/consoleMode", () => ({ consoleMode: "managed" }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  window.history.replaceState(null, "", "/");
});

it("keeps generated methods and read retries bound to the original document connection", async () => {
  const a = "a".repeat(43);
  const b = "b".repeat(43);
  window.history.replaceState(null, "", `/?connection=${a}`);
  const { api, createManagedRpc } = await import("./vpnrpc_settings");
  const urls: string[] = [];
  const other = createManagedRpc(b);
  vi.spyOn(VPN.JsonRpcClient.prototype, "CallAsync").mockImplementation(async function (
    this: VPN.JsonRpcClient,
  ) {
    urls.push(this.BaseUrl);
    if (urls.length === 1) {
      window.history.replaceState(null, "", `/?connection=${b}`);
      await other.CallAsync("SetHub", {});
      throw new TypeError("Failed to fetch");
    }
    return {};
  });
  await api.GetServerInfo();
  expect(urls).toEqual([a, b, a].map((id) => `/api/connections/${id}/rpc`));
  await expect(createManagedRpc(null).GetServerInfo()).rejects.toThrow("No managed connection");
});
