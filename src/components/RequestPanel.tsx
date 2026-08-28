import { useState } from 'react';
import type { ConnectorInstance, RequestChannel, RequestOutcome } from '../core/types';
import { computeDeadline } from '../core/compliance/deadlines';
import { COMPLIANCE_PROFILES } from '../core/compliance/profiles';
import {
  instanceRequests,
  requestChannelLabels,
  requestOutcomeGuidance,
  requestOutcomeLabels,
  type NewRequestInput
} from '../core/compliance/requests';

export interface RequestPanelProps {
  instance: ConnectorInstance;
  onRecordRequest: (instanceId: string, input: NewRequestInput) => Promise<boolean>;
  onRecordResponse: (
    instanceId: string,
    requestId: string,
    outcome: RequestOutcome,
    options?: { extensionClaimed?: boolean }
  ) => Promise<boolean>;
}

const CHANNELS: RequestChannel[] = ['web_form', 'email', 'postal', 'phone', 'in_app'];
const OUTCOMES: RequestOutcome[] = ['acknowledged', 'completed', 'refused', 'identity_required', 'partial'];

/** Sentinel select value: acknowledged *and* the operator invoked its extension. */
const EXTENSION_CHOICE = 'acknowledged+extension';

const STATUS_LABELS: Record<string, string> = {
  overdue: 'Past deadline',
  due_soon: 'Due soon',
  pending: 'Awaiting reply',
  closed: 'Closed',
  unknown: 'No deadline'
};

/** Today in YYYY-MM-DD, for the date input's default and max. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Records what was asked of an operator, when, and under which right — the
 * facts the deadline engine needs and an escalation would have to cite.
 */
export function RequestPanel(props: RequestPanelProps): React.JSX.Element {
  const { instance, onRecordRequest, onRecordResponse } = props;

  const [profileId, setProfileId] = useState(COMPLIANCE_PROFILES[0]?.id ?? 'gdpr');
  const [basisId, setBasisId] = useState(COMPLIANCE_PROFILES[0]?.bases[0]?.id ?? '');
  const [channel, setChannel] = useState<RequestChannel>('web_form');
  const [sentAt, setSentAt] = useState(today());
  const [recipient, setRecipient] = useState('');

  const profile = COMPLIANCE_PROFILES.find((candidate) => candidate.id === profileId);
  const requests = instanceRequests(instance);

  function selectProfile(nextId: string): void {
    setProfileId(nextId);
    // The basis list is profile-specific, so a stale selection would be invalid.
    const next = COMPLIANCE_PROFILES.find((candidate) => candidate.id === nextId);
    setBasisId(next?.bases[0]?.id ?? '');
  }

  return (
    <section>
      <h4 style={{ margin: '8px 0 4px 0' }}>Removal requests</h4>

      {requests.length === 0 ? (
        <p style={{ fontSize: '0.9em', opacity: 0.85 }}>
          No request recorded yet. Logging when you asked, and under which right, is what lets this app tell you
          when the operator is late.
        </p>
      ) : (
        <ul>
          {requests.map((request) => {
            const computation = computeDeadline(request, COMPLIANCE_PROFILES);
            return (
              <li key={request.id} style={{ marginBottom: '8px' }}>
                <strong>{STATUS_LABELS[computation.status] ?? computation.status}</strong>
                {computation.dueAt ? ` — due ${computation.dueAt}` : ''}
                <div style={{ fontSize: '0.85em', opacity: 0.85 }}>
                  {computation.basis?.citation ?? `${request.profileId}/${request.basisId}`}
                  {` · sent ${request.sentAt.slice(0, 10)} by ${requestChannelLabels[request.channel]}`}
                  {request.recipient ? ` · to ${request.recipient}` : ''}
                </div>
                {request.responses.length > 0 ? (
                  <ul style={{ fontSize: '0.85em' }}>
                    {request.responses.map((response) => (
                      <li key={response.id}>
                        {`${response.receivedAt.slice(0, 10)}: ${requestOutcomeLabels[response.outcome]}`}
                        {response.extensionClaimed ? ' (extension claimed)' : ''}
                        {requestOutcomeGuidance[response.outcome] ? (
                          <p style={{ margin: '2px 0', opacity: 0.85 }} role="note">
                            {requestOutcomeGuidance[response.outcome]}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {computation.status !== 'closed' ? (
                  <div style={{ marginTop: '4px' }}>
                    <label htmlFor={`response-${request.id}`} style={{ fontSize: '0.85em' }}>
                      Record reply
                    </label>{' '}
                    <select
                      id={`response-${request.id}`}
                      defaultValue=""
                      onChange={(event) => {
                        const choice = event.target.value;
                        if (!choice) return;
                        event.target.value = '';
                        // The extension is a claim about the clock rather than an
                        // outcome, so it rides alongside 'acknowledged'.
                        const extensionClaimed = choice === EXTENSION_CHOICE;
                        const outcome = (extensionClaimed ? 'acknowledged' : choice) as RequestOutcome;
                        void onRecordResponse(instance.id, request.id, outcome, { extensionClaimed });
                      }}
                    >
                      <option value="">Choose…</option>
                      {OUTCOMES.map((outcome) => (
                        <option key={outcome} value={outcome}>
                          {requestOutcomeLabels[outcome]}
                        </option>
                      ))}
                      <option value={EXTENSION_CHOICE}>Acknowledged, claimed an extension</option>
                    </select>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label htmlFor={`req-profile-${instance.id}`}>Regime</label>
          <select
            id={`req-profile-${instance.id}`}
            value={profileId}
            onChange={(event) => selectProfile(event.target.value)}
          >
            {COMPLIANCE_PROFILES.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={`req-basis-${instance.id}`}>Legal basis</label>
          <select id={`req-basis-${instance.id}`} value={basisId} onChange={(event) => setBasisId(event.target.value)}>
            {(profile?.bases ?? []).map((basis) => (
              <option key={basis.id} value={basis.id}>
                {basis.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={`req-channel-${instance.id}`}>Sent via</label>
          <select
            id={`req-channel-${instance.id}`}
            value={channel}
            onChange={(event) => setChannel(event.target.value as RequestChannel)}
          >
            {CHANNELS.map((option) => (
              <option key={option} value={option}>
                {requestChannelLabels[option]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={`req-sent-${instance.id}`}>Date sent</label>
          <input
            id={`req-sent-${instance.id}`}
            type="date"
            value={sentAt}
            max={today()}
            onChange={(event) => setSentAt(event.target.value)}
          />
        </div>

        <div>
          <label htmlFor={`req-recipient-${instance.id}`}>Sent to (optional)</label>
          <input
            id={`req-recipient-${instance.id}`}
            type="text"
            value={recipient}
            placeholder="privacy@example.com"
            onChange={(event) => setRecipient(event.target.value)}
          />
        </div>

        <button
          type="button"
          onClick={() => {
            void onRecordRequest(instance.id, {
              profileId,
              basisId,
              channel,
              // Midday UTC, so the recorded day survives a timezone shift.
              sentAt: `${sentAt}T12:00:00.000Z`,
              recipient: recipient.trim() || undefined
            }).then((ok) => {
              if (ok) {
                setRecipient('');
              }
            });
          }}
        >
          Record request
        </button>
      </div>
    </section>
  );
}
