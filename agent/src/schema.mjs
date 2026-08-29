import { z } from 'zod';

export const agentStepSchema = z.object({
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

export const agentJobSchema = z.object({
  version: z.literal(1),
  jobId: z.string().min(1),
  createdAt: z.string().min(1),
  connectorId: z.string().min(1),
  connectorInstanceId: z.string().min(1),
  steps: z.array(agentStepSchema),
  variables: z.record(z.string()).optional()
});

export const encryptedPayloadV1Schema = z.object({
  version: z.literal(1),
  kdf: z.literal('pbkdf2-sha256'),
  iterations: z.number().int().positive(),
  salt: z.string().min(1),
  iv: z.string().min(1),
  ciphertext: z.string().min(1)
});

export const evidenceMetaSchema = z.object({
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

export const agentResultsSchema = z.object({
  version: z.literal(1),
  jobId: z.string().min(1),
  createdAt: z.string().min(1),
  finishedAt: z.string().min(1),
  connectorId: z.string().min(1),
  connectorInstanceId: z.string().min(1),
  evidence: z.array(
    z.object({
      meta: evidenceMetaSchema,
      payload: encryptedPayloadV1Schema
    })
  )
});
