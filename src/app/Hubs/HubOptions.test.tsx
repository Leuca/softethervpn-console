import * as React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import { HubAdminOptions } from './HubAdminOptions';
import { HubExtendedOptions } from './HubExtendedOptions';
import { api } from '@app/utils/vpnrpc_settings';

vi.mock('@app/ServerContext', () => ({
  useServer: () => ({
    capsList: [{ CapsName_str: 'b_support_hub_admin_option', CapsValue_u32: 1 }],
    user: 'Administrator',
  }),
}));

vi.mock('@app/utils/vpnrpc_settings', () => ({
  api: {
    GetHubAdminOptions: vi.fn(),
    GetDefaultHubAdminOptions: vi.fn(),
    SetHubAdminOptions: vi.fn(),
    GetHubExtOptions: vi.fn(),
    SetHubExtOptions: vi.fn(),
  },
}));

const getHubAdminOptions = api.GetHubAdminOptions as unknown as Mock;
const getDefaultHubAdminOptions = api.GetDefaultHubAdminOptions as unknown as Mock;
const setHubAdminOptions = api.SetHubAdminOptions as unknown as Mock;
const getHubExtOptions = api.GetHubExtOptions as unknown as Mock;
const setHubExtOptions = api.SetHubExtOptions as unknown as Mock;
const options = { AdminOptionList: [{ Name_str: 'allow_hub_admin_change_option', Value_u32: 1 }] };

const deferred = () => {
  let resolve: (value: object) => void = () => undefined;
  const promise = new Promise<object>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
};

describe('Hub option modals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getHubAdminOptions.mockResolvedValue(options);
    getDefaultHubAdminOptions.mockResolvedValue(options);
    getHubExtOptions.mockResolvedValue(options);
  });

  it('closes Administration Options only after a successful save', async () => {
    const save = deferred();
    setHubAdminOptions.mockReturnValue(save.promise);
    const user = userEvent.setup();

    render(<HubAdminOptions hub="DEFAULT" />);
    await user.click(screen.getByRole('button', { name: 'Administration Options' }));
    const dialog = await screen.findByRole('dialog');
    const saveButton = screen.getByRole('button', { name: 'Save options' });
    await user.click(saveButton);
    await user.keyboard('{Escape}');

    expect(dialog).toBeInTheDocument();
    expect(saveButton).toBeDisabled();
    save.resolve({});
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
  });

  it('closes Extended Options only after a successful save', async () => {
    const save = deferred();
    setHubExtOptions.mockReturnValue(save.promise);
    const user = userEvent.setup();

    render(<HubExtendedOptions hub="DEFAULT" />);
    await user.click(screen.getByRole('button', { name: 'Extended Options' }));
    const dialog = await screen.findByRole('dialog');
    const saveButton = screen.getByRole('button', { name: 'Save options' });
    await user.click(saveButton);
    await user.keyboard('{Escape}');

    expect(dialog).toBeInTheDocument();
    expect(saveButton).toBeDisabled();
    save.resolve({});
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
  });
});
