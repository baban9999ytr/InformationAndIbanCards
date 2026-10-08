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
    select 1 from pg_constraint
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
    select 1 from public.profiles
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
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.email, new.phone)
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

alter table public.nfc_cards add column if not exists client_notes text;
alter table public.nfc_cards add column if not exists is_active boolean not null default true;
alter table public.nfc_cards add column if not exists managed_by_admin boolean not null default false;

alter table public.profiles enable row level security;
drop policy if exists "Users can view their own profile" on public.profiles;
create policy "Users can view their own profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));
drop policy if exists "Admins can view all profiles" on public.profiles;
create policy "Admins can view all profiles"
  on public.profiles for select to authenticated
  using (public.is_admin_or_reseller());
grant select on public.profiles to authenticated;

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

drop policy if exists "Admins can view all feedback" on public.card_feedbacks;
create policy "Admins can view all feedback"
  on public.card_feedbacks for select to authenticated
  using (public.is_admin_or_reseller());

drop policy if exists "Admins can view abuse reports" on public.abuse_reports;
create policy "Admins can view abuse reports"
  on public.abuse_reports for select to authenticated
  using (public.is_admin_or_reseller());
drop policy if exists "Admins can update abuse reports" on public.abuse_reports;
create policy "Admins can update abuse reports"
  on public.abuse_reports for update to authenticated
  using (public.is_admin_or_reseller())
  with check (public.is_admin_or_reseller());
grant select, update on public.abuse_reports to authenticated;
