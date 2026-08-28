import { nowIso } from '../utils';
import type { ConnectorInstance, RemovalRequest, RequestChannel, RequestOutcome, RequestResponse } from '../types';
import { findBasis } from './profiles';

export interface NewRequestInput {
  profileId: string;
  basisId: string;
  channel: RequestChannel;
  /** ISO timestamp. Defaults to now. */
  sentAt?: string;
  recipient?: string;
  notes?: string;
}

export interface RequestValidationError {
  field: 'profileId' | 'basisId' | 'sentAt';
  message: string;
}

/**
 * Reject what would produce a meaningless deadline. A send date in the future
 * is the important one: it would silently push the clock out and make an
 * overdue request look healthy.
 */
export function validateNewRequest(
  input: NewRequestInput,
  now: number = Date.now()
): RequestValidationError | null {
  if (!findBasis(input.profileId, input.basisId)) {
    return { field: 'basisId', message: 'Choose the legal basis the request was made under.' };
  }

  if (input.sentAt !== undefined) {
    const sentAt = Date.parse(input.sentAt);
    if (!Number.isFinite(sentAt)) {
      return { field: 'sentAt', message: 'Enter the date the request was sent.' };
    }
    if (sentAt > now) {
      return { field: 'sentAt', message: 'A request cannot have been sent in the future.' };
    }
  }

  return null;
}

export function createRequest(input: NewRequestInput): RemovalRequest {
  return {
    id: crypto.randomUUID(),
    profileId: input.profileId,
    basisId: input.basisId,
    channel: input.channel,
    recipient: input.recipient,
    sentAt: input.sentAt ?? nowIso(),
    responses: [],
    notes: input.notes
  };
}

export function createResponse(
  outcome: RequestOutcome,
  options: { receivedAt?: string; note?: string; evidenceId?: string; extensionClaimed?: boolean } = {}
): RequestResponse {
  return {
    id: crypto.randomUUID(),
    receivedAt: options.receivedAt ?? nowIso(),
    outcome,
    note: options.note,
    evidenceId: options.evidenceId,
    extensionClaimed: options.extensionClaimed
  };
}

/** Requests on an instance, tolerating vaults written before request tracking. */
export function instanceRequests(instance: ConnectorInstance): RemovalRequest[] {
  return instance.requests ?? [];
}

export function addRequest(instance: ConnectorInstance, request: RemovalRequest): ConnectorInstance {
  return {
    ...instance,
    requests: [...instanceRequests(instance), request],
    updatedAt: nowIso()
  };
}

export function addResponse(
  instance: ConnectorInstance,
  requestId: string,
  response: RequestResponse
): ConnectorInstance {
  return {
    ...instance,
    requests: instanceRequests(instance).map((request) =>
      request.id === requestId ? { ...request, responses: [...request.responses, response] } : request
    ),
    updatedAt: nowIso()
  };
}

export function closeRequest(instance: ConnectorInstance, requestId: string): ConnectorInstance {
  return {
    ...instance,
    requests: instanceRequests(instance).map((request) =>
      request.id === requestId ? { ...request, closedAt: request.closedAt ?? nowIso() } : request
    ),
    updatedAt: nowIso()
  };
}

export const requestChannelLabels: Record<RequestChannel, string> = {
  web_form: 'Web form',
  email: 'Email',
  postal: 'Post',
  phone: 'Phone',
  in_app: 'In-app'
};

export const requestOutcomeLabels: Record<RequestOutcome, string> = {
  acknowledged: 'Acknowledged',
  completed: 'Completed',
  refused: 'Refused',
  identity_required: 'Identity verification required',
  partial: 'Partially actioned'
};
