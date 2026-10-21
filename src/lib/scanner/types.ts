export const RISK_LEVELS = ['None', 'Low', 'Medium', 'High', 'Critical'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export type DetectorType = 'card' | 'nino' | 'phone' | 'email';

/** Sanitized per-type aggregate: never contains a raw matched value. */
export interface FindingAggregate {
  type: DetectorType;
  risk: Exclude<RiskLevel, 'None'>;
  count: number;
  maskedExample: string;
}

export interface ScanResult {
  risk: RiskLevel;
  totalFindings: number;
  findings: FindingAggregate[];
}
