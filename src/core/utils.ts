export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function fromBase64(value: string): Uint8Array {
  const binary = atob(value.trim());
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/**
 * The local calendar date as YYYY-MM-DD, for date inputs.
 *
 * Deliberately not `toISOString().slice(0, 10)`: that is the UTC date, which
 * for anyone west of UTC is already tomorrow from the late afternoon (about
 * 17:00 in California). A date input defaulting to "tomorrow" is then rejected
 * as a request sent in the future.
 */
export function localIsoDate(now: Date = new Date()): string {
  const y = String(now.getFullYear()).padStart(4, '0');
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
