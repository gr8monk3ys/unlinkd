import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RequestPanel } from './RequestPanel';
import { localIsoDate } from '../core/utils';
import type { ConnectorInstance } from '../core/types';

const instance: ConnectorInstance = {
  id: 'ci1',
  connectorId: 'broker-x',
  personaId: 'p1',
  state: 'executed',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  evidence: []
};

describe('localIsoDate', () => {
  it('uses the local calendar date, not the UTC one', () => {
    // 23:30 local on 14 July. In any zone west of UTC the ISO string already
    // reads 15 July; the date input must still default to the day the user
    // is living in, or the default is rejected as "sent in the future".
    const lateEvening = new Date(2026, 6, 14, 23, 30);
    expect(localIsoDate(lateEvening)).toBe('2026-07-14');
  });

  it('zero-pads month and day', () => {
    expect(localIsoDate(new Date(2026, 0, 5, 9, 0))).toBe('2026-01-05');
  });
});

describe('RequestPanel', () => {
  it('defaults the send date to the local today and records it at midday UTC', () => {
    const onRecordRequest = vi.fn().mockResolvedValue(true);
    render(<RequestPanel instance={instance} onRecordRequest={onRecordRequest} onRecordResponse={vi.fn()} />);

    const expected = localIsoDate();
    const input = screen.getByLabelText('Date sent') as HTMLInputElement;
    expect(input.value).toBe(expected);
    expect(input.max).toBe(expected);

    fireEvent.click(screen.getByRole('button', { name: 'Record request' }));

    expect(onRecordRequest).toHaveBeenCalledTimes(1);
    expect(onRecordRequest.mock.calls[0]?.[1]).toMatchObject({ sentAt: `${expected}T12:00:00.000Z` });
  });

  it('labels the CCPA opt-out window in business days, not calendar days', () => {
    render(<RequestPanel instance={instance} onRecordRequest={vi.fn()} onRecordResponse={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Regime'), { target: { value: 'ccpa' } });
    fireEvent.change(screen.getByLabelText('Legal basis'), { target: { value: 'ccpa.optout' } });

    expect(screen.getByTestId('basis-window')).toHaveTextContent('Response window: 15 business days');
  });
});
