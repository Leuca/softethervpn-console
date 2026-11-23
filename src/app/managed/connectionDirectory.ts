import { forgetPosition, positionPrefix, validId } from "./connection";
import { getSession, ManagedSession } from "./sessionApi";

export type Connection = Extract<ManagedSession, { authenticated: true }>;
export const directoryPrefix = "softether-vpn-console.connection.";

export const forgetUnindexedPositions = () => {
  try {
    for (const key of Object.keys(sessionStorage)) {
      if (!key.startsWith(positionPrefix)) continue;
      const id = key.slice(positionPrefix.length);
      if (validId.test(id) && localStorage.getItem(directoryPrefix + id) === null) {
        forgetPosition(id);
      }
    }
  } catch {
    // An unreadable directory is not evidence that a connection was removed.
  }
};

// One key per ID avoids lost updates between tabs. Labels and credentials stay out of storage.
export const indexConnection = (id: string, active: boolean) => {
  if (!validId.test(id)) return;
  if (!active) forgetPosition(id);
  try {
    if (active) localStorage.setItem(directoryPrefix + id, "1");
    else localStorage.removeItem(directoryPrefix + id);
  } catch {
    // Direct connection URLs still work when browser storage is unavailable.
  }
};

export const knownIds = (): string[] => {
  try {
    return Object.keys(localStorage)
      .filter((key) => key.startsWith(directoryPrefix))
      .map((key) => key.slice(directoryPrefix.length))
      .filter((id) => validId.test(id));
  } catch {
    return [];
  }
};

export const listConnections = async (currentId?: string, onExpired?: () => void) => {
  let unavailable = false;
  const ids = new Set(knownIds());
  if (currentId) ids.add(currentId);
  const results = await Promise.all(
    Array.from(ids, async (id) => {
      try {
        const session = await getSession(id);
        if (session.authenticated === false) {
          indexConnection(id, false);
          if (id === currentId) onExpired?.();
        } else if (session.authenticated === true && session.connectionId === id) {
          return session;
        } else {
          unavailable = true;
        }
      } catch {
        unavailable = true;
      }
      return null;
    }),
  );
  return {
    connections: results
      .filter((s): s is Connection => s !== null)
      .sort(
        (a, b) =>
          a.host.localeCompare(b.host) ||
          a.port - b.port ||
          a.hub.localeCompare(b.hub) ||
          a.connectionId.localeCompare(b.connectionId),
      ),
    unavailable,
  };
};
