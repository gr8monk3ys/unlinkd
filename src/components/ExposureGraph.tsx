import { memo, useCallback, useState } from 'react';

export interface ExposureGraphProps {
  nodes: Array<{ id: string; label: string; type: string }>;
  edges: Array<{ source: string; target: string; label?: string }>;
  personaName: string;
}

const TYPE_COLORS: Record<string, string> = {
  email: '#2196f3',
  phone: '#4caf50',
  username: '#ff9800',
  legal_name: '#9c27b0',
  address: '#f44336',
  device: '#607d8b',
  account: '#795548',
  broker_listing: '#e91e63'
};

function getColor(type: string): string {
  return TYPE_COLORS[type] ?? '#999';
}

function truncateLabel(label: string, maxLen: number): string {
  if (label.length <= maxLen) {
    return label;
  }
  return label.slice(0, maxLen - 3) + '...';
}

interface NodePosition {
  x: number;
  y: number;
}

interface LayoutResult {
  positions: Map<string, NodePosition>;
  width: number;
  height: number;
}

function computeLayout(
  nodes: ExposureGraphProps['nodes']
): LayoutResult {
  if (nodes.length === 0) {
    return { positions: new Map(), width: 400, height: 300 };
  }

  // Group nodes by type
  const groups = new Map<string, ExposureGraphProps['nodes']>();
  for (const node of nodes) {
    const existing = groups.get(node.type) ?? [];
    existing.push(node);
    groups.set(node.type, existing);
  }

  const groupKeys = [...groups.keys()];
  const groupCount = groupKeys.length;

  // Calculate sizing based on node count
  const baseRadius = Math.max(80, Math.min(160, 40 + nodes.length * 12));
  const outerRadius = baseRadius + Math.max(60, Math.min(120, 30 + nodes.length * 8));
  const padding = 80;
  const size = (outerRadius + padding) * 2;

  const centerX = size / 2;
  const centerY = size / 2;

  const positions = new Map<string, NodePosition>();

  // Place center node (persona)
  positions.set('__persona__', { x: centerX, y: centerY });

  // Place type groups on inner ring, individual nodes on outer ring
  groupKeys.forEach((type, groupIndex) => {
    const groupAngle = (2 * Math.PI * groupIndex) / groupCount - Math.PI / 2;
    const groupX = centerX + baseRadius * Math.cos(groupAngle);
    const groupY = centerY + baseRadius * Math.sin(groupAngle);

    // Place the type group anchor
    positions.set(`__group_${type}__`, { x: groupX, y: groupY });

    const nodesInGroup = groups.get(type) ?? [];
    const spreadAngle = Math.min(Math.PI / 3, (Math.PI * 2) / (groupCount * 1.5));

    nodesInGroup.forEach((node, nodeIndex) => {
      let nodeAngle: number;
      if (nodesInGroup.length === 1) {
        nodeAngle = groupAngle;
      } else {
        const offset = (nodeIndex / (nodesInGroup.length - 1) - 0.5) * spreadAngle;
        nodeAngle = groupAngle + offset;
      }

      const nodeX = centerX + outerRadius * Math.cos(nodeAngle);
      const nodeY = centerY + outerRadius * Math.sin(nodeAngle);
      positions.set(node.id, { x: nodeX, y: nodeY });
    });
  });

  return { positions, width: size, height: size };
}

