import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Breadcrumb, BreadcrumbItem, Tab, TabTitleText, Tabs } from '@patternfly/react-core';
import { AppPage } from '@app/components/AppPage';
import { HubStatus } from '@app/Hubs/HubStatus';
import { Users } from '@app/Hubs/Users';
import { Groups } from '@app/Hubs/Groups';
import { AccessList } from '@app/Hubs/AccessList';
import { Properties } from '@app/Hubs/Properties';
import { Radius } from '@app/Hubs/Radius';

/**
 * Management views for a single Virtual Hub, laid out as tabs.
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
            <Properties hub={name} />
          </Tab>
          <Tab eventKey="users" title={<TabTitleText>Users</TabTitleText>}>
            <Users hub={name} />
          </Tab>
          <Tab eventKey="groups" title={<TabTitleText>Groups</TabTitleText>}>
            <Groups hub={name} />
          </Tab>
          <Tab eventKey="accesslist" title={<TabTitleText>Access List</TabTitleText>}>
            <AccessList hub={name} />
          </Tab>
          <Tab eventKey="radius" title={<TabTitleText>RADIUS</TabTitleText>}>
            <Radius hub={name} />
          </Tab>
        </Tabs>
      </AppPage>
    </>
  );
};

export { HubDetail };
