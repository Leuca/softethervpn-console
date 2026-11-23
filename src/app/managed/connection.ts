// Bind once per document so navigation cannot retarget an outstanding RPC or retry.
const selected = new URLSearchParams(window.location.search).get("connection");
export const validId = /^[A-Za-z0-9_-]{43}$/;
export const connectionId = selected && validId.test(selected) ? selected : null;
export const connectionPath = (id: string) => {
  if (!validId.test(id)) throw new Error("Invalid managed connection ID.");
  return `/api/connections/${id}`;
};

const positionKey = (id: string) => "softether-vpn-console.position." + id;

export const rememberPosition = (id: string, pathname: string, search: string) => {
  if (!validId.test(id)) return;
  // Only the hub tab is navigation state; never persist arbitrary query parameters.
  const tab = new URLSearchParams(search).get("tab");
  const hash = "#" + pathname + (tab ? "?" + new URLSearchParams({ tab }) : "");
  try {
    sessionStorage.setItem(positionKey(id), hash);
  } catch {
    /* Navigation works without storage. */
  }
};

export const forgetPosition = (id: string) => {
  try {
    sessionStorage.removeItem(positionKey(id));
  } catch {
    /* Storage unavailable. */
  }
};

export const connectionUrl = (id: string | null) => {
  const url = new URL(window.location.href);
  url.hash = "";
  if (id !== null) {
    connectionPath(id);
    url.searchParams.set("connection", id);
    try {
      const position = sessionStorage.getItem(positionKey(id));
      if (position?.startsWith("#/")) url.hash = position;
    } catch {
      /* Use the dashboard. */
    }
  } else {
    url.searchParams.delete("connection");
  }
  return url.href;
};

export const openConnection = (id: string) => window.location.replace(connectionUrl(id));
