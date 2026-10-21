import type { DetectorType, RiskLevel } from '../scanner/types';

export const DETECTOR_TYPES: readonly DetectorType[] = ['email', 'phone', 'nino', 'card'];
export const FINDING_RISKS = ['Low', 'Medium', 'High', 'Critical'] as const;

export const TYPE_LABELS: Record<DetectorType, string> = {
  email: 'Email',
  phone: 'UK phone',
  nino: 'UK NINO',
  card: 'Payment card',
};

export type BadgeVariant = 'neutral' | 'default' | 'warning' | 'error';

// Badge variant reinforces, never replaces, the risk text.
export const RISK_BADGE: Record<RiskLevel, BadgeVariant> = {
  None: 'neutral',
  Low: 'default',
  Medium: 'warning',
  High: 'error',
  Critical: 'error',
};

export interface FindingFilters {
  type: DetectorType | 'all';
  risk: (typeof FINDING_RISKS)[number] | 'all';
}

type SearchParamValue = string | string[] | undefined;

function single(value: SearchParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Whitelists query-string filters; anything unknown falls back to "all". */
export function parseFindingFilters(params: Record<string, SearchParamValue>): FindingFilters {
  const type = single(params.type);
  const risk = single(params.risk);
  return {
    type: DETECTOR_TYPES.includes(type as DetectorType) ? (type as DetectorType) : 'all',
    risk: (FINDING_RISKS as readonly string[]).includes(risk ?? '') ? (risk as FindingFilters['risk']) : 'all',
  };
}

export function formatScanDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return `${new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(date)} UTC`;
}
