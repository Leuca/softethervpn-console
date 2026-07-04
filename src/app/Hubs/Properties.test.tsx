import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import { Properties } from './Properties';
import { api } from '@app/utils/vpnrpc_settings';

vi.mock('@app/utils/vpnrpc_settings', () => ({
  api: { GetHub: vi.fn(), SetHub: vi.fn() },
}));

const getHub = api.GetHub as unknown as Mock;
const setHub = api.SetHub as unknown as Mock;

const hubConfig = {
  HubName_str: 'DEFAULT',
  Online_bool: true,
  HubType_u32: 0,
  MaxSession_u32: 0,
  NoEnum_bool: false,
};

describe('Properties', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads the hub config and shows current values', async () => {
    getHub.mockResolvedValue({ ...hubConfig, MaxSession_u32: 10 });

    render(<Properties hub="DEFAULT" />);

    expect(await screen.findByLabelText('Max sessions')).toHaveValue(10);
    expect(getHub.mock.calls[0][0]).toMatchObject({ HubName_str: 'DEFAULT' });
  });

  it('saves changes and keeps the password when the field is blank', async () => {
    getHub.mockResolvedValue({ ...hubConfig });
    setHub.mockResolvedValue({});
    const user = userEvent.setup();

    render(<Properties hub="DEFAULT" />);
    const maxSession = await screen.findByLabelText('Max sessions');
    await user.clear(maxSession);
    await user.type(maxSession, '5');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const sent = setHub.mock.calls[0][0];
    expect(sent.MaxSession_u32).toBe(5);
    // whole object round-tripped so online/type survive
    expect(sent.HubType_u32).toBe(0);
    // password not changed -> key omitted
    expect(Object.prototype.hasOwnProperty.call(sent, 'AdminPasswordPlainText_str')).toBe(false);
  });

  it('sends a new password when one is entered', async () => {
    getHub.mockResolvedValue({ ...hubConfig });
    setHub.mockResolvedValue({});
    const user = userEvent.setup();

    render(<Properties hub="DEFAULT" />);
    await user.type(await screen.findByLabelText('New admin password'), 'hunter2');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(setHub.mock.calls[0][0].AdminPasswordPlainText_str).toBe('hunter2');
  });
});
