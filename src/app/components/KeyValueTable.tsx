import * as React from 'react';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { split_string_by_capitalization } from '@app/utils/string_utils';
import { formatRpcValue } from '@app/utils/format';

interface KeyValueTableProps {
  /** A raw JSON-RPC response object; every own key becomes a row. */
  data: Record<string, unknown>;
  ariaLabel: string;
}

/**
 * Two-column Item/Value table for a flat JSON-RPC response. Keys are
 * de-camel-cased into labels and values run through formatRpcValue. Shared by
 * the read-only status pages and the per-row detail modals.
 */
const KeyValueTable: React.FunctionComponent<KeyValueTableProps> = ({ data, ariaLabel }) => (
  <Table aria-label={ariaLabel} variant="compact">
    <Thead>
      <Tr>
        <Th width={40}>Item</Th>
        <Th>Value</Th>
      </Tr>
    </Thead>
    <Tbody>
      {Object.keys(data).map((key) => (
        <Tr key={key}>
          <Td dataLabel="Item">{split_string_by_capitalization(key)}</Td>
          <Td dataLabel="Value">{formatRpcValue(key, data[key])}</Td>
        </Tr>
      ))}
    </Tbody>
  </Table>
);

export { KeyValueTable };
