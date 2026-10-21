import { Spinner } from '../../components/lp';

export default function Loading() {
  return (
    <main className="page-body loading-region">
      <Spinner size="lg" label="Loading your scans" />
    </main>
  );
}
