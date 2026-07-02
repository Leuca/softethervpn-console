import * as React from 'react';
import { EmptyState, EmptyStateBody, PageSection } from '@patternfly/react-core';
import { WrenchIcon } from '@patternfly/react-icons';

// Placeholder for the pages of the original softethervpn-web-console
// that have not been ported to PatternFly 6 yet.
const UnderConstruction: React.FunctionComponent<{ pageName: string }> = ({ pageName }) => (
  <PageSection>
    <EmptyState titleText={pageName} headingLevel="h1" icon={WrenchIcon}>
      <EmptyStateBody>
        This page has not been ported from the original console yet.
      </EmptyStateBody>
    </EmptyState>
  </PageSection>
);

export { UnderConstruction };
