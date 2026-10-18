create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 1. PROFILES TABLE
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'user' check (role in ('user', 'admin', 'reseller')),
  is_super_user boolean not null default false,
  is_suspended boolean not null default false,
  full_name text,
  email text,
  phone text,
  marketing_opt_in boolean not null default false,
  account_type text check (account_type is null or account_type in ('personal_freelancer', 'business_enterprise')),
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists role text not null default 'user';
alter table public.profiles add column if not exists is_super_user boolean not null default false;
alter table public.profiles add column if not exists is_suspended boolean not null default false;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists marketing_opt_in boolean not null default false;
alter table public.profiles add column if not exists account_type text;
alter table public.profiles add column if not exists onboarding_completed boolean not null default false;
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_role_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_role_check check (role in ('user', 'admin', 'reseller'));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_account_type_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_account_type_check
      check (account_type is null or account_type in ('personal_freelancer', 'business_enterprise'));
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. CONSENT RECORDS TABLE
-- -----------------------------------------------------------------------------
create table if not exists public.consent_records (
  user_id uuid primary key references auth.users(id) on delete cascade,
  terms_accepted_at timestamptz not null,
  kvkk_consent_at timestamptz not null,
  age_confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.consent_records add column if not exists age_confirmed_at timestamptz;

-- -----------------------------------------------------------------------------
-- 3. NFC CARDS TABLE
-- -----------------------------------------------------------------------------
create table if not exists public.nfc_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid() references auth.users(id) on delete cascade,
  type card_type not null default 'digital_card'::card_type,
  access_mode text not null check (access_mode in ('public', 'private')),
  slug text,
  access_token text,
  title text not null check (length(trim(title)) between 1 and 120),
  google_review_url text,
  whatsapp text,
  sms text,
  instagram_url text,
  email text,
  iban text,
  bank_name text,
  extra_links jsonb not null default '[]'::jsonb check (jsonb_typeof(extra_links) = 'array' and jsonb_array_length(extra_links) <= 3),
  nfc_active boolean not null default false,
  client_notes text,
  is_active boolean not null default true,
  status text not null default 'active' check (status in ('draft', 'active', 'pending_approval', 'rejected', 'suspended', 'deleted')),
  blocks jsonb not null default '[]'::jsonb check (jsonb_typeof(blocks) = 'array'),
  rejection_reason text,
  managed_by_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nfc_cards_access_identifier check (
    (access_mode = 'public' and slug is not null and access_token is null)
    or (access_mode = 'private' and slug is null and access_token is not null)
  )
);

-- Safely ensure all columns exist before modifying defaults/constraints
alter table public.nfc_cards add column if not exists type card_type default 'digital_card'::card_type;
alter table public.nfc_cards add column if not exists access_mode text default 'public';
alter table public.nfc_cards add column if not exists slug text;
alter table public.nfc_cards add column if not exists access_token text;
alter table public.nfc_cards add column if not exists title text default 'Kart';
alter table public.nfc_cards add column if not exists google_review_url text;
alter table public.nfc_cards add column if not exists whatsapp text;
alter table public.nfc_cards add column if not exists sms text;
alter table public.nfc_cards add column if not exists instagram_url text;
alter table public.nfc_cards add column if not exists email text;
alter table public.nfc_cards add column if not exists iban text;
alter table public.nfc_cards add column if not exists bank_name text;
alter table public.nfc_cards add column if not exists extra_links jsonb not null default '[]'::jsonb;
alter table public.nfc_cards add column if not exists nfc_active boolean not null default false;
alter table public.nfc_cards add column if not exists client_notes text;
alter table public.nfc_cards add column if not exists is_active boolean not null default true;
alter table public.nfc_cards add column if not exists status text not null default 'active';
alter table public.nfc_cards add column if not exists managed_by_admin boolean not null default false;
alter table public.nfc_cards add column if not exists blocks jsonb not null default '[]'::jsonb;
alter table public.nfc_cards add column if not exists rejection_reason text;
alter table public.nfc_cards add column if not exists palette_id uuid;

