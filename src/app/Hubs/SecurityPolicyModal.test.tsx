import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SecurityPolicyModal } from './SecurityPolicyModal';

describe('SecurityPolicyModal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the policy toggle and fields disabled until the policy is applied', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(
      <SecurityPolicyModal
        title="Security policy: alice"
        subject={{ Name_str: 'alice', UsePolicy_bool: false, 'policy:Access_bool': true }}
        isOpen
        onClose={() => undefined}
        onSave={onSave}
      />,
    );

    expect(screen.getByText('Security policy: alice')).toBeInTheDocument();
    // a boolean field rendered from the metadata, disabled while UsePolicy is off
    const access = screen.getByRole('switch', { name: 'Allow access' });
    expect(access).toBeDisabled();

    // enable the policy, the fields become editable
    await user.click(screen.getByRole('switch', { name: /apply a security policy/i }));
    expect(screen.getByRole('switch', { name: 'Allow access' })).toBeEnabled();
  });

  it('returns the edited policy on apply', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(
      <SecurityPolicyModal
        title="Security policy: sales"
        subject={{ Name_str: 'sales', UsePolicy_bool: true, 'policy:Access_bool': true, 'policy:NoBridge_bool': false }}
        isOpen
        onClose={() => undefined}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole('switch', { name: 'Deny bridge operation' }));
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const updated = onSave.mock.calls[0][0];
    expect(updated.UsePolicy_bool).toBe(true);
    expect(updated['policy:NoBridge_bool']).toBe(true);
    // untouched fields are preserved
    expect(updated['policy:Access_bool']).toBe(true);
    expect(updated.Name_str).toBe('sales');
  });
});
