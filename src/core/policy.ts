import type { Identifier, IdentifierType } from './types';

export function hasDuplicateIdentifier(
  identifiers: Identifier[],
  candidateType: IdentifierType,
  candidateValue: string
): boolean {
  return identifiers.some((item) => item.type === candidateType && item.value === candidateValue);
}

export function canAddIdentifier(identifiers: Identifier[], maxIdentifiers: number): boolean {
  return identifiers.length < maxIdentifiers;
}
