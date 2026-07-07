import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastAlertGroup } from './Notifications';

describe('ToastAlertGroup', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps each alert when multiple additions happen in the same millisecond', () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1234567890);

    const { rerender } = render(<ToastAlertGroup add={false} title="First toast" variant="danger" />);
    rerender(<ToastAlertGroup add={true} title="First toast" variant="danger" />);
    rerender(<ToastAlertGroup add={false} title="First toast" variant="danger" />);
    rerender(<ToastAlertGroup add={true} title="Second toast" variant="warning" />);

    const alerts = screen.getAllByText(/toast/i);
    expect(alerts).toHaveLength(2);
    expect(screen.getByText('First toast')).toBeVisible();
    expect(screen.getByText('Second toast')).toBeVisible();
    expect(nowSpy).toHaveBeenCalledTimes(2);
  });
});
