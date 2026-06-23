import type { ConnectorDefinition, ConnectorInstance, Persona } from './types';
import type { VaultStateV1 } from './vault';
import { connectorName, dueConnectorInstances } from './connectors';
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
        lines.push(
          `- ${connectorName(instance.connectorId, options.connectorCatalog)} (${personaName(instance.personaId, vault.personas)}): next check ${fmtDate(
            instance.nextCheckAt ?? 'unknown'
          )}`
        );
      });
  }
  lines.push('');

  lines.push('## Top Findings');
  const top = findings.slice(0, 10);
  if (top.length === 0) {
    lines.push('- (none)');
  } else {
    top.forEach((finding) => {
      const persona = finding.personaId ? personaName(finding.personaId, vault.personas) : 'All';
      lines.push(`- [${finding.tier}] score=${scoreFinding(finding)} persona=${persona} title=${finding.title}`);
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
