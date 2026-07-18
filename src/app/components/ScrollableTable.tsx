import * as React from 'react';
import {
  InnerScrollContainer,
  OuterScrollContainer,
  Table,
  type TableProps,
} from '@patternfly/react-table';
import './ScrollableTable.css';

interface ScrollableTableProps extends TableProps {
  'aria-label': string;
}

const ScrollableTable: React.FunctionComponent<ScrollableTableProps> = ({
  'aria-label': ariaLabel,
  isStickyHeader = true,
  ...props
}) => (
  <OuterScrollContainer className="se-scrollable-table">
    <InnerScrollContainer role="region" aria-label={`${ariaLabel} scroll area`} tabIndex={0}>
      <Table aria-label={ariaLabel} isStickyHeader={isStickyHeader} {...props} />
    </InnerScrollContainer>
  </OuterScrollContainer>
);

export { ScrollableTable };
