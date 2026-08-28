import { describe, expect, it } from 'vitest';
import type { ConnectorInstance } from '../types';
import {
  addRequest,
  addResponse,
  closeRequest,
  createRequest,
  createResponse,
  instanceRequests,
  requestChannelLabels,
  requestOutcomeLabels,
  validateNewRequest
} from './requests';

function instance(overrides: Partial<ConnectorInstance> = {}): ConnectorInstance {
  return {
    id: 'ci1',
    connectorId: 'broker-x',
    personaId: 'p1',
    state: 'executed',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    evidence: [],
    ...overrides
  };
}

const validInput = {
  profileId: 'gdpr',
  basisId: 'gdpr.art17',
  channel: 'email' as const,
  sentAt: '2026-07-14T00:00:00.000Z'
};

describe('validateNewRequest', () => {
  const now = Date.parse('2026-08-26T00:00:00Z');

  it('accepts a well-formed request', () => {
    expect(validateNewRequest(validInput, now)).toBeNull();
  });

  it('rejects a basis the profile does not define', () => {
    expect(validateNewRequest({ ...validInput, basisId: 'gdpr.art99' }, now)?.field).toBe('basisId');
  });

  it('rejects a basis borrowed from another profile', () => {
    expect(validateNewRequest({ ...validInput, basisId: 'ccpa.delete' }, now)?.field).toBe('basisId');
  });

  it('rejects an unreadable send date', () => {
    expect(validateNewRequest({ ...validInput, sentAt: 'yesterday' }, now)?.field).toBe('sentAt');
  });

  it('rejects a send date in the future, which would hide an overdue request', () => {
    expect(validateNewRequest({ ...validInput, sentAt: '2027-01-01T00:00:00.000Z' }, now)?.field).toBe('sentAt');
  });

  it('allows an omitted send date, which defaults to now', () => {
    const withoutDate = { profileId: 'gdpr', basisId: 'gdpr.art17', channel: 'email' as const };
    expect(validateNewRequest(withoutDate, now)).toBeNull();
    expect(Number.isFinite(Date.parse(createRequest(withoutDate).sentAt))).toBe(true);
  });
});

describe('request mutations', () => {
  it('appends a request without disturbing the original instance', () => {
    const original = instance();
    const updated = addRequest(original, createRequest(validInput));

    expect(instanceRequests(updated)).toHaveLength(1);
    expect(original.requests).toBeUndefined();
  });

  it('treats an instance written before request tracking as having none', () => {
    expect(instanceRequests(instance())).toEqual([]);
  });

  it('appends a response to the matching request only', () => {
    const first = createRequest(validInput);
    const second = createRequest(validInput);
    const withBoth = addRequest(addRequest(instance(), first), second);

    const updated = addResponse(withBoth, first.id, createResponse('acknowledged'));

    expect(instanceRequests(updated).find((r) => r.id === first.id)?.responses).toHaveLength(1);
    expect(instanceRequests(updated).find((r) => r.id === second.id)?.responses).toHaveLength(0);
  });

  it('records an extension claim on the response', () => {
    const response = createResponse('acknowledged', { extensionClaimed: true });
    expect(response.extensionClaimed).toBe(true);
  });

  it('closes a request once and keeps the first close time', () => {
    const created = createRequest(validInput);
    const closed = closeRequest(addRequest(instance(), created), created.id);
    const closedAgain = closeRequest(closed, created.id);

    const first = instanceRequests(closed)[0]!.closedAt;
    expect(first).toBeDefined();
    expect(instanceRequests(closedAgain)[0]!.closedAt).toBe(first);
  });

  it('bumps updatedAt so cross-tab writers see the change', () => {
    const updated = addRequest(instance(), createRequest(validInput));
    expect(updated.updatedAt).not.toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('labels', () => {
  it('labels every channel and outcome the UI can render', () => {
    expect(Object.values(requestChannelLabels).every((label) => label.length > 0)).toBe(true);
    expect(Object.values(requestOutcomeLabels).every((label) => label.length > 0)).toBe(true);
  });
});
