import * as React from 'react';
import { Card, CardBody, Flex, FlexItem } from '@patternfly/react-core';

type Tone = 'brand' | 'success' | 'info' | 'default';

const toneColor: Record<Tone, string> = {
  brand: 'var(--pf-t--global--color--brand--default)',
  success: 'var(--pf-t--global--color--status--success--default)',
  info: 'var(--pf-t--global--color--status--info--default)',
  default: 'var(--pf-t--global--icon--color--subtle)',
};

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  tone?: Tone;
}

/**
 * Compact KPI tile: a tinted icon badge next to a large value and a subtle
 * label. Used across the console for at-a-glance metrics so every summary
 * grid looks the same.
 */
const StatCard: React.FunctionComponent<StatCardProps> = ({ icon, label, value, tone = 'brand' }) => (
  <Card isFullHeight isCompact>
    <CardBody style={{ display: 'flex', alignItems: 'center' }}>
      <Flex
        alignItems={{ default: 'alignItemsCenter' }}
        gap={{ default: 'gapMd' }}
        flexWrap={{ default: 'nowrap' }}
        style={{ width: '100%' }}
      >
        <FlexItem>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '2.5rem',
              height: '2.5rem',
              borderRadius: 'var(--pf-t--global--border--radius--medium)',
              color: toneColor[tone],
              backgroundColor: 'var(--pf-t--global--background--color--secondary--default)',
              fontSize: '1.25rem',
            }}
          >
            {icon}
          </span>
        </FlexItem>
        <FlexItem style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 'var(--pf-t--global--font--size--heading--h3)',
              fontWeight: 'var(--pf-t--global--font--weight--body--bold)',
              lineHeight: 1.1,
              overflowWrap: 'anywhere',
            }}
          >
            {value}
          </div>
          <div
            style={{
              fontSize: 'var(--pf-t--global--font--size--body--sm)',
              color: 'var(--pf-t--global--text--color--subtle)',
              overflowWrap: 'anywhere',
            }}
          >
            {label}
          </div>
        </FlexItem>
      </Flex>
    </CardBody>
  </Card>
);

export { StatCard };
