// Bind once per document so navigation cannot retarget an outstanding RPC or retry.
const selected = new URLSearchParams(window.location.search).get("connection");
const validId = /^[A-Za-z0-9_-]{43}$/;
export const connectionId = selected && validId.test(selected) ? selected : null;
export const connectionPath = (id: string) => {
  if (!validId.test(id)) throw new Error("Invalid managed connection ID.");
  return `/api/connections/${id}`;
};

export const openConnection = (id: string) => {
  connectionPath(id);
  const url = new URL(window.location.href);
  url.searchParams.set("connection", id);
  url.hash = "";
  window.location.replace(url);
};
