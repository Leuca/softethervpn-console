import * as React from 'react';
import {
  Card,
  CardBody,
  CardTitle,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  PageSection,
  Title,
} from '@patternfly/react-core';
import { useServer } from '@app/ServerContext';

const Dashboard: React.FunctionComponent = () => {
  const { user, ddnsHostname, azure, isBridgeMode, info } = useServer();

  return (
    <PageSection hasBodyWrapper={false}>
      <Title headingLevel="h1" size="lg">
        Dashboard
      </Title>
      <br />
      <Card>
        <CardTitle>Server Overview</CardTitle>
        <CardBody>
          <DescriptionList isHorizontal>
            <DescriptionListGroup>
              <DescriptionListTerm>Connected as</DescriptionListTerm>
              <DescriptionListDescription>{user}</DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>Product</DescriptionListTerm>
              <DescriptionListDescription>{String(info['ServerProductName_str'] ?? '-')}</DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>Version</DescriptionListTerm>
              <DescriptionListDescription>{String(info['ServerVersionString_str'] ?? '-')}</DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>Hostname</DescriptionListTerm>
              <DescriptionListDescription>{String(info['ServerHostName_str'] ?? '-')}</DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>Dynamic DNS hostname</DescriptionListTerm>
              <DescriptionListDescription>{ddnsHostname || '-'}</DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>VPN Azure</DescriptionListTerm>
              <DescriptionListDescription>{azure ? 'Enabled' : 'Disabled'}</DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>Mode</DescriptionListTerm>
              <DescriptionListDescription>{isBridgeMode ? 'Bridge' : 'Server'}</DescriptionListDescription>
            </DescriptionListGroup>
          </DescriptionList>
        </CardBody>
      </Card>
    </PageSection>
  );
};

export { Dashboard };
