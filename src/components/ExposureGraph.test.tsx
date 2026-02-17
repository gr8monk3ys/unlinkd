import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ExposureGraph } from './ExposureGraph';

describe('ExposureGraph', () => {
  it('shows empty state when there are no nodes', () => {
    render(
      <ExposureGraph
        nodes={[]}
        edges={[]}
        personaName="Alice"
      />
    );

    expect(screen.getByTestId('exposure-graph-empty')).toHaveTextContent(
      'Add identifiers to see your exposure graph'
    );
    expect(screen.queryByTestId('exposure-graph-svg')).toBeNull();
  });

  it('renders an SVG when nodes are provided', () => {
    const nodes = [
      { id: 'n1', label: 'email:alice@test.com', type: 'identifier' },
      { id: 'n2', label: 'email:bob@test.com', type: 'identifier' }
    ];

    render(
      <ExposureGraph
        nodes={nodes}
        edges={[]}
        personaName="Alice"
      />
    );

    expect(screen.getByTestId('exposure-graph-svg')).toBeInTheDocument();
    expect(screen.queryByTestId('exposure-graph-empty')).toBeNull();
  });

  it('renders the correct number of node elements', () => {
    const nodes = [
      { id: 'n1', label: 'email:a@test.com', type: 'email' },
      { id: 'n2', label: 'phone:555-0100', type: 'phone' },
      { id: 'n3', label: 'username:jdoe', type: 'username' }
    ];

    render(
      <ExposureGraph
        nodes={nodes}
        edges={[]}
        personaName="TestPersona"
      />
    );

    expect(screen.getByTestId('graph-node-n1')).toBeInTheDocument();
    expect(screen.getByTestId('graph-node-n2')).toBeInTheDocument();
    expect(screen.getByTestId('graph-node-n3')).toBeInTheDocument();
  });

  it('renders edges as line elements in the SVG', () => {
    const nodes = [
      { id: 'n1', label: 'email:same@test.com', type: 'email' },
      { id: 'n2', label: 'email:same@test.com', type: 'email' }
    ];

    const edges = [
      { source: 'n1', target: 'n2', label: 'email_reuse' }
    ];

    const { container } = render(
      <ExposureGraph
        nodes={nodes}
        edges={edges}
        personaName="Persona"
      />
    );

    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();

    // There should be edge lines (dashed red) plus structural lines (spokes)
    const lines = svg!.querySelectorAll('line');
    expect(lines.length).toBeGreaterThanOrEqual(1);

    // At least one dashed line (the edge)
    const dashedLines = [...lines].filter(
      (line) => line.getAttribute('stroke-dasharray') === '4 2'
    );
    expect(dashedLines).toHaveLength(1);
  });

  it('renders persona name in the center', () => {
    const nodes = [
      { id: 'n1', label: 'email:x@test.com', type: 'email' }
    ];

    render(
      <ExposureGraph
        nodes={nodes}
        edges={[]}
        personaName="MyPersona"
      />
    );

    const svg = screen.getByTestId('exposure-graph-svg');
    expect(svg).toHaveAttribute(
      'aria-label',
      'Exposure graph for MyPersona with 1 identifiers and 0 connections'
    );
  });

  it('shows type labels in the legend', () => {
    const nodes = [
      { id: 'n1', label: 'email:a@test.com', type: 'email' },
      { id: 'n2', label: 'phone:555-0100', type: 'phone' }
    ];

    render(
      <ExposureGraph
        nodes={nodes}
        edges={[]}
        personaName="Test"
      />
    );

    // "email" and "phone" appear in both the legend and the SVG type group labels
    expect(screen.getAllByText('email').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('phone').length).toBeGreaterThanOrEqual(1);
  });

  it('truncates long labels by default', () => {
    const longLabel = 'email:very-long-email-address@extremely-long-domain.example.com';
    const nodes = [
      { id: 'n1', label: longLabel, type: 'email' }
    ];

    render(
      <ExposureGraph
        nodes={nodes}
        edges={[]}
        personaName="Test"
      />
    );

    // The label should be truncated (not the full string)
    const svg = screen.getByTestId('exposure-graph-svg');
    const texts = svg.querySelectorAll('text');
    const nodeTexts = [...texts].map((t) => t.textContent);
    // The full label should NOT appear (it's > 20 chars)
    expect(nodeTexts).not.toContain(longLabel);
    // A truncated version should appear
    const truncated = nodeTexts.find((t) => t && t.endsWith('...'));
    expect(truncated).toBeTruthy();
  });

  it('handles a single node without errors', () => {
    const nodes = [
      { id: 'n1', label: 'email:solo@test.com', type: 'email' }
    ];

    render(
      <ExposureGraph
        nodes={nodes}
        edges={[]}
        personaName="Solo"
      />
    );

    expect(screen.getByTestId('graph-node-n1')).toBeInTheDocument();
    expect(screen.getByTestId('exposure-graph-svg')).toBeInTheDocument();
  });

  it('renders multiple edges correctly', () => {
    const nodes = [
      { id: 'n1', label: 'email:a@test.com', type: 'email' },
      { id: 'n2', label: 'email:a@test.com', type: 'email' },
      { id: 'n3', label: 'username:jdoe', type: 'username' },
      { id: 'n4', label: 'username:jdoe', type: 'username' }
    ];

    const edges = [
      { source: 'n1', target: 'n2' },
      { source: 'n3', target: 'n4' }
    ];

    const { container } = render(
      <ExposureGraph
        nodes={nodes}
        edges={edges}
        personaName="MultiEdge"
      />
    );

    const svg = container.querySelector('svg');
    const dashedLines = [...svg!.querySelectorAll('line')].filter(
      (line) => line.getAttribute('stroke-dasharray') === '4 2'
    );
    expect(dashedLines).toHaveLength(2);
  });

  it('renders different colors for different types', () => {
    const nodes = [
      { id: 'n1', label: 'email:a@t.com', type: 'email' },
      { id: 'n2', label: 'phone:555', type: 'phone' }
    ];

    const { container } = render(
      <ExposureGraph
        nodes={nodes}
        edges={[]}
        personaName="Colors"
      />
    );

    const svg = container.querySelector('svg');
    const circles = svg!.querySelectorAll('circle');

    // Should have circles with different fill colors
    const fills = [...circles].map((c) => c.getAttribute('fill'));
    // Center node is #333, type groups and individual nodes have type-based colors
    expect(fills).toContain('#333'); // persona center
    expect(fills).toContain('#2196f3'); // email color
    expect(fills).toContain('#4caf50'); // phone color
  });
});