function ExposureGraphInner(props: ExposureGraphProps): React.JSX.Element {
  const { nodes, edges, personaName } = props;
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const handleMouseEnter = useCallback((nodeId: string) => {
    setHoveredNode(nodeId);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoveredNode(null);
  }, []);

  if (nodes.length === 0) {
    return (
      <section aria-label="Exposure graph">
        <h3>Exposure Graph</h3>
        <p data-testid="exposure-graph-empty">Add identifiers to see your exposure graph</p>
      </section>
    );
  }

  const layout = computeLayout(nodes);
  const { positions, width, height } = layout;

  // Collect unique types for the legend
  const types = [...new Set(nodes.map((n) => n.type))];

  const personaPos = positions.get('__persona__')!;
  const nodeRadius = 8;
  const groupRadius = 5;

  return (
    <section aria-label="Exposure graph">
      <h3>Exposure Graph</h3>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '8px', fontSize: '12px' }}>
        {types.map((type) => (
          <span key={type} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span
              style={{
                display: 'inline-block',
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                backgroundColor: getColor(type)
              }}
            />
            {type}
          </span>
        ))}
      </div>

      <svg
        data-testid="exposure-graph-svg"
        width="100%"
        viewBox={`0 0 ${width} ${height}`}
        style={{ maxWidth: `${width}px`, border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--card-bg, #1a1f2e)' }}
        role="img"
        aria-label={`Exposure graph for ${personaName} with ${nodes.length} identifiers and ${edges.length} connections`}
      >
        {/* Edges between nodes sharing cross-persona reuse */}
        {edges.map((edge, i) => {
          const sourcePos = positions.get(edge.source);
          const targetPos = positions.get(edge.target);
          if (!sourcePos || !targetPos) {
            return null;
          }
          return (
            <line
              key={`edge-${i}`}
              x1={sourcePos.x}
              y1={sourcePos.y}
              x2={targetPos.x}
              y2={targetPos.y}
              stroke="#e57373"
              strokeWidth={1.5}
              strokeDasharray="4 2"
              opacity={0.6}
            />
          );
        })}

        {/* Lines from persona center to type groups */}
        {types.map((type) => {
          const groupPos = positions.get(`__group_${type}__`);
          if (!groupPos) {
            return null;
          }
          return (
            <line
              key={`spoke-${type}`}
              x1={personaPos.x}
              y1={personaPos.y}
              x2={groupPos.x}
              y2={groupPos.y}
              stroke="#555"
              strokeWidth={1}
            />
          );
        })}

        {/* Lines from type groups to individual nodes */}
        {nodes.map((node) => {
          const groupPos = positions.get(`__group_${node.type}__`);
          const nodePos = positions.get(node.id);
          if (!groupPos || !nodePos) {
            return null;
          }
          return (
            <line
              key={`link-${node.id}`}
              x1={groupPos.x}
              y1={groupPos.y}
              x2={nodePos.x}
              y2={nodePos.y}
              stroke={getColor(node.type)}
              strokeWidth={1}
              opacity={0.4}
            />
          );
        })}

        {/* Type group circles */}
        {types.map((type) => {
          const groupPos = positions.get(`__group_${type}__`);
          if (!groupPos) {
            return null;
          }
          return (
            <g key={`group-${type}`}>
              <circle
                cx={groupPos.x}
                cy={groupPos.y}
                r={groupRadius}
                fill={getColor(type)}
                opacity={0.5}
              />
              <text
                x={groupPos.x}
                y={groupPos.y - groupRadius - 4}
                textAnchor="middle"
                fontSize="10"
                fill="#aaa"
                fontWeight={600}
              >
                {type}
              </text>
            </g>
          );
        })}

        {/* Individual node circles */}
        {nodes.map((node) => {
          const nodePos = positions.get(node.id);
          if (!nodePos) {
            return null;
          }
          const isHovered = hoveredNode === node.id;
          const displayLabel = isHovered ? node.label : truncateLabel(node.label, 20);

          return (
            <g
              key={node.id}
              data-testid={`graph-node-${node.id}`}
              onMouseEnter={() => handleMouseEnter(node.id)}
              onMouseLeave={handleMouseLeave}
              style={{ cursor: 'pointer' }}
            >
              <circle
                cx={nodePos.x}
                cy={nodePos.y}
                r={isHovered ? nodeRadius + 2 : nodeRadius}
                fill={getColor(node.type)}
                stroke={isHovered ? '#333' : 'none'}
                strokeWidth={isHovered ? 2 : 0}
              />
              <text
                x={nodePos.x}
                y={nodePos.y + nodeRadius + 14}
                textAnchor="middle"
                fontSize={isHovered ? '11' : '9'}
                fill={isHovered ? '#fff' : '#bbb'}
                fontWeight={isHovered ? 600 : 400}
              >
                {displayLabel}
              </text>
            </g>
          );
        })}

        {/* Center persona node */}
        <circle
          cx={personaPos.x}
          cy={personaPos.y}
          r={14}
          fill="#333"
          stroke="#fff"
          strokeWidth={2}
        />
        <text
          x={personaPos.x}
          y={personaPos.y + 4}
          textAnchor="middle"
          fontSize="10"
          fill="#fff"
          fontWeight={700}
        >
          {truncateLabel(personaName, 10)}
        </text>
      </svg>
    </section>
  );
}

export const ExposureGraph = memo(ExposureGraphInner);
