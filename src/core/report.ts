import type { ConnectorDefinition, ConnectorInstance, Persona } from './types';
import type { VaultStateV1 } from './vault';
import { connectorName, dueConnectorInstances } from './connectors';
import { computeDeadline } from './compliance/deadlines';
import { instanceRequests, requestOutcomeLabels } from './compliance/requests';
import { scoreFinding, sortFindingsByPriority } from './scoring';

export interface ReportOptions {
  redacted: boolean;
  connectorCatalog: ConnectorDefinition[];
}

function fmtDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : value;
}

function byState(instances: ConnectorInstance[]): Record<string, number> {
  return instances.reduce<Record<string, number>>((acc, instance) => {
    acc[instance.state] = (acc[instance.state] ?? 0) + 1;
    return acc;
  }, {});
}

function personaName(personaId: string, personas: Persona[]): string {
  return personas.find((persona) => persona.id === personaId)?.name ?? personaId;
}

export function buildMarkdownReport(vault: VaultStateV1, options: ReportOptions): string {
  const now = new Date().toISOString();
  const instancesByState = byState(vault.connectorInstances);
  const due = dueConnectorInstances(vault.connectorInstances);
  const findings = sortFindingsByPriority(vault.findings);

  const lines: string[] = [];
  lines.push(`# unlinkd Report`);
  lines.push('');
  lines.push(`Generated: ${now}`);
  lines.push('');

  lines.push('## Summary');
  lines.push(`- Personas: ${vault.personas.length}`);
  lines.push(`- Identifiers: ${vault.identifiers.length}`);
  lines.push(`- Accounts: ${vault.accounts.length}`);
  lines.push(`- Connector instances: ${vault.connectorInstances.length}`);
  lines.push(`- Findings: ${vault.findings.length}`);
  lines.push(`- Due rechecks: ${due.length}`);
  lines.push('');

  lines.push('## Connector Progress');
  Object.entries(instancesByState)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([state, count]) => {
      lines.push(`- ${state}: ${count}`);
    });
  if (vault.connectorInstances.length === 0) {
    lines.push('- (none)');
  }
  lines.push('');

  lines.push('## Due Rechecks');
  if (due.length === 0) {
    lines.push('- (none)');
  } else {
    due
      .sort((a, b) => (a.nextCheckAt ?? '').localeCompare(b.nextCheckAt ?? ''))
      .forEach((instance) => {
        // Persona names are user-chosen and can be identifying — omit them in
        // redacted mode.
        const persona = options.redacted ? '' : ` (${personaName(instance.personaId, vault.personas)})`;
        lines.push(
          `- ${connectorName(instance.connectorId, options.connectorCatalog)}${persona}: next check ${fmtDate(
            instance.nextCheckAt ?? 'unknown'
          )}`
        );
      });
  }
  lines.push('');

  // The request log is the part of this report an escalation actually rests on:
  // what was asked, when, under which right, and what came back.
  lines.push('## Removal Requests');
  const withRequests = vault.connectorInstances.filter((instance) => instanceRequests(instance).length > 0);
  if (withRequests.length === 0) {
    lines.push('- (none recorded)');
  } else {
    withRequests.forEach((instance) => {
      const persona = options.redacted ? '' : ` (${personaName(instance.personaId, vault.personas)})`;
      lines.push(`### ${connectorName(instance.connectorId, options.connectorCatalog)}${persona}`);
      instanceRequests(instance).forEach((request) => {
        const computation = computeDeadline(request);
        const cite = computation.basis?.citation ?? `${request.profileId}/${request.basisId}`;
        lines.push(`- Sent ${fmtDate(request.sentAt)} under ${cite} via ${request.channel}`);
        // A recipient can be an identifying address, so it follows the same
        // redaction rule as persona names.
        if (request.recipient && !options.redacted) {
          lines.push(`  - To: ${request.recipient}`);
        }
        lines.push(
          computation.dueAt
            ? `  - Deadline: ${computation.dueAt} (${computation.status}${computation.stale ? ', profile unverified' : ''})`
            : `  - Deadline: not computable (${computation.explanation})`
        );
        if (request.responses.length === 0) {
          lines.push('  - No response recorded');
        } else {
          request.responses.forEach((response) => {
            lines.push(
              `  - ${fmtDate(response.receivedAt)}: ${requestOutcomeLabels[response.outcome]}${
                response.extensionClaimed ? ' (extension claimed)' : ''
              }`
            );
          });
        }
      });
      lines.push('');
    });
  }
  lines.push('');

  lines.push('## Top Findings');
  const top = findings.slice(0, 10);
  if (top.length === 0) {
    lines.push('- (none)');
  } else {
    top.forEach((finding) => {
      // Finding titles embed masked emails (with domains), service names, and
      // breach names — all identifying. A redacted report keeps only tier and
      // score so posture can be shared without exposing whose posture it is.
      if (options.redacted) {
        lines.push(`- [${finding.tier}] score=${scoreFinding(finding)} title=[redacted — see full report]`);
      } else {
        const persona = finding.personaId ? personaName(finding.personaId, vault.personas) : 'All';
        lines.push(`- [${finding.tier}] score=${scoreFinding(finding)} persona=${persona} title=${finding.title}`);
      }
    });
  }
  lines.push('');

  if (!options.redacted) {
    lines.push('## Identifiers (Sensitive)');
    vault.identifiers.forEach((identifier) => {
      const persona = personaName(identifier.personaId ?? vault.activePersonaId, vault.personas);
      lines.push(`- ${persona}: ${identifier.type}: ${identifier.value}`);
    });
    if (vault.identifiers.length === 0) {
      lines.push('- (none)');
    }
    lines.push('');
  }

  return lines.join('\n');
}