-- -----------------------------------------------------------------------------
-- 4. PALETTE TABLES
-- -----------------------------------------------------------------------------
-- Palette tokens are deliberately limited to colors consumed by the card
-- renderer. Keeping them as JSONB allows the frontend to add presentation
-- tokens without a schema migration, while the check prevents arbitrary data.
create table if not exists public.palette_definitions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  description text,
  kind text not null default 'custom' check (kind in ('system', 'custom')),
  tokens jsonb not null check (
    jsonb_typeof(tokens) = 'object'
    and tokens ?& array['background', 'surface', 'text', 'primary', 'accent', 'muted', 'button_text']
    and (tokens - 'background' - 'surface' - 'text' - 'primary' - 'accent' - 'muted' - 'button_text') = '{}'::jsonb
    and (tokens ->> 'background') ~ '^#[0-9A-Fa-f]{6}$'
    and (tokens ->> 'surface') ~ '^#[0-9A-Fa-f]{6}$'
    and (tokens ->> 'text') ~ '^#[0-9A-Fa-f]{6}$'
    and (tokens ->> 'primary') ~ '^#[0-9A-Fa-f]{6}$'
    and (tokens ->> 'accent') ~ '^#[0-9A-Fa-f]{6}$'
    and (tokens ->> 'muted') ~ '^#[0-9A-Fa-f]{6}$'
    and (tokens ->> 'button_text') ~ '^#[0-9A-Fa-f]{6}$'
  ),
  is_default boolean not null default false,
  is_active boolean not null default true,
  moderation_status text not null default 'approved'
    check (moderation_status in ('pending', 'approved', 'rejected')),
  moderation_note text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint palette_system_owner_check check (
    (kind = 'system' and owner_user_id is null and is_default = true)
    or (kind = 'custom' and owner_user_id is not null and is_default = false)
  )
);

alter table public.palette_definitions add column if not exists owner_user_id uuid;
alter table public.palette_definitions add column if not exists name text;
alter table public.palette_definitions add column if not exists description text;
alter table public.palette_definitions add column if not exists kind text not null default 'custom';
alter table public.palette_definitions add column if not exists tokens jsonb;
alter table public.palette_definitions add column if not exists is_default boolean not null default false;
alter table public.palette_definitions add column if not exists is_active boolean not null default true;
alter table public.palette_definitions add column if not exists moderation_status text not null default 'approved';
alter table public.palette_definitions add column if not exists moderation_note text;
alter table public.palette_definitions add column if not exists created_by uuid;
alter table public.palette_definitions add column if not exists updated_by uuid;
alter table public.palette_definitions add column if not exists created_at timestamptz not null default now();
alter table public.palette_definitions add column if not exists updated_at timestamptz not null default now();

alter table public.nfc_cards drop constraint if exists nfc_cards_palette_id_fkey;
alter table public.nfc_cards
  add constraint nfc_cards_palette_id_fkey
  foreign key (palette_id) references public.palette_definitions(id) on delete set null;

-- Alter column defaults safely
alter table public.nfc_cards alter column type set default 'digital_card'::card_type;
alter table public.nfc_cards alter column nfc_active set default false;
alter table public.nfc_cards alter column user_id drop not null;

-- Update constraints
alter table public.nfc_cards drop constraint if exists nfc_cards_type_check;
alter table public.nfc_cards drop constraint if exists nfc_cards_status_check;
alter table public.nfc_cards
  add constraint nfc_cards_status_check
  check (status in ('active', 'pending_approval', 'rejected', 'suspended', 'deleted'));

alter table public.nfc_cards drop constraint if exists nfc_cards_blocks_array_check;
alter table public.nfc_cards
  add constraint nfc_cards_blocks_array_check
  check (jsonb_typeof(blocks) = 'array');

alter table public.nfc_cards drop constraint if exists nfc_cards_user_id_fkey;
alter table public.nfc_cards
  add constraint nfc_cards_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

