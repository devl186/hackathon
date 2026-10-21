import type { DashboardSummary, ScanRow } from '../lib/findings/data';
import { formatScanDate } from '../lib/findings/presentation';
import { RISK_LEVELS } from '../lib/scanner/types';
import { EmptyState, NodeCell, RiskBadge, TableHeader, TextCell } from './lp';

function Kpi({ title, value, hint }: { title: string; value: number; hint: string }) {
  return (
    <div className="lp-card">
      <div className="lp-card__header">
        <div className="lp-card__title">{title}</div>
      </div>
      <div className="lp-card__body">
        <p className="kpi-value">{value.toLocaleString('en-GB')}</p>
        <p className="kpi-hint">{hint}</p>
      </div>
    </div>
  );
}

export function SummaryCards({ summary }: { summary: DashboardSummary }) {
  return (
    <section className="kpi-grid" aria-label="Scan totals">
      <Kpi title="Files scanned" value={summary.filesScanned} hint="All scans you have saved" />
      <Kpi title="Findings" value={summary.totalFindings} hint="Masked matches across all files" />
      <Kpi title="High-risk files" value={summary.highRiskFiles} hint="Highest finding: UK NINO" />
      <Kpi title="Critical-risk files" value={summary.criticalRiskFiles} hint="Highest finding: payment card" />
    </section>
  );
}

export function RiskDistribution({ summary }: { summary: DashboardSummary }) {
  return (
    <div className="lp-card">
      <div className="lp-card__header">
        <div className="lp-card__title">Risk distribution</div>
      </div>
      <div className="lp-card__body">
        <div className="table-scroll">
          <div className="lp-table">
            <table className="lp-table__table">
              <caption className="visually-hidden">Number of scanned files by highest risk</caption>
              <TableHeader labels={['Risk', 'Files']} />
              <tbody>
                {[...RISK_LEVELS].reverse().map((risk) => (
                  <tr key={risk}>
                    <NodeCell>
                      <RiskBadge risk={risk} />
                    </NodeCell>
                    <TextCell>{summary.distribution[risk]}</TextCell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export function RecentScans({ scans }: { scans: ScanRow[] }) {
  return (
    <div className="lp-card">
      <div className="lp-card__header">
        <div className="lp-card__title">Recent scans</div>
        <div className="lp-card__actions">
          <a className="lp-link lp-link--standalone" href="/findings">
            View all findings
          </a>
        </div>
      </div>
      <div className="lp-card__body">
        {scans.length === 0 ? (
          <EmptyState message="No files scanned yet. Upload a CSV or TXT file above to see its risk here." />
        ) : (
          <div className="table-scroll">
            <div className="lp-table">
              <table className="lp-table__table">
                <caption className="visually-hidden">Your five most recent scans</caption>
                <TableHeader labels={['File', 'Scanned', 'Risk', 'Findings']} />
                <tbody>
                  {scans.map((scan) => (
                    <tr key={scan.id}>
                      <TextCell>{scan.file_name}</TextCell>
                      <TextCell>{formatScanDate(scan.created_at)}</TextCell>
                      <NodeCell>
                        <RiskBadge risk={scan.risk} />
                      </NodeCell>
                      <TextCell>{scan.total_findings}</TextCell>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
