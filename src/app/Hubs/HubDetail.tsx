import * as React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Breadcrumb, BreadcrumbItem, Tab, TabTitleText, Tabs } from '@patternfly/react-core';
import { AppPage } from '@app/components/AppPage';
import { HubStatus } from '@app/Hubs/HubStatus';
import { Sessions } from '@app/Hubs/Sessions';
import { Cascade } from '@app/Hubs/Cascade';
import { Users } from '@app/Hubs/Users';
import { Groups } from '@app/Hubs/Groups';
import { AccessList } from '@app/Hubs/AccessList';
import { Properties } from '@app/Hubs/Properties';
import { Radius } from '@app/Hubs/Radius';
import { HubCertificates } from '@app/Hubs/HubCertificates';
import { SecureNAT } from '@app/Hubs/SecureNAT';
import { HubLogs } from '@app/Hubs/HubLogs';
import { HubTables } from '@app/Hubs/HubTables';
import { useServer } from '@app/ServerContext';

/**
 * Management views for a single Virtual Hub, laid out as tabs.
 */
const hubTabKeys = new Set([
  'status',
  'sessions',
  'tables',
  'cascade',
  'properties',
  'users',
  'groups',
  'accesslist',
  'securenat',
  'certificates',
  'logs',
  'radius',
]);

const HubDetail: React.FunctionComponent<{ name: string }> = ({ name }) => {
  const { hideNonCluster } = useServer();
  const activeTabRef = React.useRef<HTMLButtonElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab = tabParam && hubTabKeys.has(tabParam) && !(hideNonCluster && tabParam === 'securenat')
    ? tabParam
    : 'status';
  const selectedTabRef = (key: string) => (activeTab === key ? activeTabRef : undefined);

  const selectTab = (_event: React.MouseEvent<HTMLElement>, key: string | number) => {
    const nextTab = String(key);
    const nextParams = new URLSearchParams(searchParams);

    if (nextTab === 'status') {
      nextParams.delete('tab');
    } else {
      nextParams.set('tab', nextTab);
    }

    setSearchParams(nextParams, { replace: true });
  };

  React.useLayoutEffect(() => {
    let frame = 0;
    let observer: ResizeObserver | null = null;
    const timers: number[] = [];

    const reveal = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const tabList = document.querySelector<HTMLElement>('#hub-detail-tabs > .pf-v6-c-tabs__list');
        const activeTabItem = tabList
          ?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
          ?.closest<HTMLElement>('li');

        if (!activeTabItem || !tabList) {
          return;
        }

        const centeredPosition = activeTabItem.offsetLeft - (tabList.clientWidth - activeTabItem.offsetWidth) / 2;
        const maximumPosition = tabList.scrollWidth - tabList.clientWidth;
        tabList.scrollLeft = Math.max(0, Math.min(centeredPosition, maximumPosition));
      });
    };

    reveal();
    timers.push(window.setTimeout(reveal, 100), window.setTimeout(reveal, 250));

    const tabList = document.querySelector<HTMLElement>('#hub-detail-tabs > .pf-v6-c-tabs__list');
    if (tabList && window.ResizeObserver) {
      observer = new ResizeObserver(reveal);
      observer.observe(tabList);
    }

    return () => {
      window.cancelAnimationFrame(frame);
      timers.forEach((timer) => window.clearTimeout(timer));
      observer?.disconnect();
    };
  }, [activeTab, name]);

  return (
    <>
      <Breadcrumb style={{ padding: 'var(--pf-t--global--spacer--md) var(--pf-t--global--spacer--lg) 0' }}>
        <BreadcrumbItem
          render={({ className, ariaCurrent }) => (
            <Link to="/" className={className} aria-current={ariaCurrent}>
              Dashboard
            </Link>
          )}
        />
        <BreadcrumbItem
          render={({ className, ariaCurrent }) => (
            <Link to="/hubs" className={className} aria-current={ariaCurrent}>
              Virtual Hubs
            </Link>
          )}
        />
        <BreadcrumbItem isActive>{name}</BreadcrumbItem>
      </Breadcrumb>
      <AppPage title={name} description="Virtual Hub management.">
        <Tabs
          id="hub-detail-tabs"
          key={name}
          aria-label="Virtual Hub sections"
          activeKey={activeTab}
          onSelect={selectTab}
          mountOnEnter
          unmountOnExit
        >
          <Tab ref={selectedTabRef('status')} eventKey="status" title={<TabTitleText>Status</TabTitleText>}>
            <HubStatus hub={name} />
          </Tab>
          <Tab ref={selectedTabRef('sessions')} eventKey="sessions" title={<TabTitleText>Sessions</TabTitleText>}>
            <Sessions hub={name} />
          </Tab>
          <Tab ref={selectedTabRef('tables')} eventKey="tables" title={<TabTitleText>Tables</TabTitleText>}>
            <HubTables hub={name} />
          </Tab>
          <Tab ref={selectedTabRef('cascade')} eventKey="cascade" title={<TabTitleText>Cascade</TabTitleText>}>
            <Cascade hub={name} />
          </Tab>
          <Tab ref={selectedTabRef('properties')} eventKey="properties" title={<TabTitleText>Properties</TabTitleText>}>
            <Properties hub={name} />
          </Tab>
          <Tab ref={selectedTabRef('users')} eventKey="users" title={<TabTitleText>Users</TabTitleText>}>
            <Users hub={name} />
          </Tab>
          <Tab ref={selectedTabRef('groups')} eventKey="groups" title={<TabTitleText>Groups</TabTitleText>}>
            <Groups hub={name} />
          </Tab>
          <Tab ref={selectedTabRef('accesslist')} eventKey="accesslist" title={<TabTitleText>Access List</TabTitleText>}>
            <AccessList hub={name} />
          </Tab>
          {!hideNonCluster && (
            <Tab ref={selectedTabRef('securenat')} eventKey="securenat" title={<TabTitleText>Secure NAT</TabTitleText>}>
              <SecureNAT hub={name} />
            </Tab>
          )}
          <Tab ref={selectedTabRef('certificates')} eventKey="certificates" title={<TabTitleText>Trusted CA</TabTitleText>}>
            <HubCertificates hub={name} />
          </Tab>
          <Tab ref={selectedTabRef('logs')} eventKey="logs" title={<TabTitleText>Logs</TabTitleText>}>
            <HubLogs hub={name} />
          </Tab>
          <Tab ref={selectedTabRef('radius')} eventKey="radius" title={<TabTitleText>RADIUS</TabTitleText>}>
            <Radius hub={name} />
          </Tab>
        </Tabs>
      </AppPage>
    </>
  );
};

export { HubDetail };
