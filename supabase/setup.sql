create table if not exists public.leads (
  id text primary key,
  created_at timestamptz not null,
  idempotency_hash text not null unique,
  encrypted jsonb not null
);

create index if not exists leads_created_at_desc_idx on public.leads (created_at desc);

alter table public.leads enable row level security;
revoke all on public.leads from anon, authenticated;
grant all on public.leads to service_role;

create table if not exists public.request_limits (
  key_hash text primary key,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 0)
);

alter table public.request_limits enable row level security;
revoke all on public.request_limits from anon, authenticated;
grant all on public.request_limits to service_role;

create or replace function public.consume_request_limit(
  p_key text,
  p_window_seconds integer default 60,
  p_max_requests integer default 30
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_row public.request_limits%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  insert into public.request_limits as existing(key_hash, window_started_at, request_count)
  values (p_key, v_now, 1)
  on conflict (key_hash) do update
    set window_started_at = case
          when existing.window_started_at <= v_now - make_interval(secs => p_window_seconds)
            then v_now
          else existing.window_started_at
        end,
        request_count = case
          when existing.window_started_at <= v_now - make_interval(secs => p_window_seconds)
            then 1
          else existing.request_count + 1
        end
  returning * into current_row;

  return current_row.request_count <= p_max_requests;
end;
$$;

revoke all on function public.consume_request_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_request_limit(text, integer, integer) to service_role;
