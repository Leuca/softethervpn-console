import * as React from 'react';
import { Table, Tbody, Td, Th, Tr } from '@patternfly/react-table';
import { split_string_by_capitalization } from '@app/utils/string_utils';
import { formatRpcValue } from '@app/utils/format';

interface KeyValueTableProps {
  /** A raw JSON-RPC response object; every own key becomes a row. */
  data: Record<string, unknown>;
  ariaLabel: string;
}

/**
 * Two-column key/value table for a flat JSON-RPC response. Keys are
 * de-camel-cased into labels and values run through formatRpcValue. Shared by
 * the read-only status pages and the per-row detail modals. There is no
 * generic Item/Value header row: each label cell is a row header, which keeps
 * the label-value association for assistive tech, and the value cell's
 * dataLabel carries the field label in the stacked mobile layout.
 */
const KeyValueTable: React.FunctionComponent<KeyValueTableProps> = ({ data, ariaLabel }) => (
  <Table aria-label={ariaLabel} variant="compact">
    <Tbody>
      {Object.keys(data).map((key) => {
        const label = split_string_by_capitalization(key);
        return (
          <Tr key={key}>
            {/* Hidden in the stacked mobile layout, where the value cell's
                dataLabel shows the same label and the row header would
                duplicate it. */}
            <Th scope="row" width={40} visibility={['hidden', 'visibleOnMd']}>
              {label}
            </Th>
            <Td dataLabel={label}>{formatRpcValue(key, data[key])}</Td>
          </Tr>
        );
      })}
    </Tbody>
  </Table>
);

export { KeyValueTable };
