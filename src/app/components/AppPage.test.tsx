import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppPage } from './AppPage';

describe('AppPage', () => {
  it('sticks the page header only when it contains actions', () => {
    const { rerender } = render(
      <AppPage title="Action page" actions={<button type="button">Create</button>}>
        Content
      </AppPage>,
    );

    expect(screen.getByRole('heading', { name: 'Action page' }).closest('section')).toHaveClass(
      'se-app-page__header--sticky',
    );

    rerender(<AppPage title="Information page">Content</AppPage>);

    expect(screen.getByRole('heading', { name: 'Information page' }).closest('section')).not.toHaveClass(
      'se-app-page__header--sticky',
    );
  });
});
