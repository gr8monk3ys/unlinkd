import { z } from 'zod';
import type { Identifier, IdentifierType } from './types';

const identifierTypeSchema = z.enum(['legal_name', 'email', 'phone', 'username', 'address', 'device']);

const emailSchema = z.email();
const phoneSchema = z.string().regex(/^\+?[0-9]{7,20}$/);
const nonEmptySchema = z.string().trim().min(1);

function validateValue(type: IdentifierType, value: string): string | null {
  if (type === 'email') {
    return emailSchema.safeParse(value).success ? null : 'Enter a valid email address.';
  }

  if (type === 'phone') {
    return phoneSchema.safeParse(value).success ? null : 'Enter a valid phone number.';
  }

  return nonEmptySchema.safeParse(value).success ? null : 'Value is required.';
}

export function normalizeIdentifierValue(type: IdentifierType, value: string): string {
  const trimmed = value.trim();
  if (type === 'email' || type === 'username') {
    return trimmed.toLowerCase();
  }

  if (type === 'phone') {
    const hasPlus = trimmed.startsWith('+');
    const digits = trimmed.replace(/\D+/g, '');
    return hasPlus ? `+${digits}` : digits;
  }

  return trimmed;
}

export function validateIdentifierInput(type: string, value: string): {
  ok: boolean;
  error: string | null;
  normalizedType: IdentifierType | null;
  normalizedValue: string;
} {
  const parsedType = identifierTypeSchema.safeParse(type);
  if (!parsedType.success) {
    return {
      ok: false,
      error: 'Identifier type is invalid.',
      normalizedType: null,
      normalizedValue: value
    };
  }

  const normalizedValue = normalizeIdentifierValue(parsedType.data, value);
  const valueError = validateValue(parsedType.data, normalizedValue);
  if (valueError) {
    return {
      ok: false,
      error: valueError,
      normalizedType: parsedType.data,
      normalizedValue
    };
  }

  return {
    ok: true,
    error: null,
    normalizedType: parsedType.data,
    normalizedValue
  };
}

export function isIdentifierArray(value: unknown): value is Identifier[] {
  const schema = z.array(
    z.object({
      id: z.string(),
      type: identifierTypeSchema,
      value: z.string(),
      sensitivity: z.union([z.literal(1), z.literal(2), z.literal(3)]),
      consent: z.boolean()
    })
  );

  return schema.safeParse(value).success;
}
