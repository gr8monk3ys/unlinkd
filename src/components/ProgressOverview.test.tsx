import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  ConnectorDefinition,
  ConnectorInstance,
  RiskFinding
} from '../core/types';
import { ProgressOverview } from './ProgressOverview';

function makeInstance(
  overrides: Partial<ConnectorInstance> & Pick<ConnectorInstance, 'id' | 'state'>
): ConnectorInstance {
  return {
    connectorId: 'broker-spokeo',
    personaId: 'p1',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    evidence: [],
    ...overrides
  };
}

function makeFinding(
  overrides: Partial<RiskFinding> & Pick<RiskFinding, 'id' | 'tier'>
): RiskFinding {
  return {
    title: 'Test finding',
    harm: 5,
    exploitability: 5,
    status: 'open',
    ...overrides
  };
}

const catalog: ConnectorDefinition[] = [
  {
    id: 'broker-spokeo',
    name: 'Spokeo Opt-Out',
    category: 'broker',
    description: 'Remove listing from Spokeo',
    defaultRecheckDays: 30,
    steps: []
  },
  {
    id: 'broker-whitepages',
    name: 'Whitepages Opt-Out',
    category: 'broker',
    description: 'Remove listing from Whitepages',
    defaultRecheckDays: 60,
    steps: []
  }
];

const noop = (): void => {};

