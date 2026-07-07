import * as React from 'react';
import { Button, EmptyState, EmptyStateBody, EmptyStateFooter, PageSection } from '@patternfly/react-core';
import { ExclamationCircleIcon } from '@patternfly/react-icons';
import { useLocation, useNavigate } from 'react-router-dom';

interface PermissionState {
  requestedPath?: string;
  reason?: string | null;
}

const PermissionNotice: React.FunctionComponent = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const state = (location.state as PermissionState | null) ?? {};

  return (
    <PageSection hasBodyWrapper={false}>
      <EmptyState titleText="Permission required" variant="full" icon={ExclamationCircleIcon}>
        <EmptyStateBody>
          You do not have permission to access this page.
          {state.requestedPath ? ` (attempted: ${state.requestedPath})` : ''}
          {state.reason ? `\n${state.reason}.` : ''} Please switch to a session with higher privileges and try again.
        </EmptyStateBody>
        <EmptyStateFooter>
          <Button onClick={() => navigate('/')}>Take me home</Button>
          <Button variant="link" onClick={() => navigate(-1)}>
            Go back
          </Button>
          <Button variant="plain" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </EmptyStateFooter>
      </EmptyState>
    </PageSection>
  );
};

export { PermissionNotice };
