import * as React from "react";
import { useBlocker } from "react-router-dom";
import { DiscardDialog, useHasPendingDrafts } from "./pendingDrafts";

export function RouteDraftGuard() {
  const pending = useHasPendingDrafts();
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search) &&
      pending(),
  );
  return blocker.state === "blocked" ? (
    <DiscardDialog stay={blocker.reset} discard={blocker.proceed} />
  ) : null;
}
