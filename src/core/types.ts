export type IdentifierType =
  | 'legal_name'
  | 'email'
  | 'phone'
  | 'username'
  | 'address'
  | 'device';

export type ThreatTier = 'low' | 'moderate' | 'high';

export interface Identifier {
  id: string;
  type: IdentifierType;
  value: string;
  sensitivity: 1 | 2 | 3;
  consent: boolean;
}

export interface ExposureNode {
  id: string;
  label: string;
  type: 'identifier' | 'account' | 'broker_listing';
}

export interface ExposureEdge {
  source: string;
  target: string;
  reason: 'email_reuse' | 'username_reuse' | 'phone_recovery' | 'device_fingerprint';
}

export interface RiskFinding {
  id: string;
  title: string;
  harm: number;
  exploitability: number;
  tier: ThreatTier;
}

export interface ExposureGraph {
  nodes: ExposureNode[];
  edges: ExposureEdge[];
}

export type ConnectorState =
  | 'discovered'
  | 'verified'
  | 'user_approved'
  | 'executed'
  | 'proof_captured'
  | 'recheck_scheduled';
