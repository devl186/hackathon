import { RecentScans, RiskDistribution, SummaryCards } from '../../../components/dashboard';
import { Message } from '../../../components/lp';
import { UploadForm } from '../../../components/upload-form';
import { loadDashboard } from '../../../lib/findings/data';
import { requireUser } from '../../../lib/supabase/server-component';

export const metadata = { title: 'Dashboard — MiniDSP' };
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const { client } = await requireUser();
  let data: Awaited<ReturnType<typeof loadDashboard>> | null = null;
  try {
    data = await loadDashboard(client);
  } catch {
    data = null;
  }

  return (
    <main className="page-body">
      <h1 className="page-title">Dashboard</h1>
      <UploadForm />
      {data ? (
        <>
          <SummaryCards summary={data.summary} />
          {data.truncated ? (
            <Message variant="info" title="Totals are partial">
              Totals cover your most recent 20,000 scans.
            </Message>
          ) : null}
          <div className="two-column">
            <RiskDistribution summary={data.summary} />
            <RecentScans scans={data.recent} />
          </div>
        </>
      ) : (
        <Message variant="error" title="Scan data could not be loaded">
          Refresh the page. If the problem continues, sign out and sign in again.
        </Message>
      )}
    </main>
  );
}
