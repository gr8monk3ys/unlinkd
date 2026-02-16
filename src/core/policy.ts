import type { Identifier, IdentifierType } from './types';

export function hasDuplicateIdentifier(
  identifiers: Identifier[],
  candidateType: IdentifierType,
  candidateValue: string
): boolean {
  return identifiers.some((item) => item.type === candidateType && item.value === candidateValue);
}

export function findCrossPersonaDuplicate(
  identifiers: Identifier[],
  personaId: string,
  candidateType: IdentifierType,
  candidateValue: string
): Identifier | null {
  return (
    identifiers.find(
      (item) =>
        item.type === candidateType && item.value === candidateValue && (item.personaId ?? personaId) !== personaId
    ) ?? null
  );
}

export function canAddIdentifier(identifiers: Identifier[], maxIdentifiers: number): boolean {
  return identifiers.length < maxIdentifiers;
}
