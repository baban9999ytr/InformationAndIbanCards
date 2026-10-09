begin;

alter table public.nfc_cards
  add column if not exists nfc_active boolean not null default false;

alter table public.nfc_cards
  alter column type set default 'digital_card';

alter table public.nfc_cards
  drop constraint if exists nfc_cards_type_check;

alter table public.nfc_cards
  drop constraint if exists nfc_cards_blocks_array_check;

alter table public.nfc_cards
  add constraint nfc_cards_blocks_array_check
  check (jsonb_typeof(blocks) = 'array');

alter table public.nfc_cards
  drop constraint if exists nfc_cards_status_check;

alter table public.nfc_cards
  add constraint nfc_cards_status_check
  check (status in ('draft', 'active', 'pending_approval', 'rejected', 'suspended', 'deleted'));

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

create index if not exists nfc_cards_visibility_status_created_idx
  on public.nfc_cards (access_mode, status, created_at desc);

create index if not exists card_feedbacks_card_created_idx
  on public.card_feedbacks (card_id, created_at desc);

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
    select 1
    from public.nfc_cards c
    where c.user_id = caller
      and (p_card_id is null or c.id = p_card_id)
  ) then
    raise exception 'Not authorized to view these feedback records' using errcode = '42501';
  end if;

  return query
  select
    f.id,
    f.card_id,
    f.rating::smallint,
    f.customer_message::text,
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
    f.is_name_hidden,
    f.is_email_hidden,
    f.created_at::timestamptz
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

select pg_notify('pgrst', 'reload schema');

commit;
