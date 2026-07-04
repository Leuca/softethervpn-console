import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import { Radius } from './Radius';
import { api } from '@app/utils/vpnrpc_settings';

vi.mock('@app/utils/vpnrpc_settings', () => ({
  api: { GetHubRadius: vi.fn(), SetHubRadius: vi.fn() },
}));

const getHubRadius = api.GetHubRadius as unknown as Mock;
const setHubRadius = api.SetHubRadius as unknown as Mock;

// GetHubRadius does not echo HubName_str back in its response.
const radius = {
  RadiusServerName_str: 'radius.example.com',
  RadiusPort_u32: 1812,
  RadiusSecret_str: '',
  RadiusRetryInterval_u32: 500,
};

describe('Radius', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads the current RADIUS settings', async () => {
    getHubRadius.mockResolvedValue({ ...radius });

    render(<Radius hub="DEFAULT" />);

    expect(await screen.findByLabelText('RADIUS server')).toHaveValue('radius.example.com');
    expect(screen.getByLabelText('Port')).toHaveValue(1812);
    expect(getHubRadius.mock.calls[0][0]).toMatchObject({ HubName_str: 'DEFAULT' });
  });

  it('shows SoftEther default port and retry when unconfigured (0)', async () => {
    getHubRadius.mockResolvedValue({
      RadiusServerName_str: '',
      RadiusPort_u32: 0,
      RadiusSecret_str: '',
      RadiusRetryInterval_u32: 0,
    });

    render(<Radius hub="DEFAULT" />);

    // 0 from the server must not surface as the field value
    expect(await screen.findByLabelText('Port')).toHaveValue(1812);
    expect(screen.getByLabelText('Retry interval (ms)')).toHaveValue(1000);
  });

  it('saves the server and keeps the secret when blank', async () => {
    getHubRadius.mockResolvedValue({ ...radius });
    setHubRadius.mockResolvedValue({});
    const user = userEvent.setup();

    render(<Radius hub="DEFAULT" />);
    const server = await screen.findByLabelText('RADIUS server');
    await user.clear(server);
    await user.type(server, 'auth.corp.net');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const sent = setHubRadius.mock.calls[0][0];
    // the hub name must be set on the payload or SetHubRadius targets no hub
    expect(sent.HubName_str).toBe('DEFAULT');
    expect(sent.RadiusServerName_str).toBe('auth.corp.net');
    expect(Object.prototype.hasOwnProperty.call(sent, 'RadiusSecret_str')).toBe(false);
  });

  it('disables RADIUS by clearing the server and still targets the hub', async () => {
    getHubRadius.mockResolvedValue({ ...radius });
    setHubRadius.mockResolvedValue({});
    const user = userEvent.setup();

    render(<Radius hub="DEFAULT" />);
    const server = await screen.findByLabelText('RADIUS server');
    await user.clear(server);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const sent = setHubRadius.mock.calls[0][0];
    expect(sent.HubName_str).toBe('DEFAULT');
    expect(sent.RadiusServerName_str).toBe('');
  });

  it('sends a new secret when one is entered', async () => {
    getHubRadius.mockResolvedValue({ ...radius });
    setHubRadius.mockResolvedValue({});
    const user = userEvent.setup();

    render(<Radius hub="DEFAULT" />);
    await user.type(await screen.findByLabelText('Shared secret'), 'topsecret');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(setHubRadius.mock.calls[0][0].RadiusSecret_str).toBe('topsecret');
  });
});
