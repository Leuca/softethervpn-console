import * as React from 'react';
import {
  Card,
  CardBody,
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
import { useServer } from '@app/ServerContext';
import { AppPage } from '@app/components/AppPage';
import { StatCard } from '@app/components/StatCard';

const Dashboard: React.FunctionComponent = () => {
  const { user, ddnsHostname, azure, isBridgeMode, info } = useServer();

  const str = (key: string): string => String(info[key] ?? '-');

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
      </Stack>
    </AppPage>
  );
};

export { Dashboard };