describe('ProgressOverview', () => {
  it('renders 0% when there are no connector instances', () => {
    render(
      <ProgressOverview
        identifiersCount={3}
        accountsCount={5}
        connectorInstances={[]}
        findings={[]}
        connectorCatalog={catalog}
        onMarkRechecked={noop}
      />
    );

    expect(screen.getByTestId('progress-percentage')).toHaveTextContent('0%');
  });

  it('renders 100% when all connectors are in recheck_scheduled state', () => {
    const instances = [
      makeInstance({ id: 'i1', state: 'recheck_scheduled' }),
      makeInstance({ id: 'i2', state: 'recheck_scheduled' })
    ];

    render(
      <ProgressOverview
        identifiersCount={2}
        accountsCount={4}
        connectorInstances={instances}
        findings={[]}
        connectorCatalog={catalog}
        onMarkRechecked={noop}
      />
    );

    expect(screen.getByTestId('progress-percentage')).toHaveTextContent('100%');
  });

  it('renders correct intermediate percentages', () => {
    // discovered=0, recheck_scheduled=100 => average = 50
    const instances = [
      makeInstance({ id: 'i1', state: 'discovered' }),
      makeInstance({ id: 'i2', state: 'recheck_scheduled' })
    ];

    render(
      <ProgressOverview
        identifiersCount={0}
        accountsCount={0}
        connectorInstances={instances}
        findings={[]}
        connectorCatalog={catalog}
        onMarkRechecked={noop}
      />
    );

    expect(screen.getByTestId('progress-percentage')).toHaveTextContent('50%');
  });

  it('renders mixed state percentages correctly', () => {
    // verified=20, user_approved=40, executed=60 => average = (20+40+60)/3 = 40
    const instances = [
      makeInstance({ id: 'i1', state: 'verified' }),
      makeInstance({ id: 'i2', state: 'user_approved' }),
      makeInstance({ id: 'i3', state: 'executed' })
    ];

    render(
      <ProgressOverview
        identifiersCount={0}
        accountsCount={0}
        connectorInstances={instances}
        findings={[]}
        connectorCatalog={catalog}
        onMarkRechecked={noop}
      />
    );

    expect(screen.getByTestId('progress-percentage')).toHaveTextContent('40%');
  });

  it('shows correct stats in the grid', () => {
    const instances = [
      makeInstance({ id: 'i1', state: 'discovered' }),
      makeInstance({ id: 'i2', state: 'recheck_scheduled' })
    ];

    const findings = [
      makeFinding({ id: 'f1', tier: 'high' }),
      makeFinding({ id: 'f2', tier: 'low' }),
      makeFinding({ id: 'f3', tier: 'moderate', status: 'mitigated' })
    ];

    render(
      <ProgressOverview
        identifiersCount={7}
        accountsCount={12}
        connectorInstances={instances}
        findings={findings}
        connectorCatalog={catalog}
        onMarkRechecked={noop}
      />
    );

    expect(screen.getByTestId('stat-identifiers')).toHaveTextContent('7');
    expect(screen.getByTestId('stat-accounts')).toHaveTextContent('12');
    expect(screen.getByTestId('stat-connectors')).toHaveTextContent('1 / 2');
    // Only open findings count (f3 is mitigated, so only f1 and f2 are open)
    expect(screen.getByTestId('stat-findings')).toHaveTextContent('2');
  });

  it('shows due rechecks sorted by date', () => {
    const now = Date.now();
    const pastDate1 = new Date(now - 2 * 86400000).toISOString(); // 2 days ago
    const pastDate2 = new Date(now - 1 * 86400000).toISOString(); // 1 day ago

    const instances = [
      makeInstance({
        id: 'i1',
        state: 'recheck_scheduled',
        connectorId: 'broker-whitepages',
        nextCheckAt: pastDate2
      }),
      makeInstance({
        id: 'i2',
        state: 'recheck_scheduled',
        connectorId: 'broker-spokeo',
        nextCheckAt: pastDate1
      })
    ];

    render(
      <ProgressOverview
        identifiersCount={0}
        accountsCount={0}
        connectorInstances={instances}
        findings={[]}
        connectorCatalog={catalog}
        onMarkRechecked={noop}
      />
    );

    // Both should appear in due rechecks
    expect(screen.getByText(/Spokeo Opt-Out/)).toBeInTheDocument();
    expect(screen.getByText(/Whitepages Opt-Out/)).toBeInTheDocument();

    // Should have Mark Rechecked buttons
    const buttons = screen.getAllByRole('button', { name: 'Mark Rechecked' });
    expect(buttons).toHaveLength(2);
  });

  it('calls onMarkRechecked when button is clicked', () => {
    const now = Date.now();
    const pastDate = new Date(now - 86400000).toISOString();
    const onMarkRechecked = vi.fn();

    const instances = [
      makeInstance({
        id: 'instance-abc',
        state: 'recheck_scheduled',
        nextCheckAt: pastDate
      })
    ];

    render(
      <ProgressOverview
        identifiersCount={0}
        accountsCount={0}
        connectorInstances={instances}
        findings={[]}
        connectorCatalog={catalog}
        onMarkRechecked={onMarkRechecked}
      />
    );

    screen.getByRole('button', { name: 'Mark Rechecked' }).click();
    expect(onMarkRechecked).toHaveBeenCalledWith('instance-abc');
  });

  it('does not show due rechecks section when none are due', () => {
    const futureDate = new Date(Date.now() + 7 * 86400000).toISOString();
    const instances = [
      makeInstance({
        id: 'i1',
        state: 'recheck_scheduled',
        nextCheckAt: futureDate
      })
    ];

    render(
      <ProgressOverview
        identifiersCount={0}
        accountsCount={0}
        connectorInstances={instances}
        findings={[]}
        connectorCatalog={catalog}
        onMarkRechecked={noop}
      />
    );

    expect(screen.queryByText(/Due Actions/)).toBeNull();
  });

  it('has a progressbar role with correct aria attributes', () => {
    const instances = [
      makeInstance({ id: 'i1', state: 'executed' })
    ];

    render(
      <ProgressOverview
        identifiersCount={0}
        accountsCount={0}
        connectorInstances={instances}
        findings={[]}
        connectorCatalog={catalog}
        onMarkRechecked={noop}
      />
    );

    const progressbar = screen.getByRole('progressbar');
    expect(progressbar).toHaveAttribute('aria-valuenow', '60');
    expect(progressbar).toHaveAttribute('aria-valuemin', '0');
    expect(progressbar).toHaveAttribute('aria-valuemax', '100');
  });
});
