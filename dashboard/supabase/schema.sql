create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'user' check (role in ('user', 'admin', 'reseller')),
  full_name text,
  email text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists role text not null default 'user';
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists phone text;
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
      and role in ('admin', 'reseller')
  );
$$;

revoke all on function public.is_admin_or_reseller() from public;
grant execute on function public.is_admin_or_reseller() to authenticated;

create or replace function public.sync_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email, phone)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.email,
    new.phone
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    email = excluded.email,
    phone = excluded.phone,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists sync_auth_user_profile on auth.users;
create trigger sync_auth_user_profile
  after insert or update of email, phone, raw_user_meta_data on auth.users
  for each row execute function public.sync_auth_user_profile();

insert into public.profiles (id, full_name, email, phone)
select id, raw_user_meta_data ->> 'full_name', email, phone
from auth.users
on conflict (id) do nothing;

create table if not exists public.consent_records (
  user_id uuid primary key references auth.users(id) on delete cascade,
  terms_accepted_at timestamptz not null,
  kvkk_consent_at timestamptz not null,
  created_at timestamptz not null default now()
);

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
       or metadata ->> 'kvkk_consent' is distinct from 'true' then
      raise exception 'Terms and KVKK consent are required for email registration';
    end if;

    insert into public.consent_records (user_id, terms_accepted_at, kvkk_consent_at)
    values (new.id, now(), now());
  end if;
  return new;
end;
$$;

drop trigger if exists record_required_signup_consents on auth.users;
create trigger record_required_signup_consents
  after insert on auth.users
  for each row execute function public.record_required_signup_consents();

create table if not exists public.nfc_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type text not null check (type in ('google_review', 'iban_card')),
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
  nfc_active boolean not null default true,
  client_notes text,
  is_active boolean not null default true,
  managed_by_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nfc_cards_access_identifier check (
    (access_mode = 'public' and slug is not null and access_token is null)
    or (access_mode = 'private' and slug is null and access_token is not null)
  )
);

alter table public.nfc_cards add column if not exists client_notes text;
alter table public.nfc_cards add column if not exists is_active boolean not null default true;
alter table public.nfc_cards add column if not exists managed_by_admin boolean not null default false;

create unique index if not exists nfc_cards_public_slug_unique
  on public.nfc_cards (slug) where access_mode = 'public';
create unique index if not exists nfc_cards_private_token_unique
  on public.nfc_cards (access_token) where access_mode = 'private';
create index if not exists nfc_cards_user_id_idx on public.nfc_cards (user_id);

create table if not exists public.nfc_tags (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.nfc_cards(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  label text not null default 'NFC etiketi',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.card_feedbacks (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.nfc_cards(id) on delete cascade,
  rating smallint not null check (rating between 1 and 3),
  customer_message text not null check (length(trim(customer_message)) between 1 and 2000),
  customer_contact text check (customer_contact is null or length(customer_contact) <= 254),
  created_at timestamptz not null default now()
);

create table if not exists public.abuse_reports (
  id uuid primary key default gen_random_uuid(),
  card_id uuid references public.nfc_cards(id) on delete set null,
  reported_url text not null check (reported_url ~* '^https://[^[:space:]]+$'),
  reporter_email text not null check (reporter_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  reason_category text not null check (reason_category in ('phishing', 'malware', 'defamation', 'copyright', 'other')),
  details text not null check (length(trim(details)) between 10 and 5000),
  status text not null default 'pending' check (status in ('pending', 'investigating', 'resolved', 'dismissed')),
  created_at timestamptz not null default now()
);

alter table public.consent_records enable row level security;
alter table public.profiles enable row level security;
alter table public.nfc_cards enable row level security;
alter table public.nfc_tags enable row level security;
alter table public.card_feedbacks enable row level security;
alter table public.abuse_reports enable row level security;

drop policy if exists "Users can view their own profile" on public.profiles;
create policy "Users can view their own profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists "Admins can view all profiles" on public.profiles;
create policy "Admins can view all profiles"
  on public.profiles for select to authenticated
  using (public.is_admin_or_reseller());

grant select on public.profiles to authenticated;

drop policy if exists "Users can view their own consent record" on public.consent_records;
create policy "Users can view their own consent record"
  on public.consent_records for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can record their own consents" on public.consent_records;
create policy "Users can record their own consents"
  on public.consent_records for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can manage their own cards" on public.nfc_cards;
create policy "Users can manage their own cards"
  on public.nfc_cards for all to authenticated
  using (user_id = (select auth.uid()) and not managed_by_admin)
  with check (user_id = (select auth.uid()) and not managed_by_admin);

drop policy if exists "Admins have full control over all cards" on public.nfc_cards;
create policy "Admins have full control over all cards"
  on public.nfc_cards for all to authenticated
  using (public.is_admin_or_reseller())
  with check (public.is_admin_or_reseller());

drop policy if exists "Users can manage their own NFC tags" on public.nfc_tags;
create policy "Users can manage their own NFC tags"
  on public.nfc_tags for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.nfc_cards
      where nfc_cards.id = nfc_tags.card_id and nfc_cards.user_id = (select auth.uid())
    )
  );

drop policy if exists "Card owners can read their feedback" on public.card_feedbacks;
create policy "Card owners can read their feedback"
  on public.card_feedbacks for select to authenticated
  using (
    exists (
      select 1 from public.nfc_cards
      where nfc_cards.id = card_feedbacks.card_id and nfc_cards.user_id = (select auth.uid())
    )
  );

drop policy if exists "Admins can view all feedback" on public.card_feedbacks;
create policy "Admins can view all feedback"
  on public.card_feedbacks for select to authenticated
  using (public.is_admin_or_reseller());

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
