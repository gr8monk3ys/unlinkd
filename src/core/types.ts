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
  personaId?: string;
  type: IdentifierType;
  value: string;
  sensitivity: 1 | 2 | 3;
  consent: boolean;
  createdAt?: string;
}

export interface Persona {
  id: string;
  name: string;
  notes?: string;
  createdAt: string;
}

export type AccountStatus = 'active' | 'unused' | 'removed' | 'unknown';

export interface Account {
  id: string;
  personaId: string;
  service: string;
  username: string;
  url?: string;
  lastSeenAt?: string;
  mfaEnabled?: boolean;
  status: AccountStatus;
  createdAt: string;
}

export interface ExposureNode {
  id: string;
  label: string;
  type: 'identifier' | 'account' | 'broker_listing' | 'email' | 'phone' | 'username' | 'address' | 'legal_name' | 'device';
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
  personaId?: string;
  status?: 'open' | 'in_progress' | 'mitigated';
  source?: 'local' | 'import' | 'agent';
  createdAt?: string;
  connectorInstanceId?: string;
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

export type ConnectorCategory = 'broker' | 'account' | 'search' | 'other';

export type ConnectorStep =
  | {
      id: string;
      type: 'manual';
      title: string;
      instructions: string;
      evidenceHint?: string;
    }
  | {
      id: string;
      type: 'agent';
      title: string;
      action: {
        kind: 'navigate' | 'fill' | 'click' | 'waitForText' | 'screenshot';
        selector?: string;
        value?: string;
        url?: string;
      };
      evidenceHint?: string;
    };

export interface ConnectorDefinition {
  id: string;
  name: string;
  category: ConnectorCategory;
  description: string;
  defaultRecheckDays: number;
  steps: ConnectorStep[];
  jurisdictions?: string[];
}

export type EvidenceKind = 'screenshot' | 'pdf' | 'email' | 'note' | 'file';

export interface EvidenceMeta {
  id: string;
  connectorInstanceId: string;
  kind: EvidenceKind;
  filename: string;
  mimeType: string;
  size: number;
  sha256: string;
  createdAt: string;
  label?: string;
}

export interface ConnectorInstance {
  id: string;
  connectorId: string;
  personaId: string;
  state: ConnectorState;
  createdAt: string;
  updatedAt: string;
  nextCheckAt?: string;
  evidence: EvidenceMeta[];
  notes?: string;
}