-- -----------------------------------------------------------------------------
-- 5. DEPENDENT TABLES
-- -----------------------------------------------------------------------------
create table if not exists public.nfc_tags (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.nfc_cards(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  label text not null default 'NFC etiketi',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.nfc_tags
  add column if not exists card_id uuid references public.nfc_cards(id) on delete cascade;

create table if not exists public.card_feedbacks (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.nfc_cards(id) on delete cascade,
  rating smallint not null check (rating between 1 and 3),
  customer_message text not null check (length(trim(customer_message)) between 1 and 2000),
  customer_contact text check (customer_contact is null or length(customer_contact) <= 254),
  user_id uuid references auth.users(id) on delete set null,
  name text,
  email text,
  is_name_hidden boolean not null default false,
  is_email_hidden boolean not null default false,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.card_feedbacks
  add column if not exists card_id uuid references public.nfc_cards(id) on delete cascade;
alter table public.card_feedbacks
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists name text,
  add column if not exists email text,
  add column if not exists is_name_hidden boolean not null default false,
  add column if not exists is_email_hidden boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.abuse_reports (
  id uuid primary key default gen_random_uuid(),
  reported_url text not null check (reported_url ~* '^https://[^[:space:]]+$'),
  reporter_email text not null check (reporter_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  reason_category text not null check (reason_category in ('phishing', 'malware', 'defamation', 'copyright', 'other')),
  details text not null check (length(trim(details)) between 10 and 5000),
  status text not null default 'pending' check (status in ('pending', 'investigating', 'resolved', 'dismissed')),
  created_at timestamptz not null default now()
);

create table if not exists public.url_scan_allowlist (
  domain text primary key
    check (
      domain = lower(btrim(domain))
      and length(domain) between 3 and 253
      and domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
    ),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

do $$
begin
  alter table public.abuse_reports
    add column if not exists card_id uuid references public.nfc_cards(id) on delete set null;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'abuse_reports'
      and indexname = 'abuse_reports_card_id_idx'
  ) then
    execute 'create index abuse_reports_card_id_idx on public.abuse_reports (card_id)';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. INDEXES
-- -----------------------------------------------------------------------------
create unique index if not exists nfc_cards_public_slug_unique
  on public.nfc_cards (slug) where access_mode = 'public';

create unique index if not exists nfc_cards_private_token_unique
  on public.nfc_cards (access_token) where access_mode = 'private';

create index if not exists nfc_cards_user_id_idx on public.nfc_cards (user_id);
create index if not exists nfc_cards_status_created_at_idx on public.nfc_cards (status, created_at desc);
create index if not exists nfc_cards_blocks_gin_idx on public.nfc_cards using gin (blocks jsonb_path_ops);
create index if not exists nfc_cards_owner_status_idx on public.nfc_cards (user_id, status);
create index if not exists nfc_tags_card_id_idx on public.nfc_tags (card_id);
create index if not exists nfc_tags_user_id_idx on public.nfc_tags (user_id);
create index if not exists card_feedbacks_card_id_idx on public.card_feedbacks (card_id);
create index if not exists card_feedbacks_user_id_idx on public.card_feedbacks (user_id);
create index if not exists palette_definitions_owner_idx
  on public.palette_definitions (owner_user_id, updated_at desc);
create index if not exists palette_definitions_status_idx
  on public.palette_definitions (kind, moderation_status, is_active);
create unique index if not exists palette_definitions_one_default_idx
  on public.palette_definitions (is_default) where is_default;

-- -----------------------------------------------------------------------------
-- 6. FUNCTIONS & TRIGGERS
-- -----------------------------------------------------------------------------
create or replace function public.is_admin_or_reseller()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and not is_suspended
      and (role in ('admin', 'reseller') or is_super_user)
  );
$$;

revoke all on function public.is_admin_or_reseller() from public;
grant execute on function public.is_admin_or_reseller() to authenticated;

create or replace function public.is_account_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and not is_suspended
  );
$$;
revoke all on function public.is_account_active() from public, anon;
grant execute on function public.is_account_active() to authenticated;

create or replace function public.is_admin_or_super_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and not is_suspended
      and (role = 'admin' or is_super_user)
  );
$$;

revoke all on function public.is_admin_or_super_user() from public, anon;
grant execute on function public.is_admin_or_super_user() to authenticated;

create or replace function public.enforce_nfc_active_privilege()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.nfc_active and not public.is_admin_or_super_user() then
      new.nfc_active := false;
    end if;
  elsif new.nfc_active is distinct from old.nfc_active
    and not public.is_admin_or_super_user() then
    raise exception 'Only administrators may change NFC activation';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_nfc_active_privilege() from public;
drop trigger if exists enforce_nfc_active_privilege on public.nfc_cards;
create trigger enforce_nfc_active_privilege
  before insert or update on public.nfc_cards
  for each row execute function public.enforce_nfc_active_privilege();

create or replace function public.enforce_card_approval_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_is_privileged boolean;
begin
  select coalesce(role = 'admin' or is_super_user, false)
  into actor_is_privileged
  from public.profiles
  where id = (select auth.uid());

  if coalesce(actor_is_privileged, false) then
    if tg_op = 'INSERT' then
      new.status := 'active';
    elsif old.status = 'pending_approval' and new.status = old.status then
      new.status := 'active';
    end if;
  else
    new.status := 'pending_approval';
    new.rejection_reason := null;
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_card_approval_status() from public;
drop trigger if exists enforce_card_approval_status on public.nfc_cards;
create trigger enforce_card_approval_status
  before insert or update on public.nfc_cards
  for each row execute function public.enforce_card_approval_status();

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  changed_fields text[] not null default '{}',
  old_status text,
  new_status text,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_log_entity_created_idx
  on public.admin_audit_log (entity_type, entity_id, created_at desc);
alter table public.admin_audit_log enable row level security;
drop policy if exists "Admins can read audit log" on public.admin_audit_log;
create policy "Admins can read audit log"
  on public.admin_audit_log for select to authenticated
  using (public.is_admin_or_super_user());
grant select on public.admin_audit_log to authenticated;
revoke insert, update, delete on public.admin_audit_log from anon, authenticated;

create or replace function public.audit_card_admin_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed text[] := '{}';
begin
  if tg_op = 'INSERT' then
    if public.is_admin_or_super_user() then
      insert into public.admin_audit_log (actor_user_id, action, entity_type, entity_id, changed_fields, new_status)
      values (auth.uid(), 'card.create', 'nfc_card', new.id, array['status'], new.status);
    end if;
    return new;
  end if;
  if new.status is distinct from old.status then changed := array_append(changed, 'status'); end if;
  if new.user_id is distinct from old.user_id then changed := array_append(changed, 'user_id'); end if;
  if new.is_active is distinct from old.is_active then changed := array_append(changed, 'is_active'); end if;
  if public.is_admin_or_super_user() and cardinality(changed) > 0 then
    insert into public.admin_audit_log (
      actor_user_id, action, entity_type, entity_id, changed_fields, old_status, new_status
    ) values (
      auth.uid(), 'card.update', 'nfc_card', new.id, changed, old.status, new.status
    );
  end if;
  return new;
end;
$$;
revoke all on function public.audit_card_admin_change() from public;
drop trigger if exists audit_card_admin_change on public.nfc_cards;
create trigger audit_card_admin_change
  after insert or update on public.nfc_cards
  for each row execute function public.audit_card_admin_change();

drop function if exists public.get_card_feedback(uuid);
create function public.get_card_feedback(p_card_id uuid default null)
returns table (
  id uuid,
  card_id uuid,
  rating smallint,
  message text,
  display_name text,
  display_email text,
  is_name_hidden boolean,
  is_email_hidden boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null or not public.is_account_active() then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if public.is_admin_or_super_user() then
    raise exception 'Use the administrator feedback function' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.nfc_cards c
    where c.user_id = caller and (p_card_id is null or c.id = p_card_id)
  ) then
    raise exception 'Not authorized to view these feedback records' using errcode = '42501';
  end if;
  return query
  select f.id, f.card_id, f.rating, f.customer_message,
    case
      when f.is_name_hidden then 'Anonim Kullanıcı'::text
      else coalesce(nullif(f.name, ''), 'Anonim Kullanıcı')::text
    end,
    case
      when coalesce(f.email, f.customer_contact) is null then null::text
      when f.is_email_hidden then
        left(split_part(coalesce(f.email, f.customer_contact), '@', 1), 1)
        || '***@' || split_part(coalesce(f.email, f.customer_contact), '@', 2)
      else coalesce(f.email, f.customer_contact)::text
    end,
    f.is_name_hidden, f.is_email_hidden, f.created_at
  from public.card_feedbacks f
  join public.nfc_cards c on c.id = f.card_id
  where (p_card_id is null or f.card_id = p_card_id)
    and c.user_id = caller
  order by f.created_at desc;
end;
$$;
revoke all on function public.get_card_feedback(uuid) from public, anon;
grant execute on function public.get_card_feedback(uuid) to authenticated;

drop function if exists public.get_admin_card_feedback(uuid);
create function public.get_admin_card_feedback(p_card_id uuid default null)
returns table (
  id uuid,
  card_id uuid,
  rating smallint,
  message text,
  display_name text,
  display_email text,
  is_name_hidden boolean,
  is_email_hidden boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_account_active() or not public.is_admin_or_super_user() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  return query
  select
    f.id,
    f.card_id,
    f.rating::smallint,
    f.customer_message::text,
    coalesce(nullif(f.name, ''), 'Anonymous user')::text,
    coalesce(f.email, f.customer_contact)::text,
    f.is_name_hidden,
    f.is_email_hidden,
    f.created_at::timestamptz
  from public.card_feedbacks f
  where p_card_id is null or f.card_id = p_card_id
  order by f.created_at desc;
end;
$$;
revoke all on function public.get_admin_card_feedback(uuid) from public, anon;
grant execute on function public.get_admin_card_feedback(uuid) to authenticated;

create or replace function public.sync_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    id, full_name, email, phone, marketing_opt_in, account_type, onboarding_completed
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.email,
    new.phone,
    coalesce(new.raw_user_meta_data ->> 'marketing_opt_in' = 'true', false),
    case when new.raw_user_meta_data ->> 'account_type' in ('personal_freelancer', 'business_enterprise')
      then new.raw_user_meta_data ->> 'account_type' else null end,
    coalesce(new.raw_user_meta_data ->> 'onboarding_completed' = 'true', false)
  )
  on conflict (id) do update set
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    email = excluded.email,
    phone = excluded.phone,
    marketing_opt_in = case
      when new.raw_user_meta_data ? 'marketing_opt_in' then excluded.marketing_opt_in
      else public.profiles.marketing_opt_in
    end,
    account_type = coalesce(excluded.account_type, public.profiles.account_type),
    onboarding_completed = public.profiles.onboarding_completed or excluded.onboarding_completed,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists sync_auth_user_profile on auth.users;
create trigger sync_auth_user_profile
  after insert or update of email, phone, raw_user_meta_data on auth.users
  for each row execute function public.sync_auth_user_profile();

insert into public.profiles (id, full_name, email, phone)
select id, coalesce(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name'), email, phone
from auth.users
on conflict (id) do nothing;

create or replace function public.record_required_signup_consents()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  if metadata ->> 'signup_channel' = 'email' then
    if metadata ->> 'terms_accepted' is distinct from 'true'
       or metadata ->> 'kvkk_consent' is distinct from 'true'
       or metadata ->> 'age_confirmed' is distinct from 'true' then
      raise exception 'Terms, privacy, and minimum-age confirmation are required for email registration';
    end if;

    insert into public.consent_records (user_id, terms_accepted_at, kvkk_consent_at, age_confirmed_at)
    values (new.id, now(), now(), now());
  end if;
  return new;
end;
$$;

drop trigger if exists record_required_signup_consents on auth.users;
create trigger record_required_signup_consents
  after insert on auth.users
  for each row execute function public.record_required_signup_consents();

insert into public.palette_definitions (
  name, description, kind, tokens, is_default, is_active, moderation_status
)
select
  'Bilgi Default',
  'Default palette for new cards',
  'system',
  '{"background":"#0F172A","surface":"#1E293B","text":"#F8FAFC","primary":"#38BDF8","accent":"#22C55E","muted":"#94A3B8","button_text":"#0F172A"}'::jsonb,
  true,
  true,
  'approved'
where not exists (
  select 1 from public.palette_definitions where is_default = true
);

create or replace function public.enforce_palette_privileges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_admin_or_super_user() then
    new.updated_by := auth.uid();
    if new.kind = 'system' then
      new.owner_user_id := null;
      new.is_default := true;
      new.moderation_status := 'approved';
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.owner_user_id := auth.uid();
    new.kind := 'custom';
    new.is_default := false;
    new.created_by := auth.uid();
    new.updated_by := auth.uid();
    new.moderation_status := 'pending';
  elsif old.owner_user_id is distinct from auth.uid()
    or old.kind <> 'custom'
    or new.owner_user_id is distinct from old.owner_user_id
    or new.kind is distinct from old.kind
    or new.is_default is distinct from old.is_default
    or new.moderation_status is distinct from old.moderation_status then
    raise exception 'Only the palette owner may edit this custom palette';
  else
    new.moderation_status := 'pending';
    new.moderation_note := null;
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_palette_privileges() from public;
drop trigger if exists enforce_palette_privileges on public.palette_definitions;
create trigger enforce_palette_privileges
  before insert or update on public.palette_definitions
  for each row execute function public.enforce_palette_privileges();

create or replace function public.get_effective_card_palette(p_card_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select p.tokens
      from public.nfc_cards c
      join public.palette_definitions p on p.id = c.palette_id
      where c.id = p_card_id
        and c.status = 'active'
        and c.is_active
        and p.is_active
        and p.moderation_status = 'approved'
    ),
    (
      select p.tokens
      from public.palette_definitions p
      where p.is_default
        and p.is_active
        and p.moderation_status = 'approved'
      order by p.updated_at desc
      limit 1
    )
  );
$$;

revoke all on function public.get_effective_card_palette(uuid) from public;
grant execute on function public.get_effective_card_palette(uuid) to anon, authenticated;

create or replace function public.enforce_card_palette_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.palette_id is not null
    and not public.is_admin_or_super_user()
    and not exists (
      select 1
      from public.palette_definitions p
      where p.id = new.palette_id
        and (
          (p.kind = 'system' and p.is_active and p.moderation_status = 'approved')
          or (p.kind = 'custom' and p.owner_user_id = auth.uid())
        )
    ) then
    raise exception 'You may only apply your own custom palette or an active system palette';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_card_palette_access() from public;
drop trigger if exists enforce_card_palette_access on public.nfc_cards;
create trigger enforce_card_palette_access
  before insert or update of palette_id on public.nfc_cards
  for each row execute function public.enforce_card_palette_access();

-- -----------------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY (RLS) & POLICIES
-- -----------------------------------------------------------------------------
alter table public.consent_records enable row level security;
alter table public.profiles enable row level security;
alter table public.nfc_cards enable row level security;
alter table public.nfc_tags enable row level security;
alter table public.card_feedbacks enable row level security;
alter table public.abuse_reports enable row level security;
alter table public.url_scan_allowlist enable row level security;
alter table public.palette_definitions enable row level security;

drop policy if exists "Users can view their own profile" on public.profiles;
create policy "Users can view their own profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) and public.is_account_active());

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()) and public.is_account_active())
  with check (id = (select auth.uid()) and public.is_account_active());

