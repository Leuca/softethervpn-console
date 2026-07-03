import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Breadcrumb, BreadcrumbItem, EmptyState, EmptyStateBody } from '@patternfly/react-core';
import { WrenchIcon } from '@patternfly/react-icons';
import { AppPage } from '@app/components/AppPage';

/**
 * Placeholder for a single hub's management views (status, properties, users,
 * groups, access lists, ...). The list and lifecycle actions are ported; the
 * per-hub subviews land in follow-up commits. See PORTING.md.
 */
const HubDetail: React.FunctionComponent<{ name: string }> = ({ name }) => {
  const navigate = useNavigate();

  return (
    <>
      <Breadcrumb style={{ padding: 'var(--pf-t--global--spacer--md) var(--pf-t--global--spacer--lg) 0' }}>
        <BreadcrumbItem to="#" onClick={() => navigate('/hubs')}>
          Virtual Hubs
        </BreadcrumbItem>
        <BreadcrumbItem isActive>{name}</BreadcrumbItem>
      </Breadcrumb>
      <AppPage title={name} description="Virtual Hub management.">
        <EmptyState titleText="Management coming soon" headingLevel="h2" icon={WrenchIcon}>
          <EmptyStateBody>
            The per-hub views (status, properties, users, groups and access lists) are still being ported. See
            PORTING.md for progress.
          </EmptyStateBody>
        </EmptyState>
      </AppPage>
    </>
  );
};

export { HubDetail };
