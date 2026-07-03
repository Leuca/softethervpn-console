import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Breadcrumb,
  BreadcrumbItem,
  EmptyState,
  EmptyStateBody,
  Tab,
  TabTitleText,
  Tabs,
} from '@patternfly/react-core';
import { WrenchIcon } from '@patternfly/react-icons';
import { AppPage } from '@app/components/AppPage';
import { HubStatus } from '@app/Hubs/HubStatus';
import { Users } from '@app/Hubs/Users';

const ComingSoon: React.FunctionComponent<{ what: string }> = ({ what }) => (
  <EmptyState titleText={`${what} coming soon`} headingLevel="h2" icon={WrenchIcon}>
    <EmptyStateBody>This view is still being ported. See PORTING.md for progress.</EmptyStateBody>
  </EmptyState>
);

/**
 * Management views for a single Virtual Hub, laid out as tabs. Status is ported;
 * the remaining tabs are placeholders until their views land (see PORTING.md).
 */
const HubDetail: React.FunctionComponent<{ name: string }> = ({ name }) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = React.useState<string>('status');

  return (
    <>
      <Breadcrumb style={{ padding: 'var(--pf-t--global--spacer--md) var(--pf-t--global--spacer--lg) 0' }}>
        <BreadcrumbItem to="#" onClick={() => navigate('/hubs')}>
          Virtual Hubs
        </BreadcrumbItem>
        <BreadcrumbItem isActive>{name}</BreadcrumbItem>
      </Breadcrumb>
      <AppPage title={name} description="Virtual Hub management.">
        <Tabs activeKey={activeTab} onSelect={(_event, key) => setActiveTab(String(key))} mountOnEnter unmountOnExit>
          <Tab eventKey="status" title={<TabTitleText>Status</TabTitleText>}>
            <HubStatus hub={name} />
          </Tab>
          <Tab eventKey="properties" title={<TabTitleText>Properties</TabTitleText>}>
            <ComingSoon what="Properties" />
          </Tab>
          <Tab eventKey="users" title={<TabTitleText>Users</TabTitleText>}>
            <Users hub={name} />
          </Tab>
          <Tab eventKey="groups" title={<TabTitleText>Groups</TabTitleText>}>
            <ComingSoon what="Groups" />
          </Tab>
          <Tab eventKey="accesslist" title={<TabTitleText>Access List</TabTitleText>}>
            <ComingSoon what="Access List" />
          </Tab>
          <Tab eventKey="securitypolicy" title={<TabTitleText>Security Policy</TabTitleText>}>
            <ComingSoon what="Security Policy" />
          </Tab>
          <Tab eventKey="radius" title={<TabTitleText>RADIUS</TabTitleText>}>
            <ComingSoon what="RADIUS" />
          </Tab>
        </Tabs>
      </AppPage>
    </>
  );
};

export { HubDetail };
