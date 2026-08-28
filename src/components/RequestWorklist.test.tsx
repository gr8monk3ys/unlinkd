import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RequestWorklist } from './RequestWorklist';
import type { TrackedRequest } from '../core/compliance/deadlines';
import { computeDeadline } from '../core/compliance/deadlines';
import { COMPLIANCE_PROFILES } from '../core/compliance/profiles';
import type { ConnectorDefinition, ConnectorInstance, RemovalRequest } from '../core/types';

const catalog: ConnectorDefinition[] = [
  {
    id: 'broker-x',
    name: 'Broker X',
    category: 'broker',
    description: '',
    defaultRecheckDays: 90,
    steps: []
  }
];

const instance: ConnectorInstance = {
  id: 'ci1',
  connectorId: 'broker-x',
  personaId: 'p1',
  state: 'executed',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  evidence: []
};

function tracked(sentAt: string, now: string, id = 'r1'): TrackedRequest {
  const request: RemovalRequest = {
    id,
    profileId: 'gdpr',
    basisId: 'gdpr.art17',
    channel: 'email',
    sentAt,
    responses: []
  };
  const profiles = COMPLIANCE_PROFILES.map((p) => ({ ...p, lastReviewed: now.slice(0, 10) }));
  return { instance, request, computation: computeDeadline(request, profiles, Date.parse(now)) };
}

describe('RequestWorklist', () => {
  it('renders nothing when no request needs attention', () => {
    const { container } = render(<RequestWorklist tracked={[]} connectorCatalog={catalog} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('leads with the count of requests past their deadline', () => {
    render(
      <RequestWorklist
        tracked={[tracked('2026-07-14T00:00:00.000Z', '2026-08-26T00:00:00Z')]}
        connectorCatalog={catalog}
      />
    );

    expect(screen.getByRole('heading', { name: /1 request is past the legal deadline/i })).toBeInTheDocument();
    expect(screen.getByText(/12 days overdue/)).toBeInTheDocument();
  });

  it('names the connector and cites the legal basis', () => {
    render(
      <RequestWorklist
        tracked={[tracked('2026-07-14T00:00:00.000Z', '2026-08-26T00:00:00Z')]}
        connectorCatalog={catalog}
      />
    );

    expect(screen.getByText('Broker X')).toBeInTheDocument();
    // Cited twice by design: once in the summary line, once in the explanation.
    expect(screen.getAllByText(/GDPR Art\. 17/).length).toBeGreaterThan(0);
  });

  it('shows the arithmetic behind the deadline so it can be checked', () => {
    render(
      <RequestWorklist
        tracked={[tracked('2026-07-14T00:00:00.000Z', '2026-08-26T00:00:00Z')]}
        connectorCatalog={catalog}
      />
    );

    expect(screen.getByText(/Sent 2026-07-14, plus 1 month/)).toBeInTheDocument();
  });

  it('softens the heading when nothing is overdue yet', () => {
    render(
      <RequestWorklist
        tracked={[tracked('2026-07-14T00:00:00.000Z', '2026-08-10T00:00:00Z')]}
        connectorCatalog={catalog}
      />
    );

    expect(screen.getByRole('heading', { name: /approaching their deadline/i })).toBeInTheDocument();
  });

  it('states that deadlines are not legal advice', () => {
    render(
      <RequestWorklist
        tracked={[tracked('2026-07-14T00:00:00.000Z', '2026-08-26T00:00:00Z')]}
        connectorCatalog={catalog}
      />
    );

    expect(screen.getByText(/not legal advice/i)).toBeInTheDocument();
  });

  it('warns when the deadline came from a profile past its review date', () => {
    const request: RemovalRequest = {
      id: 'r-stale',
      profileId: 'gdpr',
      basisId: 'gdpr.art17',
      channel: 'email',
      sentAt: '2026-07-14T00:00:00.000Z',
      responses: []
    };
    const stale = COMPLIANCE_PROFILES.map((p) => ({ ...p, lastReviewed: '2020-01-01' }));

    render(
      <RequestWorklist
        tracked={[
          { instance, request, computation: computeDeadline(request, stale, Date.parse('2026-08-26T00:00:00Z')) }
        ]}
        connectorCatalog={catalog}
      />
    );

    expect(screen.getByText(/past its review date/i)).toBeInTheDocument();
  });
});
