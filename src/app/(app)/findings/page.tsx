import { ExportForm, FindingFilters, FindingsTable } from '../../../components/findings';
import { Message } from '../../../components/lp';
import { listFindings } from '../../../lib/findings/data';
import { parseFindingFilters } from '../../../lib/findings/presentation';
import { requireUser } from '../../../lib/supabase/server-component';

export const metadata = { title: 'Findings — MiniDSP' };
export const dynamic = 'force-dynamic';

export default async function FindingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { client } = await requireUser();
  const filters = parseFindingFilters(await searchParams);
  let data: Awaited<ReturnType<typeof listFindings>> | null = null;
  try {
    data = await listFindings(client, filters);
  } catch {
    data = null;
  }

  return (
    <main className="page-body">
      <h1 className="page-title">Findings</h1>
      <p className="body-copy">Masked, aggregated findings from your scans. Raw values are never stored.</p>
      <FindingFilters filters={filters} />
      <ExportForm filters={filters} />
      {data ? (
        <FindingsTable rows={data.rows} filters={filters} truncated={data.truncated} />
      ) : (
        <Message variant="error" title="Findings could not be loaded">
          Refresh the page. If the problem continues, sign out and sign in again.
        </Message>
      )}
    </main>
  );
}
