import * as React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { KeyValueTable } from './KeyValueTable';

describe('KeyValueTable', () => {
  it('renders one row per key with a row-header label and no column header', () => {
    render(<KeyValueTable data={{ ServerName_str: 'vpn1', NumTcpConnections_u32: 12 }} ariaLabel="Status" />);

    // No generic Item/Value header row.
    expect(screen.queryByRole('columnheader')).not.toBeInTheDocument();
    expect(screen.queryByText('Item')).not.toBeInTheDocument();
    expect(screen.queryByText('Value')).not.toBeInTheDocument();

    // The de-camel-cased label is the row header for its value.
    const nameRow = screen.getByRole('rowheader', { name: 'Server Name' }).closest('tr') as HTMLElement;
    expect(within(nameRow).getByText('vpn1')).toBeInTheDocument();

    // Numbers are formatted and the value cell carries the field label for
    // the stacked mobile layout.
    const connections = screen.getByText('12');
    expect(connections).toHaveAttribute('data-label', 'Num Tcp Connections');
  });
});
