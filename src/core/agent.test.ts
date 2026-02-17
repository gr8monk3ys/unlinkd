import { describe, it, expect } from 'vitest';
import { createAgentJobV1, parseAgentJobV1, parseAgentResultsV1 } from './agent';
import type { AgentJobV1, AgentResultsV1 } from './agent';

const VALID_STEP = {
  id: 'step-1',
  type: 'agent' as const,
  title: 'Navigate to opt-out page',
  action: {
    kind: 'navigate' as const,
    url: 'https://example.com/opt-out'
  }
};

const VALID_STEP_WITH_HINT = {
  id: 'step-2',
  type: 'agent' as const,
  title: 'Take screenshot of confirmation',
  action: {
    kind: 'screenshot' as const
  },
  evidenceHint: 'Capture the confirmation screen'
};

function makeValidJob(overrides: Partial<AgentJobV1> = {}): AgentJobV1 {
  return {
    version: 1,
    jobId: 'job-abc-123',
    createdAt: '2026-01-15T10:00:00.000Z',
    connectorId: 'connector-acme',
    connectorInstanceId: 'ci-001',
    steps: [VALID_STEP],
    variables: { username: 'alice' },
    ...overrides
  };
}

function makeValidResults(overrides: Partial<AgentResultsV1> = {}): AgentResultsV1 {
  return {
    version: 1,
    jobId: 'job-abc-123',
    createdAt: '2026-01-15T10:00:00.000Z',
    finishedAt: '2026-01-15T10:05:00.000Z',
    connectorId: 'connector-acme',
    connectorInstanceId: 'ci-001',
    evidence: [
      {
        meta: {
          id: 'ev-1',
          connectorInstanceId: 'ci-001',
          kind: 'screenshot',
          filename: 'confirmation.png',
          mimeType: 'image/png',
          size: 12345,
          sha256: 'abc123def456',
          createdAt: '2026-01-15T10:04:00.000Z'
        },
        payload: {
          version: 1,
          kdf: 'pbkdf2-sha256',
          iterations: 100000,
          salt: 'somesalt',
          iv: 'someiv',
          ciphertext: 'encrypted-data'
        }
      }
    ],
    ...overrides
  };
}

