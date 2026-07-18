import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { Tbody, Td, Tr } from '@patternfly/react-table';
import { describe, expect, it } from 'vitest';
import { ScrollableTable } from './ScrollableTable';

describe('ScrollableTable', () => {
  it('provides a keyboard-scrollable region with a sticky table header', () => {
    render(
      <ScrollableTable aria-label="Test collection" variant="compact">
        <Tbody>
          <Tr>
            <Td>Value</Td>
          </Tr>
        </Tbody>
      </ScrollableTable>,
    );

    expect(screen.getByRole('region', { name: 'Test collection scroll area' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('grid', { name: 'Test collection' })).toHaveClass('pf-m-sticky-header');
  });
});
