import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

function ThrowingComponent({ error }: { error: Error }): never {
  throw error;
}

describe('ErrorBoundary', () => {
  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <p>All good</p>
      </ErrorBoundary>
    );

    expect(screen.getByText('All good')).toBeInTheDocument();
  });

  it('shows error message when child throws', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowingComponent error={new Error('Test failure')} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Test failure')).toBeInTheDocument();

    spy.mockRestore();
  });

  it('shows "Something went wrong" heading on error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowingComponent error={new Error('boom')} />
      </ErrorBoundary>
    );

    expect(
      screen.getByRole('heading', { name: /something went wrong/i })
    ).toBeInTheDocument();

    spy.mockRestore();
  });

  it('shows reload button on error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowingComponent error={new Error('crash')} />
      </ErrorBoundary>
    );

    expect(
      screen.getByRole('button', { name: /reload/i })
    ).toBeInTheDocument();

    spy.mockRestore();
  });
});
