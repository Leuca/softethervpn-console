import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ActionCard } from './ActionCard';

describe('ActionCard', () => {
  it('exposes the PatternFly clickable action to keyboard and pointer users', () => {
    const onClick = vi.fn();
    render(<ActionCard title="Manage hubs" description="Open hub settings." onClick={onClick} />);

    const action = screen.getByRole('button', { name: 'Manage hubs' });
    expect(action).toHaveClass('pf-v6-c-card__clickable-action');

    fireEvent.click(action);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
