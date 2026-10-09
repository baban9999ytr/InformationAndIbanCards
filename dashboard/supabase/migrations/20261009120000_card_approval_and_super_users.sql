alter table public.profiles
  add column if not exists is_super_user boolean not null default false;

alter table public.nfc_cards
  add column if not exists status text not null default 'active';

alter table public.nfc_cards
  drop constraint if exists nfc_cards_status_check;

alter table public.nfc_cards
  add constraint nfc_cards_status_check
  check (status in ('active', 'pending_approval', 'rejected'));

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
      and (role in ('admin', 'reseller') or is_super_user)
  );
$$;

revoke all on function public.is_admin_or_reseller() from public;
grant execute on function public.is_admin_or_reseller() to authenticated;

create index if not exists nfc_cards_status_created_at_idx
  on public.nfc_cards (status, created_at desc);

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
    elsif new.status = old.status then
      new.status := 'active';
    end if;
  else
    new.status := 'pending_approval';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_card_approval_status() from public;

drop trigger if exists enforce_card_approval_status on public.nfc_cards;
create trigger enforce_card_approval_status
  before insert or update on public.nfc_cards
  for each row execute function public.enforce_card_approval_status();

revoke update on public.profiles from authenticated;
grant update (
  full_name,
  phone,
  marketing_opt_in,
  account_type,
  onboarding_completed,
  updated_at
) on public.profiles to authenticated;
