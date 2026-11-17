/**
 * Security utilities for data sanitization, validation, prototype-pollution protection,
 * sensitive-field stripping, and cross-system ownership enforcement.
 */

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const SENSITIVE_KEY_PATTERN = /^(password|senha|secret|token|apikey|api_key|service_role|access_token|refresh_token|privatekey|private_key)$/i;

/**
 * Sanitizes a string by removing HTML tags, dangerous URI schemes, event handlers,
 * and non-printable control characters while preserving normal text and newlines.
 */
export const sanitizeString = (str: string): string => {
  if (typeof str !== 'string') return '';
  return str
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>?/gm, '')
    .replace(/\b(javascript|vbscript|data:text\/html)\s*:/gi, '')
    .trim();
};

export const normalizeDocumentNumber = (doc: string): string => {
  if (!doc) return '';
  return String(doc).replace(/\D/g, '');
};

/**
 * Validates a Brazilian CPF with check digits.
 */
export const isValidCPF = (cpf: string): boolean => {
  const cleanCPF = normalizeDocumentNumber(cpf);
  if (cleanCPF.length !== 11 || /^(\d)\1{10}$/.test(cleanCPF)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += Number(cleanCPF.charAt(i)) * (10 - i);
  }
  let remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== Number(cleanCPF.charAt(9))) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += Number(cleanCPF.charAt(i)) * (11 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  return remainder === Number(cleanCPF.charAt(10));
};

/**
 * Validates a Brazilian CNPJ with check digits.
 */
export const isValidCNPJ = (cnpj: string): boolean => {
  const cleanCNPJ = normalizeDocumentNumber(cnpj);
  if (cleanCNPJ.length !== 14 || /^(\d)\1{13}$/.test(cleanCNPJ)) return false;

  const calcDigit = (base: string, weights: number[]) => {
    let sum = 0;
    for (let i = 0; i < weights.length; i++) {
      sum += Number(base.charAt(i)) * weights[i];
    }
    const rem = sum % 11;
    return rem < 2 ? 0 : 11 - rem;
  };

  const d1 = calcDigit(cleanCNPJ.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (d1 !== Number(cleanCNPJ.charAt(12))) return false;

  const d2 = calcDigit(cleanCNPJ.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d2 === Number(cleanCNPJ.charAt(13));
};

export const isValidCpfCnpj = (value: string): boolean => {
  const digits = normalizeDocumentNumber(value);
  if (digits.length === 11) return isValidCPF(digits);
  if (digits.length === 14) return isValidCNPJ(digits);
  return false;
};

export const formatCpfCnpj = (value: string): string => {
  const digits = normalizeDocumentNumber(value);
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  }
  return sanitizeString(value);
};

/**
 * Strips sensitive keys recursively before persisting or logging objects.
 */
export const stripSensitiveFields = <T>(input: T): T => {
  if (Array.isArray(input)) {
    return input.map((item) => stripSensitiveFields(item)) as unknown as T;
  }
  if (input && typeof input === 'object') {
    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.has(key) || SENSITIVE_KEY_PATTERN.test(key)) {
        continue;
      }
      clean[key] = stripSensitiveFields(value);
    }
    return clean as T;
  }
  return input;
};

/**
 * Robust object sanitizer.
 * Recursively sanitizes strings and arrays while guarding against prototype pollution
 * and removing sensitive fields.
 */
export const sanitizeObject = <T>(obj: T): T => {
  if (typeof obj === 'string') {
    return sanitizeString(obj) as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item)) as unknown as T;
  }
  if (obj && typeof obj === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.has(key) || SENSITIVE_KEY_PATTERN.test(key)) {
        continue;
      }
      sanitized[key] = sanitizeObject(value);
    }
    return sanitized as T;
  }
  return obj;
};

/**
 * Safe JSON parser with fallback and prototype-pollution filtering.
 */
export const safeJsonParse = <T>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw, (key, value) => {
      if (FORBIDDEN_KEYS.has(key) || SENSITIVE_KEY_PATTERN.test(key)) {
        return undefined;
      }
      return value;
    });
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
};

export const assertSafeId = (id: string, label = 'ID'): string => {
  const clean = sanitizeString(id);
  if (!clean || clean.length > 128 || /[\\/]/.test(clean) || clean.includes('..')) {
    throw new Error(`${label} inválido.`);
  }
  return clean;
};
