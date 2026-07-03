import * as React from 'react';
import { EmptyState, EmptyStateBody } from '@patternfly/react-core';
import { WrenchIcon } from '@patternfly/react-icons';
import { AppPage } from '@app/components/AppPage';

// Placeholder for the pages of the original softethervpn-web-console
// that have not been ported to PatternFly 6 yet.
const UnderConstruction: React.FunctionComponent<{ pageName: string }> = ({ pageName }) => (
  <AppPage title={pageName}>
    <EmptyState titleText="Not ported yet" headingLevel="h2" icon={WrenchIcon}>
      <EmptyStateBody>
        This page has not been ported from the original console yet.
      </EmptyStateBody>
    </EmptyState>
  </AppPage>
);

export { UnderConstruction };
