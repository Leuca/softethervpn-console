import * as React from 'react';
import '@patternfly/react-core/dist/styles/base.css';
import { HashRouter as Router } from 'react-router-dom';
import { Bullseye, Spinner } from '@patternfly/react-core';
import { AppLayout } from '@app/AppLayout/AppLayout';
import { AppRoutes } from '@app/routes';
import { ServerProvider, useServer } from '@app/ServerContext';
import '@app/theme-dark-chrome.css';
import '@app/app.css';

const LoadingPage: React.FunctionComponent = () => (
  <Bullseye>
    <Spinner size="xl" />
  </Bullseye>
);

// Wait for the server probes (admin level, caps, cluster mode, ...) before
// rendering the layout, so the navigation only shows what applies to this server.
const AppShell: React.FunctionComponent = () => {
  const { loading } = useServer();

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
  <Router>
    <ServerProvider>
      <AppShell />
    </ServerProvider>
  </Router>
);

export default App;
