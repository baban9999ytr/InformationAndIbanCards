alter table public.profiles
  add column if not exists marketing_opt_in boolean not null default false,
  add column if not exists account_type text,
  add column if not exists onboarding_completed boolean not null default false;

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

alter table public.consent_records
  add column if not exists age_confirmed_at timestamptz;

alter table public.nfc_tags
  add column if not exists card_id uuid references public.nfc_cards(id) on delete cascade;

alter table public.card_feedbacks
  add column if not exists card_id uuid references public.nfc_cards(id) on delete cascade;

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

    insert into public.consent_records (
      user_id, terms_accepted_at, kvkk_consent_at, age_confirmed_at
    )
    values (new.id, now(), now(), now());
  end if;
  return new;
end;
$$;

insert into public.profiles (
  id, full_name, email, phone, marketing_opt_in, account_type, onboarding_completed
)
select
  id,
  coalesce(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name'),
  email,
  phone,
  coalesce(raw_user_meta_data ->> 'marketing_opt_in' = 'true', false),
  case when raw_user_meta_data ->> 'account_type' in ('personal_freelancer', 'business_enterprise')
    then raw_user_meta_data ->> 'account_type' else null end,
  coalesce(raw_user_meta_data ->> 'onboarding_completed' = 'true', false)
from auth.users
on conflict (id) do update set
  full_name = coalesce(excluded.full_name, public.profiles.full_name),
  email = excluded.email,
  phone = excluded.phone,
  marketing_opt_in = case
    when (select raw_user_meta_data from auth.users where id = excluded.id) ? 'marketing_opt_in'
      then excluded.marketing_opt_in
    else public.profiles.marketing_opt_in
  end,
  account_type = coalesce(excluded.account_type, public.profiles.account_type),
  onboarding_completed = public.profiles.onboarding_completed or excluded.onboarding_completed,
  updated_at = now();
