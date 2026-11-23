// Import the vpnrpc.ts RPC stub.
import * as VPN from "vpnrpc/dist/vpnrpc";
import { consoleMode } from "@app/consoleMode";
import { connectionId, connectionPath } from "@app/managed/connection";

// Output JSON-RPC request / reply strings to the debug console.
VPN.VpnServerRpc.SetDebugMode(process.env.NODE_ENV === "development");

const isTransientLoadFailure = (error: unknown): boolean => {
  const message = String(error);
  return (
    message === "TypeError: Load failed" ||
    message === "TypeError: Failed to fetch" ||
    message === "TypeError: NetworkError when attempting to fetch resource."
  );
};

const canRetryRpcMethod = (method: string): boolean =>
  /^(Get|Enum|Is|Read|Check|Test|Query|List|Download|GetLinkStatus$)/.test(method);

const retryTransientLoadFailure = <T>(method: string, request: () => Promise<T>): Promise<T> =>
  request().catch((error) => {
    if (!canRetryRpcMethod(method) || !isTransientLoadFailure(error)) {
      throw error;
    }

    return request();
  });

export const createManagedRpc = (id: string | null): VPN.VpnServerRpc => {
  const stub = new VPN.VpnServerRpc();
  const transport = id ? new VPN.JsonRpcClient(`${connectionPath(id)}/rpc`, {}, true, false) : null;
  stub.CallAsync = (method, params) => {
    if (!transport) return Promise.reject(new Error("No managed connection selected."));
    return transport.CallAsync(method, params);
  };
  return stub;
};

const client = consoleMode === "managed" ? createManagedRpc(connectionId) : new VPN.VpnServerRpc();
export const api = new Proxy(client, {
  get(target, property, receiver) {
    const value = Reflect.get(target, property, receiver);

    if (typeof value !== "function") {
      return value;
    }

    return (...args: unknown[]) =>
      retryTransientLoadFailure(String(property), () => value.apply(target, args));
  },
}) as VPN.VpnServerRpc;
