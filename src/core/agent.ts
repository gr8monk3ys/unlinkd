import { z } from 'zod';
import type { ConnectorStep, EvidenceMeta } from './types';
import type { EncryptedPayload, EncryptedPayloadV1 } from './crypto';

export interface AgentJobV1 {
  version: 1;
  jobId: string;
  createdAt: string;
  connectorId: string;
  connectorInstanceId: string;
  steps: Array<Extract<ConnectorStep, { type: 'agent' }>>;
  variables: Record<string, string>;
}

export interface AgentEvidenceItemV1 {
  meta: EvidenceMeta;
  payload: EncryptedPayload;
}

export interface AgentResultsV1 {
  version: 1;
  jobId: string;
  createdAt: string;
  finishedAt: string;
  connectorId: string;
  connectorInstanceId: string;
  evidence: AgentEvidenceItemV1[];
}

const encryptedPayloadV1Schema: z.ZodType<EncryptedPayloadV1> = z.object({
  version: z.literal(1),
  kdf: z.literal('pbkdf2-sha256'),
  iterations: z.number().int().positive(),
  salt: z.string().min(1),
  iv: z.string().min(1),
  ciphertext: z.string().min(1)
});

const encryptedPayloadLegacySchema = z.object({
  salt: z.string().min(1),
  iv: z.string().min(1),
  ciphertext: z.string().min(1)
});

const encryptedPayloadSchema: z.ZodType<EncryptedPayload> = z.union([
  encryptedPayloadV1Schema,
  encryptedPayloadLegacySchema
]);

const agentStepSchema = z.object({
  id: z.string().min(1),
  type: z.literal('agent'),
  title: z.string().min(1),
  action: z.object({
    kind: z.enum(['navigate', 'fill', 'click', 'waitForText', 'screenshot']),
    selector: z.string().optional(),
    value: z.string().optional(),
    url: z.string().optional()
  }),
  evidenceHint: z.string().optional()
});

const evidenceMetaSchema: z.ZodType<EvidenceMeta> = z.object({
  id: z.string().min(1),
  connectorInstanceId: z.string().min(1),
  kind: z.enum(['screenshot', 'pdf', 'email', 'note', 'file']),
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  size: z.number().nonnegative(),
  sha256: z.string().min(1),
  createdAt: z.string().min(1),
  label: z.string().optional()
});

const agentJobSchema: z.ZodType<AgentJobV1> = z.object({
  version: z.literal(1),
  jobId: z.string().min(1),
  createdAt: z.string().min(1),
  connectorId: z.string().min(1),
  connectorInstanceId: z.string().min(1),
  steps: z.array(agentStepSchema),
  variables: z.record(z.string(), z.string()).default({})
});

const agentResultsSchema: z.ZodType<AgentResultsV1> = z.object({
  version: z.literal(1),
  jobId: z.string().min(1),
  createdAt: z.string().min(1),
  finishedAt: z.string().min(1),
  connectorId: z.string().min(1),
  connectorInstanceId: z.string().min(1),
  evidence: z.array(
    z.object({
      meta: evidenceMetaSchema,
      payload: encryptedPayloadSchema
    })
  )
});

export function createAgentJobV1(params: {
  connectorId: string;
  connectorInstanceId: string;
  steps: Array<Extract<ConnectorStep, { type: 'agent' }>>;
  variables?: Record<string, string>;
}): AgentJobV1 {
  return {
    version: 1,
    jobId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    connectorId: params.connectorId,
    connectorInstanceId: params.connectorInstanceId,
    steps: params.steps,
    variables: params.variables ?? {}
  };
}

export function parseAgentJobV1(value: unknown): AgentJobV1 | null {
  const parsed = agentJobSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseAgentResultsV1(value: unknown): AgentResultsV1 | null {
  const parsed = agentResultsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
