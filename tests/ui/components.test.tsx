import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RecentScans, RiskDistribution, SummaryCards } from '../../src/components/dashboard';
import { FindingFilters, FindingsTable } from '../../src/components/findings';
import { RiskBadge } from '../../src/components/lp';
import { UploadStatus } from '../../src/components/upload-status';
import type { FindingRow } from '../../src/lib/findings/data';
import { summarizeScans } from '../../src/lib/findings/data';

const rows: FindingRow[] = [
  {
    id: 'f1',
    scanId: 's1',
    fileName: '22_all_four.csv',
    scannedAt: '2026-10-21T07:05:00Z',
    type: 'card',
    risk: 'Critical',
    count: 2,
    maskedExample: '**** **** **** 1111',
  },
  {
    id: 'f2',
    scanId: 's1',
    fileName: '22_all_four.csv',
    scannedAt: '2026-10-21T07:05:00Z',
    type: 'email',
    risk: 'Low',
    count: 1,
    maskedExample: 'a***@e***.test',
  },
];

describe('RiskBadge', () => {
  it('states the risk in text (not colour alone) with a Lepidus variant', () => {
    expect(renderToStaticMarkup(<RiskBadge risk="Critical" />)).toBe(
      '<span class="lp-badge lp-badge--error"><span class="lp-badge__dot"></span>Critical</span>',
    );
    expect(renderToStaticMarkup(<RiskBadge risk="None" />)).toContain('lp-badge--neutral');
  });
});

describe('FindingsTable', () => {
  it('shows filename, UTC date, type, risk, count and masked example', () => {
    const html = renderToStaticMarkup(<FindingsTable rows={rows} filters={{ type: 'all', risk: 'all' }} truncated={false} />);
    for (const text of ['22_all_four.csv', '21 Oct 2026, 07:05 UTC', 'Payment card', 'Critical', '**** **** **** 1111', 'a***@e***.test', 'Email']) {
      expect(html).toContain(text);
    }
    expect(html).toContain('2 finding groups · 3 occurrences');
    expect(html).toContain('<table class="lp-table__table">');
    expect(html).toContain('scope="col"');
  });

  it('escapes untrusted file names', () => {
    const html = renderToStaticMarkup(
      <FindingsTable rows={[{ ...rows[0]!, fileName: '<img src=x onerror=alert(1)>.csv' }]} filters={{ type: 'all', risk: 'all' }} truncated={false} />,
    );
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;.csv');
  });

  it('first-run empty state differs from filtered-to-nothing', () => {
    const none = renderToStaticMarkup(<FindingsTable rows={[]} filters={{ type: 'all', risk: 'all' }} truncated={false} />);
    const filtered = renderToStaticMarkup(<FindingsTable rows={[]} filters={{ type: 'nino', risk: 'all' }} truncated={false} />);
    expect(none).toContain('lp-empty-state');
    expect(none).toContain('No findings yet.');
    expect(filtered).toContain('No findings match these filters.');
    expect(filtered).not.toContain('<table');
  });

  it('flags truncation', () => {
    const html = renderToStaticMarkup(<FindingsTable rows={rows} filters={{ type: 'all', risk: 'all' }} truncated />);
    expect(html).toContain('showing the most recent 500 groups');
  });
});

describe('FindingFilters', () => {
  it('is a GET form of radio groups reflecting the active filters; no native select', () => {
    const html = renderToStaticMarkup(<FindingFilters filters={{ type: 'phone', risk: 'High' }} />);
    expect(html).toContain('method="get"');
    expect(html).toContain('action="/findings"');
    expect(html).toMatch(/name="type" checked="" value="phone"/);
    expect(html).toMatch(/name="risk" checked="" value="High"/);
    expect(html.match(/checked=""/g)).toHaveLength(2);
    expect(html.match(/role="radiogroup"/g)).toHaveLength(2);
    expect(html).not.toContain('<select');
  });
});

describe('Dashboard components', () => {
  const summary = summarizeScans([
    { risk: 'Critical', total_findings: 4 },
    { risk: 'High', total_findings: 2 },
    { risk: 'None', total_findings: 0 },
  ]);

  it('renders the totals and the risk distribution', () => {
    const cards = renderToStaticMarkup(<SummaryCards summary={summary} />);
    expect(cards).toMatch(/Files scanned<\/div>.*?<p class="kpi-value">3<\/p>/s);
    expect(cards).toMatch(/Findings<\/div>.*?<p class="kpi-value">6<\/p>/s);
    expect(cards).toMatch(/High-risk files<\/div>.*?<p class="kpi-value">1<\/p>/s);
    expect(cards).toMatch(/Critical-risk files<\/div>.*?<p class="kpi-value">1<\/p>/s);
    const dist = renderToStaticMarkup(<RiskDistribution summary={summary} />);
    expect(dist.indexOf('Critical')).toBeLessThan(dist.indexOf('None'));
  });

  it('recent scans: table when present, empty state when none', () => {
    const html = renderToStaticMarkup(
      <RecentScans
        scans={[{ id: 's1', file_name: 'a.csv', file_size_bytes: 10, risk: 'High', total_findings: 1, created_at: '2026-10-21T07:05:00Z' }]}
      />,
    );
    expect(html).toContain('a.csv');
    expect(html).toContain('lp-badge--error');
    expect(renderToStaticMarkup(<RecentScans scans={[]} />)).toContain('No files scanned yet.');
  });
});

describe('UploadStatus states', () => {
  it('idle renders nothing', () => {
    expect(renderToStaticMarkup(<UploadStatus state={{ status: 'idle' }} />)).toBe('');
  });

  it('uploading shows an announced spinner', () => {
    const html = renderToStaticMarkup(<UploadStatus state={{ status: 'uploading', fileName: 'a.csv' }} />);
    expect(html).toContain('class="lp-spinner lp-spinner--sm" role="status"');
    expect(html).toContain('Scanning a.csv');
  });

  it('client-side invalid shows a warning message', () => {
    const html = renderToStaticMarkup(<UploadStatus state={{ status: 'invalid', message: 'Only .csv and .txt files can be scanned.' }} />);
    expect(html).toContain('lp-message--warning');
    expect(html).toContain('role="alert"');
  });

  it('error shows an alert and a sign-in link when the session ended', () => {
    const html = renderToStaticMarkup(<UploadStatus state={{ status: 'error', message: 'Your session has ended.', signInAgain: true }} />);
    expect(html).toContain('lp-message--error');
    expect(html).toContain('href="/login"');
  });

  it('success summarises masked results only', () => {
    const html = renderToStaticMarkup(
      <UploadStatus
        state={{
          status: 'success',
          fileName: '22_all_four.csv',
          result: {
            scanId: 'id',
            risk: 'Critical',
            totalFindings: 4,
            findings: [
              { type: 'card', risk: 'Critical', count: 1, maskedExample: '**** **** **** 1111' },
              { type: 'email', risk: 'Low', count: 3, maskedExample: 'a***@e***.test' },
            ],
          },
        }}
      />,
    );
    expect(html).toContain('lp-message--success');
    expect(html).toContain('role="status"');
    expect(html).toContain('risk Critical, 4 findings');
    expect(html).toContain('Payment card: 1 · Email: 3');
    expect(html).toContain('href="/findings"');
  });
});
