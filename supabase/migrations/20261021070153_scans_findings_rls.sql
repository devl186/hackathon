-- MiniDSP: scan metadata + masked finding aggregates with owner-scoped RLS.
-- Stores no uploaded content and no raw detected values.

create table public.scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  file_name text not null check (char_length(file_name) between 1 and 255 and file_name !~ '[[:cntrl:]]'),
  file_size_bytes integer not null check (file_size_bytes between 1 and 1048576),
  risk text not null check (risk in ('None', 'Low', 'Medium', 'High', 'Critical')),
  total_findings integer not null check (total_findings >= 0),
  created_at timestamptz not null default now(),
  -- Target for the findings composite FK that ties child ownership to the parent's owner.
  unique (id, user_id)
);

create table public.findings (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null,
  user_id uuid not null default auth.uid(),
  type text not null,
  risk text not null,
  count integer not null check (count > 0),
  masked_example text not null,
  created_at timestamptz not null default now(),
  unique (scan_id, type),
  foreign key (scan_id, user_id) references public.scans (id, user_id) on delete cascade,
  constraint findings_type_risk check (
    (type, risk) in (('card', 'Critical'), ('nino', 'High'), ('phone', 'Medium'), ('email', 'Low'))
  ),
  -- Defence in depth: reject anything that does not look like the scanner's masked output.
  constraint findings_masked_example_safe check (
    case type
      when 'email' then masked_example ~ '^[A-Za-z0-9]\*\*\*@[A-Za-z0-9]\*\*\*\.[A-Za-z]{2,63}$'
      when 'nino' then masked_example ~ '^[A-Z]{2} \*\* \*\* \*\*( \*)?$'
      when 'phone' then masked_example ~ '^[*0-9 +-]+$'
        and char_length(regexp_replace(masked_example, '[^0-9]', '', 'g')) <= 2
      when 'card' then masked_example ~ '^[*0-9 -]+$'
        and char_length(regexp_replace(masked_example, '[^0-9]', '', 'g')) <= 4
      else false
    end
  )
);

create index scans_user_created_idx on public.scans (user_id, created_at desc);
create index findings_user_idx on public.findings (user_id);

alter table public.scans enable row level security;
alter table public.findings enable row level security;

revoke all on public.scans, public.findings from anon, authenticated;
grant select, insert, delete on public.scans to authenticated;
grant select, insert on public.findings to authenticated;

create policy scans_select_own on public.scans
  for select to authenticated using (user_id = (select auth.uid()));
create policy scans_insert_own on public.scans
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy scans_delete_own on public.scans
  for delete to authenticated using (user_id = (select auth.uid()));

create policy findings_select_own on public.findings
  for select to authenticated using (user_id = (select auth.uid()));
create policy findings_insert_own on public.findings
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.scans s where s.id = scan_id and s.user_id = (select auth.uid()))
  );

-- Atomic save: one function call = one transaction; any failed insert rolls back the scan too.
-- SECURITY INVOKER so the caller's RLS policies apply to every insert.
create or replace function public.create_scan_with_findings(
  p_file_name text,
  p_file_size_bytes integer,
  p_risk text,
  p_findings jsonb
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_scan_id uuid;
  v_expected_risk text;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_findings is null or jsonb_typeof(p_findings) <> 'array' then
    raise exception 'findings must be a JSON array' using errcode = '22023';
  end if;

  v_expected_risk := coalesce(
    (select f ->> 'risk'
       from jsonb_array_elements(p_findings) f
      order by array_position(array['Low', 'Medium', 'High', 'Critical'], f ->> 'risk') desc nulls last
      limit 1),
    'None');
  if p_risk is distinct from v_expected_risk then
    raise exception 'scan risk does not match findings' using errcode = '22023';
  end if;

  insert into public.scans (user_id, file_name, file_size_bytes, risk, total_findings)
  values (
    v_user_id, p_file_name, p_file_size_bytes, p_risk,
    coalesce((select sum((f ->> 'count')::integer) from jsonb_array_elements(p_findings) f), 0)
  )
  returning id into v_scan_id;

  insert into public.findings (scan_id, user_id, type, risk, count, masked_example)
  select v_scan_id, v_user_id, f ->> 'type', f ->> 'risk', (f ->> 'count')::integer, f ->> 'maskedExample'
    from jsonb_array_elements(p_findings) f;

  return v_scan_id;
end;
$$;

revoke all on function public.create_scan_with_findings(text, integer, text, jsonb) from public, anon;
grant execute on function public.create_scan_with_findings(text, integer, text, jsonb) to authenticated;
