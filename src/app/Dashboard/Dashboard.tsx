import * as React from 'react';
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Gallery,
  Label,
  Stack,
  StackItem,
} from '@patternfly/react-core';
import { NetworkIcon, OutlinedClockIcon, ServerIcon, UserIcon } from '@patternfly/react-icons';
import { useNavigate } from 'react-router-dom';
import { useServer } from '@app/ServerContext';
import { AppPage } from '@app/components/AppPage';
import { StatCard } from '@app/components/StatCard';

const Dashboard: React.FunctionComponent = () => {
  const { user, ddnsHostname, azure, isBridgeMode, info, hideAdminOnly, hideNonBridge, hiddenLabels } = useServer();
  const navigate = useNavigate();

  const str = (key: string): string => String(info[key] ?? '-');
  const commonTasks = [
    {
      title: 'Virtual Hubs',
      description: 'Manage hubs, users, sessions, access lists, Secure NAT, and logs.',
      path: '/hubs',
      isHidden: hiddenLabels.has('Hubs'),
    },
    {
      title: 'Local Bridge',
      description: 'Bridge a Virtual Hub to a physical Ethernet adapter.',
      path: '/functionalities/localbridge',
      isHidden: hideAdminOnly || hiddenLabels.has('Local Bridge'),
    },
    {
      title: 'Dynamic DNS',
      description: 'Review the hostname clients can use to reach this server.',
      path: '/functionalities/ddns',
      isHidden: hideAdminOnly || hideNonBridge || hiddenLabels.has('Dynamic DNS'),
    },
    {
      title: 'VPN Azure',
      description: 'Check or change the cloud relay service for NAT traversal.',
      path: '/functionalities/vpnazure',
      isHidden: hideAdminOnly || hideNonBridge || hiddenLabels.has('VPN Azure'),
    },
    {
      title: 'Layer 3 Switch',
      description: 'Configure routed IP connectivity between Virtual Hubs.',
      path: '/functionalities/layer3switch',
      isHidden: hideAdminOnly || hideNonBridge || hiddenLabels.has('Layer 3 Switch'),
    },
  ].filter((task) => !task.isHidden);

  return (
    <AppPage title="Dashboard" description="At-a-glance status of this SoftEther VPN Server.">
      <Stack hasGutter>
        <StackItem>
          <Gallery hasGutter minWidths={{ default: '240px' }}>
            <StatCard icon={<UserIcon />} label="Signed in as" value={user} tone="brand" />
            <StatCard
              icon={<ServerIcon />}
              label="Server mode"
              value={isBridgeMode ? 'Bridge' : 'Server'}
              tone="info"
            />
            <StatCard
              icon={<NetworkIcon />}
              label="VPN Azure"
              value={azure ? 'Enabled' : 'Disabled'}
              tone={azure ? 'success' : 'default'}
            />
            <StatCard
              icon={<OutlinedClockIcon />}
              label="Version"
              value={str('ServerVersionString_str')}
              tone="default"
            />
          </Gallery>
        </StackItem>

        <StackItem>
          <Card>
            <CardTitle>Server overview</CardTitle>
            <CardBody>
              <DescriptionList isHorizontal columnModifier={{ default: '1Col', lg: '2Col' }}>
                <DescriptionListGroup>
                  <DescriptionListTerm>Product</DescriptionListTerm>
                  <DescriptionListDescription>{str('ServerProductName_str')}</DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>Version</DescriptionListTerm>
                  <DescriptionListDescription>{str('ServerVersionString_str')}</DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>Hostname</DescriptionListTerm>
                  <DescriptionListDescription>{str('ServerHostName_str')}</DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>Dynamic DNS</DescriptionListTerm>
                  <DescriptionListDescription>{ddnsHostname || '-'}</DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>VPN Azure</DescriptionListTerm>
                  <DescriptionListDescription>
                    <Label color={azure ? 'green' : 'grey'} isCompact>
                      {azure ? 'Enabled' : 'Disabled'}
                    </Label>
                  </DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>Mode</DescriptionListTerm>
                  <DescriptionListDescription>{isBridgeMode ? 'Bridge' : 'Server'}</DescriptionListDescription>
                </DescriptionListGroup>
              </DescriptionList>
            </CardBody>
          </Card>
        </StackItem>

        {commonTasks.length > 0 && (
          <StackItem>
            <Card>
              <CardTitle>Common management</CardTitle>
              <CardBody>
                <Gallery hasGutter minWidths={{ default: '220px' }}>
                  {commonTasks.map((task) => (
                    <Card key={task.path} isClickable isFullHeight>
                      <CardHeader
                        selectableActions={{
                          selectableActionAriaLabel: task.title,
                          onClickAction: () => navigate(task.path),
                        }}
                      >
                        <CardTitle>{task.title}</CardTitle>
                      </CardHeader>
                      <CardBody
                        style={{
                          color: 'var(--pf-t--global--text--color--subtle)',
                          fontSize: 'var(--pf-t--global--font--size--sm)',
                        }}
                      >
                        {task.description}
                      </CardBody>
                    </Card>
                  ))}
                </Gallery>
              </CardBody>
            </Card>
          </StackItem>
        )}
      </Stack>
    </AppPage>
  );
};

export { Dashboard };
