// Bind once per document so navigation cannot retarget an outstanding RPC or retry.
const selected = new URLSearchParams(window.location.search).get("connection");
export const validId = /^[A-Za-z0-9_-]{43}$/;
export const connectionId = selected && validId.test(selected) ? selected : null;
export const connectionPath = (id: string) => {
  if (!validId.test(id)) throw new Error("Invalid managed connection ID.");
  return `/api/connections/${id}`;
};

export const connectionUrl = (id: string | null) => {
  const url = new URL(window.location.href);
  if (id !== null) {
    connectionPath(id);
    url.searchParams.set("connection", id);
  } else {
    url.searchParams.delete("connection");
  }
  url.hash = "";
  return url.href;
};

export const openConnection = (id: string) => window.location.replace(connectionUrl(id));
