import * as React from 'react';
import { Card, CardBody, CardHeader, CardTitle } from '@patternfly/react-core';

interface ActionCardProps {
  title: string;
  description: React.ReactNode;
  onClick: () => void;
  style?: React.CSSProperties;
}

const ActionCard: React.FunctionComponent<ActionCardProps> = ({ title, description, onClick, style }) => (
  <Card isClickable isFullHeight style={style}>
    <CardHeader
      selectableActions={{
        selectableActionAriaLabel: title,
        onClickAction: onClick,
      }}
    >
      <CardTitle>{title}</CardTitle>
    </CardHeader>
    <CardBody
      style={{
        color: 'var(--pf-t--global--text--color--subtle)',
        fontSize: 'var(--pf-t--global--font--size--sm)',
        overflowWrap: 'anywhere',
      }}
    >
      {description}
    </CardBody>
  </Card>
);

export { ActionCard };
