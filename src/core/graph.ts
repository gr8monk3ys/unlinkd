import type { ExposureEdge, ExposureGraph, ExposureNode, Identifier } from './types';

function asNode(identifier: Identifier): ExposureNode {
  return {
    id: identifier.id,
    label: `${identifier.type}:${identifier.value}`,
    type: identifier.type
  };
}

function inferEdge(source: Identifier, target: Identifier): ExposureEdge | null {
  if (source.id === target.id) {
    return null;
  }

  const sameValue = source.value.toLowerCase() === target.value.toLowerCase();
  if (!sameValue) {
    return null;
  }

  if (source.type === 'email' && target.type === 'email') {
    return { source: source.id, target: target.id, reason: 'email_reuse' };
  }

  if (source.type === 'username' && target.type === 'username') {
    return { source: source.id, target: target.id, reason: 'username_reuse' };
  }

  if (source.type === 'phone' || target.type === 'phone') {
    return { source: source.id, target: target.id, reason: 'phone_recovery' };
  }

  return null;
}

export function buildExposureGraph(identifiers: Identifier[]): ExposureGraph {
  const consentedIdentifiers = identifiers.filter((item) => item.consent);
  const nodes = consentedIdentifiers.map(asNode);
  const edges = new Map<string, ExposureEdge>();

  consentedIdentifiers.forEach((source) => {
    consentedIdentifiers.forEach((target) => {
      const edge = inferEdge(source, target);
      if (edge) {
        const key = [edge.source, edge.target].sort().join(':');
        edges.set(key, edge);
      }
    });
  });

  return {
    nodes,
    edges: [...edges.values()]
  };
}
