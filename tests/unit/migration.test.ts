import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Static guards only. Real RLS behaviour is verified by tests/integration/rls.hosted.test.ts.
const dir = join(import.meta.dirname, '..', '..', 'supabase', 'migrations');
const sql = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(join(dir, f), 'utf8'))
  .join('\n')
  .toLowerCase();

describe('migration static checks', () => {
  it('enables RLS on scans and findings', () => {
    expect(sql).toContain('alter table public.scans enable row level security');
    expect(sql).toContain('alter table public.findings enable row level security');
  });

  it('ties finding ownership to the parent scan owner', () => {
    expect(sql).toMatch(/foreign key \(scan_id, user_id\) references public\.scans \(id, user_id\)/);
  });

  it('grants nothing to anon and uses no security definer / service role', () => {
    expect(sql).not.toMatch(/grant [^;]* to [^;]*\banon\b/);
    expect(sql).not.toContain('security definer');
    expect(sql).not.toContain('service_role');
  });

  it('has no columns for raw content or raw matches', () => {
    expect(sql).not.toMatch(/\b(content|raw_\w*|file_body|matched_value)\b\s+(text|bytea|jsonb)/);
  });
});
