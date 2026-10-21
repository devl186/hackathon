import type { FindingRow } from '../lib/findings/data';
import {
  DETECTOR_TYPES,
  FINDING_RISKS,
  TYPE_LABELS,
  formatScanDate,
  type FindingFilters as Filters,
} from '../lib/findings/presentation';
import { EmptyState, NodeCell, RiskBadge, TableHeader, TextCell } from './lp';

function RadioOption({ name, value, label, checked }: { name: string; value: string; label: string; checked: boolean }) {
  return (
    <label className="lp-radio">
      <span className="lp-radio__control">
        <input className="lp-radio__input" type="radio" name={name} value={value} defaultChecked={checked} />
        <span className="lp-radio__circle" aria-hidden="true">
          <span className="lp-radio__dot"></span>
        </span>
      </span>
      <span className="lp-radio__label">{label}</span>
    </label>
  );
}

/** Plain GET form: filters live in the URL and are re-validated server-side. */
export function FindingFilters({ filters }: { filters: Filters }) {
  return (
    <form method="get" action="/findings" aria-label="Filter findings">
      <div className="lp-card">
      <div className="lp-card__header">
        <div className="lp-card__title">Filter findings</div>
      </div>
      <div className="lp-card__body filter-groups">
        <div className="lp-radio-group" role="radiogroup" aria-labelledby="filter-type-label">
          <span className="lp-radio-group__label" id="filter-type-label">
            Type
          </span>
          <div className="lp-radio-group__options lp-radio-group__options--horizontal">
            <RadioOption name="type" value="all" label="All types" checked={filters.type === 'all'} />
            {DETECTOR_TYPES.map((t) => (
              <RadioOption key={t} name="type" value={t} label={TYPE_LABELS[t]} checked={filters.type === t} />
            ))}
          </div>
        </div>
        <div className="lp-radio-group" role="radiogroup" aria-labelledby="filter-risk-label">
          <span className="lp-radio-group__label" id="filter-risk-label">
            Risk
          </span>
          <div className="lp-radio-group__options lp-radio-group__options--horizontal">
            <RadioOption name="risk" value="all" label="All risks" checked={filters.risk === 'all'} />
            {FINDING_RISKS.map((r) => (
              <RadioOption key={r} name="risk" value={r} label={r} checked={filters.risk === r} />
            ))}
          </div>
        </div>
      </div>
      <div className="lp-card__footer footer-actions">
        <a className="lp-link lp-link--standalone" href="/findings">
          Clear filters
        </a>
        <button type="submit" className="lp-button lp-button--primary lp-button--md">
          Apply filters
        </button>
      </div>
      </div>
    </form>
  );
}

export function ExportForm({ filters }: { filters: Filters }) {
  return (
    <form method="get" action="/api/export" className="footer-actions" aria-label="Export findings">
      <input type="hidden" name="type" value={filters.type} />
      <input type="hidden" name="risk" value={filters.risk} />
      <button type="submit" className="lp-button lp-button--secondary lp-button--md">
        Export CSV
      </button>
    </form>
  );
}

export function FindingsTable({
  rows,
  filters,
  truncated,
}: {
  rows: FindingRow[];
  filters: Filters;
  truncated: boolean;
}) {
  const filtered = filters.type !== 'all' || filters.risk !== 'all';
  if (rows.length === 0) {
    return filtered ? (
      <EmptyState message="No findings match these filters. Choose All types or All risks to see more results." />
    ) : (
      <EmptyState
        message="No findings yet. Scan a CSV or TXT file from the dashboard; clean files are saved with risk None and have no findings."
        action={
          <a className="lp-link lp-link--standalone" href="/dashboard">
            Go to dashboard
          </a>
        }
      />
    );
  }

  const occurrences = rows.reduce((sum, r) => sum + r.count, 0);
  return (
    <>
      <p className="table-summary" aria-live="polite">
        {rows.length} finding {rows.length === 1 ? 'group' : 'groups'} · {occurrences} occurrences
        {truncated ? ' · showing the most recent 500 groups' : ''}
      </p>
      <div className="table-scroll">
        <div className="lp-table">
          <table className="lp-table__table">
            <caption className="visually-hidden">Masked findings for your scanned files</caption>
            <TableHeader labels={['File', 'Scanned', 'Type', 'Risk', 'Count', 'Masked example']} />
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <TextCell>{row.fileName}</TextCell>
                  <TextCell>{formatScanDate(row.scannedAt)}</TextCell>
                  <TextCell>{TYPE_LABELS[row.type]}</TextCell>
                  <NodeCell>
                    <RiskBadge risk={row.risk} />
                  </NodeCell>
                  <TextCell>{row.count}</TextCell>
                  <TextCell>
                    <code>{row.maskedExample}</code>
                  </TextCell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
