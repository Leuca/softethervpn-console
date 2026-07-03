import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServerStatus } from './ServerStatus';
import { api } from '@app/utils/vpnrpc_settings';

vi.mock('@app/utils/vpnrpc_settings', () => ({
  api: { GetServerStatus: vi.fn() },
}));

const getServerStatus = api.GetServerStatus as unknown as Mock;

describe('ServerStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders status rows with de-camel-cased labels and formatted values', async () => {
    getServerStatus.mockResolvedValue({
      NumSessionsTotal_u32: 3,
      'Recv.UnicastBytes_u64': 219621467512,
      StartTime_dt: '2026-07-03T12:03:14.642Z',
    });

    render(<ServerStatus />);

    expect(await screen.findByText('Num Sessions Total')).toBeInTheDocument();
    // number formatted with thousands separators
    expect(screen.getByText('219,621,467,512')).toBeInTheDocument();
    // date rendered as a locale string, not the raw ISO value
    expect(screen.queryByText('2026-07-03T12:03:14.642Z')).not.toBeInTheDocument();
  });

  it('shows an error alert when the call fails', async () => {
    getServerStatus.mockRejectedValue(new Error('boom'));

    render(<ServerStatus />);

    expect(await screen.findByText('Could not load server status')).toBeInTheDocument();
  });
});
