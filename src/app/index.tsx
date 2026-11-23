import * as React from "react";
import "@patternfly/react-core/dist/styles/base.css";
import { createHashRouter, useLocation } from "react-router-dom";
import { Bullseye, Spinner } from "@patternfly/react-core";
import { AppLayout } from "@app/AppLayout/AppLayout";
import { AppRoutes } from "@app/routes";
import { ServerProvider, useServer } from "@app/ServerContext";
import { consoleMode } from "@app/consoleMode";
import { ManagedSessionGate, useManagedSession } from "@app/managed/ManagedSessionGate";
import { rememberPosition } from "@app/managed/connection";
import { RouteDraftGuard } from "@app/managed/RouteDraftGuard";
import { PendingDraftsProvider } from "@app/managed/pendingDrafts";
import { ThemeProvider } from "@app/ThemeContext";
import "@app/app.css";

const LoadingPage: React.FunctionComponent = () => (
  <Bullseye>
    <Spinner size="xl" aria-label="Loading server information" />
  </Bullseye>
);

// Wait for the server probes (admin level, caps, cluster mode, ...) before
// rendering the layout, so the navigation only shows what applies to this server.
const AppShell: React.FunctionComponent = () => {
  const { loading } = useServer();
  const session = useManagedSession();
  const id = session?.current.connectionId;
  const { pathname, search } = useLocation();
  React.useLayoutEffect(() => {
    if (id) rememberPosition(id, pathname, search);
  }, [id, pathname, search]);

  return loading ? (
    <LoadingPage />
  ) : (
    <AppLayout>
      <AppRoutes />
    </AppLayout>
  );
};

// HashRouter: the console is served from a subpath of the VPN server's
// embedded web server, which cannot rewrite arbitrary paths to index.html.
const App: React.FunctionComponent = () => (
  <ThemeProvider>
    <PendingDraftsProvider>
      <RouteDraftGuard />
      {consoleMode === "managed" ? (
        <ManagedSessionGate>
          <ServerProvider>
            <AppShell />
          </ServerProvider>
        </ManagedSessionGate>
      ) : (
        <ServerProvider>
          <AppShell />
        </ServerProvider>
      )}
    </PendingDraftsProvider>
  </ThemeProvider>
);

export const createConsoleRouter = () => createHashRouter([{ path: "*", element: <App /> }]);