drop policy if exists "Admins can view all profiles" on public.profiles;
create policy "Admins can view all profiles"
  on public.profiles for select to authenticated
  using (public.is_admin_or_reseller());

grant select on public.profiles to authenticated;
revoke update on public.profiles from authenticated;
grant update (
  full_name,
  phone,
  marketing_opt_in,
  account_type,
  onboarding_completed,
  updated_at
) on public.profiles to authenticated;

drop policy if exists "Users can view their own consent record" on public.consent_records;
create policy "Users can view their own consent record"
  on public.consent_records for select to authenticated
  using (user_id = (select auth.uid()) and public.is_account_active());

drop policy if exists "Users can record their own consents" on public.consent_records;
create policy "Users can record their own consents"
  on public.consent_records for all to authenticated
  using (user_id = (select auth.uid()) and public.is_account_active())
  with check (user_id = (select auth.uid()) and public.is_account_active());

grant select, insert, update on public.consent_records to authenticated;

drop policy if exists "Users can manage their own cards" on public.nfc_cards;
create policy "Users can manage their own cards"
  on public.nfc_cards for all to authenticated
  using (user_id = (select auth.uid()) and not managed_by_admin and public.is_account_active())
  with check (user_id = (select auth.uid()) and not managed_by_admin and public.is_account_active());