describe('agent', () => {
  describe('createAgentJobV1', () => {
    it('returns a valid job with version 1', () => {
      const job = createAgentJobV1({
        connectorId: 'connector-acme',
        connectorInstanceId: 'ci-001',
        steps: [VALID_STEP],
        variables: { username: 'alice' }
      });

      expect(job.version).toBe(1);
    });

    it('generates a jobId as a UUID', () => {
      const job = createAgentJobV1({
        connectorId: 'connector-acme',
        connectorInstanceId: 'ci-001',
        steps: [VALID_STEP]
      });

      expect(typeof job.jobId).toBe('string');
      expect(job.jobId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });

    it('generates unique jobIds on successive calls', () => {
      const job1 = createAgentJobV1({
        connectorId: 'c',
        connectorInstanceId: 'ci',
        steps: [VALID_STEP]
      });
      const job2 = createAgentJobV1({
        connectorId: 'c',
        connectorInstanceId: 'ci',
        steps: [VALID_STEP]
      });

      expect(job1.jobId).not.toBe(job2.jobId);
    });

    it('sets createdAt to an ISO-8601 timestamp', () => {
      const before = new Date().toISOString();
      const job = createAgentJobV1({
        connectorId: 'connector-acme',
        connectorInstanceId: 'ci-001',
        steps: [VALID_STEP]
      });
      const after = new Date().toISOString();

      expect(job.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(job.createdAt >= before).toBe(true);
      expect(job.createdAt <= after).toBe(true);
    });

    it('preserves connectorId, connectorInstanceId, and steps', () => {
      const steps = [VALID_STEP, VALID_STEP_WITH_HINT];
      const job = createAgentJobV1({
        connectorId: 'connector-acme',
        connectorInstanceId: 'ci-001',
        steps
      });

      expect(job.connectorId).toBe('connector-acme');
      expect(job.connectorInstanceId).toBe('ci-001');
      expect(job.steps).toEqual(steps);
    });

    it('passes through explicit variables', () => {
      const job = createAgentJobV1({
        connectorId: 'c',
        connectorInstanceId: 'ci',
        steps: [VALID_STEP],
        variables: { email: 'a@b.com', token: 'xyz' }
      });

      expect(job.variables).toEqual({ email: 'a@b.com', token: 'xyz' });
    });

    it('defaults variables to an empty object when omitted', () => {
      const job = createAgentJobV1({
        connectorId: 'connector-acme',
        connectorInstanceId: 'ci-001',
        steps: [VALID_STEP]
      });

      expect(job.variables).toEqual({});
    });

    it('returns a job that parseAgentJobV1 accepts', () => {
      const job = createAgentJobV1({
        connectorId: 'connector-acme',
        connectorInstanceId: 'ci-001',
        steps: [VALID_STEP, VALID_STEP_WITH_HINT],
        variables: { user: 'bob' }
      });

      const parsed = parseAgentJobV1(job);
      expect(parsed).not.toBeNull();
      expect(parsed!.jobId).toBe(job.jobId);
    });
  });

  describe('parseAgentJobV1', () => {
    it('parses a valid job', () => {
      const input = makeValidJob();
      const result = parseAgentJobV1(input);

      expect(result).not.toBeNull();
      expect(result!.version).toBe(1);
      expect(result!.jobId).toBe('job-abc-123');
      expect(result!.connectorId).toBe('connector-acme');
      expect(result!.connectorInstanceId).toBe('ci-001');
      expect(result!.steps).toHaveLength(1);
      expect(result!.variables).toEqual({ username: 'alice' });
    });

    it('parses a job with multiple steps', () => {
      const input = makeValidJob({ steps: [VALID_STEP, VALID_STEP_WITH_HINT] });
      const result = parseAgentJobV1(input);

      expect(result).not.toBeNull();
      expect(result!.steps).toHaveLength(2);
      expect(result!.steps[0]!.action.kind).toBe('navigate');
      expect(result!.steps[1]!.action.kind).toBe('screenshot');
      expect(result!.steps[1]!.evidenceHint).toBe('Capture the confirmation screen');
    });

    it('parses a job with empty steps array', () => {
      const input = makeValidJob({ steps: [] });
      const result = parseAgentJobV1(input);

      expect(result).not.toBeNull();
      expect(result!.steps).toEqual([]);
    });

    it('defaults variables to empty object when missing', () => {
      const input = makeValidJob();
      delete (input as Record<string, unknown>).variables;
      const result = parseAgentJobV1(input);

      expect(result).not.toBeNull();
      expect(result!.variables).toEqual({});
    });

    it('returns null for null input', () => {
      expect(parseAgentJobV1(null)).toBeNull();
    });

    it('returns null for undefined input', () => {
      expect(parseAgentJobV1(undefined)).toBeNull();
    });

    it('returns null for a non-object input', () => {
      expect(parseAgentJobV1('not an object')).toBeNull();
      expect(parseAgentJobV1(42)).toBeNull();
      expect(parseAgentJobV1(true)).toBeNull();
    });

    it('returns null when version is not 1', () => {
      expect(parseAgentJobV1(makeValidJob({ version: 2 as never }))).toBeNull();
      expect(parseAgentJobV1(makeValidJob({ version: 0 as never }))).toBeNull();
    });

    it('returns null when jobId is empty', () => {
      expect(parseAgentJobV1(makeValidJob({ jobId: '' }))).toBeNull();
    });

    it('returns null when connectorId is empty', () => {
      expect(parseAgentJobV1(makeValidJob({ connectorId: '' }))).toBeNull();
    });

    it('returns null when connectorInstanceId is empty', () => {
      expect(parseAgentJobV1(makeValidJob({ connectorInstanceId: '' }))).toBeNull();
    });

    it('returns null when createdAt is empty', () => {
      expect(parseAgentJobV1(makeValidJob({ createdAt: '' }))).toBeNull();
    });

    it('returns null when a required field is missing', () => {
      const noJobId = makeValidJob();
      delete (noJobId as Record<string, unknown>).jobId;
      expect(parseAgentJobV1(noJobId)).toBeNull();

      const noConnectorId = makeValidJob();
      delete (noConnectorId as Record<string, unknown>).connectorId;
      expect(parseAgentJobV1(noConnectorId)).toBeNull();

      const noCreatedAt = makeValidJob();
      delete (noCreatedAt as Record<string, unknown>).createdAt;
      expect(parseAgentJobV1(noCreatedAt)).toBeNull();
    });

    it('returns null when a step has wrong type', () => {
      const input = makeValidJob({
        steps: [{ ...VALID_STEP, type: 'manual' as never }]
      });
      expect(parseAgentJobV1(input)).toBeNull();
    });

    it('returns null when a step has invalid action kind', () => {
      const input = makeValidJob({
        steps: [
          {
            ...VALID_STEP,
            action: { kind: 'hover' as never }
          }
        ]
      });
      expect(parseAgentJobV1(input)).toBeNull();
    });

    it('returns null when a step has empty id', () => {
      const input = makeValidJob({
        steps: [{ ...VALID_STEP, id: '' }]
      });
      expect(parseAgentJobV1(input)).toBeNull();
    });

    it('returns null when a step has empty title', () => {
      const input = makeValidJob({
        steps: [{ ...VALID_STEP, title: '' }]
      });
      expect(parseAgentJobV1(input)).toBeNull();
    });
  });

  describe('parseAgentResultsV1', () => {
    it('parses valid results', () => {
      const input = makeValidResults();
      const result = parseAgentResultsV1(input);

      expect(result).not.toBeNull();
      expect(result!.version).toBe(1);
      expect(result!.jobId).toBe('job-abc-123');
      expect(result!.createdAt).toBe('2026-01-15T10:00:00.000Z');
      expect(result!.finishedAt).toBe('2026-01-15T10:05:00.000Z');
      expect(result!.connectorId).toBe('connector-acme');
      expect(result!.connectorInstanceId).toBe('ci-001');
      expect(result!.evidence).toHaveLength(1);
    });

    it('parses results with empty evidence array', () => {
      const input = makeValidResults({ evidence: [] });
      const result = parseAgentResultsV1(input);

      expect(result).not.toBeNull();
      expect(result!.evidence).toEqual([]);
    });

    it('parses results with legacy encrypted payload', () => {
      const input = makeValidResults({
        evidence: [
          {
            meta: {
              id: 'ev-2',
              connectorInstanceId: 'ci-001',
              kind: 'pdf',
              filename: 'report.pdf',
              mimeType: 'application/pdf',
              size: 5000,
              sha256: 'deadbeef',
              createdAt: '2026-01-15T10:03:00.000Z'
            },
            payload: {
              salt: 'legacy-salt',
              iv: 'legacy-iv',
              ciphertext: 'legacy-cipher'
            } as never
          }
        ]
      });
      const result = parseAgentResultsV1(input);

      expect(result).not.toBeNull();
      expect(result!.evidence).toHaveLength(1);
    });

    it('parses results with evidence label', () => {
      const input = makeValidResults();
      input.evidence[0]!.meta.label = 'Opt-out confirmation';
      const result = parseAgentResultsV1(input);

      expect(result).not.toBeNull();
      expect(result!.evidence[0]!.meta.label).toBe('Opt-out confirmation');
    });

    it('returns null for null input', () => {
      expect(parseAgentResultsV1(null)).toBeNull();
    });

    it('returns null for undefined input', () => {
      expect(parseAgentResultsV1(undefined)).toBeNull();
    });

    it('returns null for a non-object input', () => {
      expect(parseAgentResultsV1('string')).toBeNull();
      expect(parseAgentResultsV1(99)).toBeNull();
    });

    it('returns null when version is not 1', () => {
      expect(parseAgentResultsV1(makeValidResults({ version: 2 as never }))).toBeNull();
    });

    it('returns null when jobId is empty', () => {
      expect(parseAgentResultsV1(makeValidResults({ jobId: '' }))).toBeNull();
    });

    it('returns null when connectorId is empty', () => {
      expect(parseAgentResultsV1(makeValidResults({ connectorId: '' }))).toBeNull();
    });

    it('returns null when connectorInstanceId is empty', () => {
      expect(parseAgentResultsV1(makeValidResults({ connectorInstanceId: '' }))).toBeNull();
    });

    it('returns null when createdAt is empty', () => {
      expect(parseAgentResultsV1(makeValidResults({ createdAt: '' }))).toBeNull();
    });

    it('returns null when finishedAt is empty', () => {
      expect(parseAgentResultsV1(makeValidResults({ finishedAt: '' }))).toBeNull();
    });

    it('returns null when a required field is missing', () => {
      const noJobId = makeValidResults();
      delete (noJobId as Record<string, unknown>).jobId;
      expect(parseAgentResultsV1(noJobId)).toBeNull();

      const noFinishedAt = makeValidResults();
      delete (noFinishedAt as Record<string, unknown>).finishedAt;
      expect(parseAgentResultsV1(noFinishedAt)).toBeNull();
    });

    it('returns null when evidence meta has empty id', () => {
      const input = makeValidResults();
      input.evidence[0]!.meta.id = '';
      expect(parseAgentResultsV1(input)).toBeNull();
    });

    it('returns null when evidence meta has empty filename', () => {
      const input = makeValidResults();
      input.evidence[0]!.meta.filename = '';
      expect(parseAgentResultsV1(input)).toBeNull();
    });

    it('returns null when evidence meta has invalid kind', () => {
      const input = makeValidResults();
      (input.evidence[0]!.meta as Record<string, unknown>).kind = 'video';
      expect(parseAgentResultsV1(input)).toBeNull();
    });

    it('returns null when evidence payload has empty ciphertext', () => {
      const input = makeValidResults();
      (input.evidence[0]!.payload as Record<string, unknown>).ciphertext = '';
      expect(parseAgentResultsV1(input)).toBeNull();
    });

    it('returns null when evidence meta has negative size', () => {
      const input = makeValidResults();
      input.evidence[0]!.meta.size = -1;
      expect(parseAgentResultsV1(input)).toBeNull();
    });
  });
});
