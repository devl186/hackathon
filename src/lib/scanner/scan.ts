import { DETECTORS } from './detectors';
import type { DetectorType, FindingAggregate, ScanResult } from './types';

export type { DetectorType, FindingAggregate, RiskLevel, ScanResult } from './types';

/**
 * Scans decoded text and returns sanitized aggregates only.
 * Raw matched values never leave this function.
 */
export function scanText(text: string): ScanResult {
  const claimed = new Uint8Array(text.length);
  const byType = new Map<DetectorType, FindingAggregate>();

  for (const detector of DETECTORS) {
    for (const match of text.matchAll(detector.pattern)) {
      const candidate = match[0];
      const start = match.index;
      const end = start + candidate.length;
      if (claimed.subarray(start, end).includes(1)) continue;
      if (!detector.validate(candidate)) continue;
      claimed.fill(1, start, end);

      const existing = byType.get(detector.type);
      if (existing) {
        existing.count++;
      } else {
        byType.set(detector.type, {
          type: detector.type,
          risk: detector.risk,
          count: 1,
          maskedExample: detector.mask(candidate),
        });
      }
    }
  }

  const findings = [...byType.values()];
  return {
    risk: findings[0]?.risk ?? 'None',
    totalFindings: findings.reduce((sum, f) => sum + f.count, 0),
    findings,
  };
}