drop policy if exists "Admins have full control over all cards" on public.nfc_cards;
create policy "Admins have full control over all cards"
  on public.nfc_cards for all to authenticated
  using (public.is_admin_or_reseller())
  with check (public.is_admin_or_reseller());

grant select, insert, update, delete on public.nfc_cards to authenticated;

drop policy if exists "Anyone can view active palettes" on public.palette_definitions;
create policy "Anyone can view active palettes"
  on public.palette_definitions for select to anon, authenticated
  using (
    is_active
    and moderation_status = 'approved'
    and (kind = 'system' or owner_user_id = (select auth.uid()))
  );

drop policy if exists "Users can manage their custom palettes" on public.palette_definitions;
create policy "Users can manage their custom palettes"
  on public.palette_definitions for all to authenticated
  using (owner_user_id = (select auth.uid()) and kind = 'custom' and public.is_account_active())
  with check (owner_user_id = (select auth.uid()) and kind = 'custom' and public.is_account_active());

drop policy if exists "Admins have full control over palettes" on public.palette_definitions;
create policy "Admins have full control over palettes"
  on public.palette_definitions for all to authenticated
  using (public.is_admin_or_super_user())
  with check (public.is_admin_or_super_user());

grant select on public.palette_definitions to anon;
grant select, insert, update, delete on public.palette_definitions to authenticated;

