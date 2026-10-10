create table if not exists public.subscriptions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  plan text not null default 'none' check (plan in ('none','trial','starter','investor','pro')),
  billing_interval text check (billing_interval in ('month','year')),
  status text not null default 'none',
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  topup_credits integer not null default 0 check (topup_credits >= 0),
  comp boolean not null default false,
  source text not null default 'stripe',
  branding jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create table if not exists public.subscription_members (
  owner_user_id uuid not null references public.subscriptions(user_id) on delete cascade,
  member_user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  primary key (owner_user_id, member_user_id),
  unique (member_user_id)
);
create table if not exists public.usage_periods (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.subscriptions(user_id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  ai_used integer not null default 0,
  unique (owner_user_id, period_start)
);
create table if not exists public.stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);

grant select on public.subscriptions, public.subscription_members, public.usage_periods to authenticated;
grant all on public.subscriptions, public.subscription_members, public.usage_periods, public.stripe_events to service_role;

alter table public.subscriptions enable row level security;
alter table public.subscription_members enable row level security;
alter table public.usage_periods enable row level security;
alter table public.stripe_events enable row level security;

create policy "subs_select_own" on public.subscriptions for select to authenticated
  using (user_id = auth.uid() or public.is_admin()
    or user_id in (select owner_user_id from public.subscription_members where member_user_id = auth.uid()));
create policy "subs_admin_all" on public.subscriptions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "members_select" on public.subscription_members for select to authenticated
  using (owner_user_id = auth.uid() or member_user_id = auth.uid() or public.is_admin());
create policy "usage_select" on public.usage_periods for select to authenticated
  using (owner_user_id = auth.uid() or public.is_admin()
    or owner_user_id in (select owner_user_id from public.subscription_members where member_user_id = auth.uid()));

create trigger subscriptions_touch before update on public.subscriptions
  for each row execute function public.touch_updated_at();

alter table public.personas add column if not exists is_preset boolean not null default false;

create or replace function public.billing_owner(_uid uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce((select owner_user_id from public.subscription_members where member_user_id = _uid), _uid);
$$;

create or replace function public.effective_plan(_uid uuid default auth.uid())
returns text language plpgsql stable security definer set search_path = public as $$
declare s public.subscriptions%rowtype; o uuid;
begin
  o := public.billing_owner(_uid);
  select * into s from public.subscriptions where user_id = o;
  if not found then return 'none'; end if;
  if s.comp then return 'pro'; end if;
  if s.status = 'trialing' and (s.trial_ends_at is null or s.trial_ends_at > now()) then return 'trial'; end if;
  if s.status = 'active' then return s.plan; end if;
  if s.status = 'past_due' and s.current_period_end is not null and s.current_period_end + interval '7 days' > now() then return s.plan; end if;
  return 'none';
end $$;

create or replace function public.plan_limits(_plan text)
returns table(max_properties int, ai_per_period int, max_personas int)
language sql immutable as $$
  select
    case _plan when 'trial' then 10 when 'starter' then 25 when 'investor' then 150 when 'pro' then 750 else 0 end,
    case _plan when 'trial' then 10 when 'starter' then 25 when 'investor' then 150 when 'pro' then 750 else 0 end,
    case _plan when 'trial' then 5 when 'starter' then 1 when 'investor' then 5 when 'pro' then 50 else 0 end;
$$;

create or replace function public.current_usage_window(_owner uuid)
returns table(period_start timestamptz, period_end timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare anchor timestamptz; n int;
begin
  select coalesce(s.current_period_start, s.created_at) into anchor from public.subscriptions s where s.user_id = _owner;
  if anchor is null then anchor := date_trunc('month', now()); end if;
  n := greatest(0, (extract(year from age(now(), anchor))*12 + extract(month from age(now(), anchor)))::int);
  period_start := anchor + make_interval(months => n);
  period_end := anchor + make_interval(months => n + 1);
  return next;
end $$;

create or replace function public.billing_enforced()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (value)::text = 'true' from public.app_settings where key = 'billing_enforced'), false);
$$;

create or replace function public.consume_ai_credits(n int default 1)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); o uuid; p text; lim int; ps timestamptz; pe timestamptz; used int; topup int; from_topup int := 0;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if public.is_admin() then return jsonb_build_object('ok', true, 'bypass', true); end if;
  o := public.billing_owner(uid);
  if not exists (select 1 from public.subscriptions where user_id = o) then
    if not public.billing_enforced() then return jsonb_build_object('ok', true, 'unmetered', true); end if;
    raise exception 'AI_LIMIT_REACHED:0';
  end if;
  p := public.effective_plan(uid);
  select ai_per_period into lim from public.plan_limits(p);
  select w.period_start, w.period_end into ps, pe from public.current_usage_window(o) w;
  insert into public.usage_periods(owner_user_id, period_start, period_end)
    values (o, ps, pe) on conflict (owner_user_id, period_start) do nothing;
  select ai_used into used from public.usage_periods where owner_user_id = o and period_start = ps for update;
  select topup_credits into topup from public.subscriptions where user_id = o for update;
  if used + n > lim then
    from_topup := least(n, used + n - lim);
    if p in ('none','trial') or topup < from_topup then
      if public.billing_enforced() then raise exception 'AI_LIMIT_REACHED:%', lim; end if;
      from_topup := 0;
    end if;
  end if;
  update public.usage_periods set ai_used = ai_used + (n - from_topup) where owner_user_id = o and period_start = ps;
  if from_topup > 0 then update public.subscriptions set topup_credits = topup_credits - from_topup where user_id = o; end if;
  return jsonb_build_object('ok', true, 'from_topup', from_topup, 'period_start', ps);
end $$;

create or replace function public.refund_ai_credits(n int, from_topup int, _period_start timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare o uuid;
begin
  if auth.uid() is null then return; end if;
  o := public.billing_owner(auth.uid());
  update public.usage_periods set ai_used = greatest(0, ai_used - (n - from_topup)) where owner_user_id = o and period_start = _period_start;
  if from_topup > 0 then update public.subscriptions set topup_credits = topup_credits + from_topup where user_id = o; end if;
end $$;

create or replace function public.enforce_property_cap()
returns trigger language plpgsql security definer set search_path = public as $$
declare o uuid; p text; lim int; cur int;
begin
  if not public.billing_enforced() then return new; end if;
  if exists (select 1 from public.profiles where id = new.user_id and role in ('admin','super_admin')) then return new; end if;
  o := public.billing_owner(new.user_id);
  p := public.effective_plan(new.user_id);
  select max_properties into lim from public.plan_limits(p);
  select count(*) into cur from public.properties pr
    where pr.hidden = false and (pr.user_id = o or pr.user_id in (select member_user_id from public.subscription_members where owner_user_id = o));
  if cur >= lim then raise exception 'PROPERTY_LIMIT_REACHED:%', lim; end if;
  return new;
end $$;
drop trigger if exists trg_property_cap on public.properties;
create trigger trg_property_cap before insert on public.properties
  for each row execute function public.enforce_property_cap();

revoke execute on function public.consume_ai_credits(int) from anon, public;
revoke execute on function public.refund_ai_credits(int,int,timestamptz) from anon, public;
grant execute on function public.consume_ai_credits(int), public.refund_ai_credits(int,int,timestamptz), public.effective_plan(uuid), public.billing_owner(uuid) to authenticated;

insert into public.subscriptions(user_id, plan, status, trial_ends_at, current_period_start, source)
select id, 'trial', 'trialing', now() + interval '14 days', now(), 'grandfather' from public.profiles
on conflict (user_id) do nothing;