import type { AuditAction } from '../core/audit';
import {
  addRequest,
  addResponse,
  closeRequest,
  createRequest,
  createResponse,
  type NewRequestInput
} from '../core/compliance/requests';
import { validateNewRequest } from '../core/compliance/requests';
import type { RequestOutcome } from '../core/types';
import type { VaultStateV1 } from '../core/vault';

/**
 * Vault plumbing borrowed from useUnlinkdApp.
 *
 * Passing these in rather than reaching for them keeps request handling out of
 * that hook (already 1500+ lines) and lets these handlers be exercised without
 * mounting the whole app.
 */
export interface RemovalRequestDeps {
  vault: VaultStateV1 | null;
  setVault: (next: VaultStateV1) => void;
  persist: (next: VaultStateV1) => Promise<boolean>;
  audit: (action: AuditAction, details: string) => Promise<void>;
  withBusy: <T>(fn: () => Promise<T>) => Promise<T | null>;
  setError: (message: string | null) => void;
}

export interface RemovalRequestHandlers {
  handleRecordRequest: (instanceId: string, input: NewRequestInput) => Promise<boolean>;
  handleRecordResponse: (
    instanceId: string,
    requestId: string,
    outcome: RequestOutcome,
    options?: { receivedAt?: string; note?: string; extensionClaimed?: boolean }
  ) => Promise<boolean>;
  handleCloseRequest: (instanceId: string, requestId: string) => Promise<boolean>;
}

function replaceInstance(vault: VaultStateV1, instanceId: string, map: (i: VaultStateV1['connectorInstances'][number]) => VaultStateV1['connectorInstances'][number]): VaultStateV1 {
  return {
    ...vault,
    connectorInstances: vault.connectorInstances.map((instance) =>
      instance.id === instanceId ? map(instance) : instance
    )
  };
}

export function useRemovalRequests(deps: RemovalRequestDeps): RemovalRequestHandlers {
  const { vault, setVault, persist, audit, withBusy, setError } = deps;

  async function handleRecordRequest(instanceId: string, input: NewRequestInput): Promise<boolean> {
    if (!vault) {
      return false;
    }

    const result = await withBusy(async () => {
      setError(null);

      const instance = vault.connectorInstances.find((item) => item.id === instanceId);
      if (!instance) {
        setError('That connector is no longer in the vault.');
        return false;
      }

      const invalid = validateNewRequest(input);
      if (invalid) {
        setError(invalid.message);
        return false;
      }

      const request = createRequest(input);
      const next = replaceInstance(vault, instanceId, (item) => addRequest(item, request));

      setVault(next);
      if (!(await persist(next))) {
        return false;
      }
      await audit('request_sent', `connector:${instance.connectorId}:${input.basisId}`);
      return true;
    });

    return result ?? false;
  }

  async function handleRecordResponse(
    instanceId: string,
    requestId: string,
    outcome: RequestOutcome,
    options: { receivedAt?: string; note?: string; extensionClaimed?: boolean } = {}
  ): Promise<boolean> {
    if (!vault) {
      return false;
    }

    const result = await withBusy(async () => {
      setError(null);

      const instance = vault.connectorInstances.find((item) => item.id === instanceId);
      if (!instance) {
        setError('That connector is no longer in the vault.');
        return false;
      }

      const response = createResponse(outcome, options);
      const next = replaceInstance(vault, instanceId, (item) => addResponse(item, requestId, response));

      setVault(next);
      if (!(await persist(next))) {
        return false;
      }
      await audit('request_response_recorded', `connector:${instance.connectorId}:${outcome}`);
      return true;
    });

    return result ?? false;
  }

  async function handleCloseRequest(instanceId: string, requestId: string): Promise<boolean> {
    if (!vault) {
      return false;
    }

    const result = await withBusy(async () => {
      setError(null);

      const instance = vault.connectorInstances.find((item) => item.id === instanceId);
      if (!instance) {
        setError('That connector is no longer in the vault.');
        return false;
      }

      const next = replaceInstance(vault, instanceId, (item) => closeRequest(item, requestId));

      setVault(next);
      if (!(await persist(next))) {
        return false;
      }
      await audit('request_closed', `connector:${instance.connectorId}:${requestId}`);
      return true;
    });

    return result ?? false;
  }

  return { handleRecordRequest, handleRecordResponse, handleCloseRequest };
}