drop policy if exists "Users can manage their own NFC tags" on public.nfc_tags;
create policy "Users can manage their own NFC tags"
  on public.nfc_tags for all to authenticated
  using (user_id = (select auth.uid()) and public.is_account_active())
  with check (
    user_id = (select auth.uid())
    and public.is_account_active()
    and exists (
      select 1 from public.nfc_cards
      where nfc_cards.id = nfc_tags.card_id and nfc_cards.user_id = (select auth.uid())
    )
  );

grant select, insert, update, delete on public.nfc_tags to authenticated;

drop policy if exists "Card owners can read their feedback" on public.card_feedbacks;
drop policy if exists "Admins can view all feedback" on public.card_feedbacks;
revoke select on public.card_feedbacks from anon, authenticated;

drop policy if exists "Anyone can insert abuse report" on public.abuse_reports;
create policy "Anyone can insert abuse report"
  on public.abuse_reports for insert to anon, authenticated
  with check (status = 'pending');

drop policy if exists "Admins can view abuse reports" on public.abuse_reports;
create policy "Admins can view abuse reports"
  on public.abuse_reports for select to authenticated
  using (public.is_admin_or_reseller());

drop policy if exists "Admins can update abuse reports" on public.abuse_reports;
create policy "Admins can update abuse reports"
  on public.abuse_reports for update to authenticated
  using (public.is_admin_or_reseller())
  with check (public.is_admin_or_reseller());

grant insert on public.abuse_reports to anon, authenticated;
grant select, update on public.abuse_reports to authenticated;

drop policy if exists "Admins can view URL scan allowlist" on public.url_scan_allowlist;
create policy "Admins can view URL scan allowlist"
  on public.url_scan_allowlist for select to authenticated
  using (public.is_admin_or_super_user());
drop policy if exists "Admins can add URL scan allowlist domains" on public.url_scan_allowlist;
create policy "Admins can add URL scan allowlist domains"
  on public.url_scan_allowlist for insert to authenticated
  with check (public.is_admin_or_super_user() and created_by = (select auth.uid()));
drop policy if exists "Admins can remove URL scan allowlist domains" on public.url_scan_allowlist;
create policy "Admins can remove URL scan allowlist domains"
  on public.url_scan_allowlist for delete to authenticated
  using (public.is_admin_or_super_user());
grant select, insert, delete on public.url_scan_allowlist to authenticated;