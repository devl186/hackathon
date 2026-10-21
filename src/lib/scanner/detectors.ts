import type { DetectorType, FindingAggregate } from './types';

export interface Detector {
  type: DetectorType;
  risk: FindingAggregate['risk'];
  pattern: RegExp;
  validate: (candidate: string) => boolean;
  mask: (candidate: string) => string;
}

export function passesLuhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = digits.charCodeAt(digits.length - 1 - i) - 48;
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/** Replaces every digit with `*` except the last `keep` digits; separators are preserved. */
export function maskDigits(value: string, keep: number): string {
  let remaining = value.replace(/\D/g, '').length;
  let out = '';
  for (const ch of value) {
    if (ch >= '0' && ch <= '9') {
      out += remaining > keep ? '*' : ch;
      remaining--;
    } else {
      out += ch;
    }
  }
  return out;
}

export function maskEmail(value: string): string {
  const at = value.lastIndexOf('@');
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const tld = domain.slice(domain.lastIndexOf('.') + 1);
  return `${local[0]}***@${domain[0]}***.${tld}`;
}

export function maskNino(value: string): string {
  const compact = value.replace(/\s/g, '').toUpperCase();
  return `${compact.slice(0, 2)} ** ** **${compact.length === 9 ? ' *' : ''}`;
}

const BANNED_NINO_PREFIXES = new Set(['BG', 'GB', 'KN', 'NK', 'NT', 'TN', 'ZZ']);

// Lookbehind/lookahead reject candidates that are part of a longer digit/letter run (no partial matches).
const CARD_PATTERN = /(?<![\p{L}\p{N}]|\p{N}[ -])\d(?:[ -]?\d){12,18}(?![ -]?\p{N}|\p{L})/gu;
const NINO_PATTERN =
  /(?<![\p{L}\p{N}])[A-CEGHJ-PR-TW-Z][A-CEGHJ-NPR-TW-Z] ?\d{2} ?\d{2} ?\d{2}(?: ?[A-D])?(?![\p{L}\p{N}]| \p{N})/giu;
const PHONE_PATTERN = /(?<![\p{L}\p{N}+]|\p{N}[ -])(?:\+44[ -]?|0)[1-9](?:[ -]?\d){8,9}(?![ -]?\p{N})/gu;
const EMAIL_PATTERN =
  /(?<![\p{L}\p{N}._%+@-])[A-Za-z0-9](?:[A-Za-z0-9._%+-]{0,62}[A-Za-z0-9_%+-])?@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}(?![\p{L}\p{N}_@-]|\.[\p{L}\p{N}])/gu;

/** Ordered highest risk first so higher-risk matches claim overlapping text. */
export const DETECTORS: readonly Detector[] = [
  {
    type: 'card',
    risk: 'Critical',
    pattern: CARD_PATTERN,
    validate: (c) => {
      const digits = c.replace(/\D/g, '');
      return digits.length >= 13 && digits.length <= 19 && !/^(\d)\1+$/.test(digits) && passesLuhn(digits);
    },
    mask: (c) => maskDigits(c, 4),
  },
  {
    type: 'nino',
    risk: 'High',
    pattern: NINO_PATTERN,
    validate: (c) => !BANNED_NINO_PREFIXES.has(c.slice(0, 2).toUpperCase()),
    mask: maskNino,
  },
  {
    type: 'phone',
    risk: 'Medium',
    pattern: PHONE_PATTERN,
    validate: (c) => {
      const digits = c.replace(/\D/g, '');
      const national = c.startsWith('+') ? digits.slice(2) : digits.slice(1);
      // UK mobile (07x, excluding 070 personal numbers) or geographic (01x / 02x).
      return /^(?:7[1-9]\d{8}|2\d{9}|1\d{8,9})$/.test(national);
    },
    mask: (c) => maskDigits(c, 2),
  },
  {
    type: 'email',
    risk: 'Low',
    pattern: EMAIL_PATTERN,
    validate: (c) => c.length <= 254 && !c.slice(0, c.indexOf('@')).includes('..'),
    mask: maskEmail,
  },
];
