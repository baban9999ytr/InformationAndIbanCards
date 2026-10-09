alter table public.nfc_cards
  add column if not exists blocks jsonb not null default '[]'::jsonb,
  add column if not exists rejection_reason text;
update public.nfc_cards set blocks = '[]'::jsonb where blocks is null;
alter table public.nfc_cards
  alter column blocks set default '[]'::jsonb,
  alter column blocks set not null;

alter table public.profiles
  add column if not exists is_suspended boolean not null default false;

alter table public.nfc_cards
  alter column user_id drop not null;

alter table public.nfc_cards
  drop constraint if exists nfc_cards_status_check;

alter table public.nfc_cards
  add constraint nfc_cards_status_check
  check (status in ('active', 'pending_approval', 'rejected', 'suspended', 'deleted'));

alter table public.nfc_cards
  drop constraint if exists nfc_cards_blocks_array_check;

alter table public.nfc_cards
  add constraint nfc_cards_blocks_array_check
  check (
    case
      when jsonb_typeof(blocks) = 'array' then jsonb_array_length(blocks) <= 8
      else false
    end
  );

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.nfc_cards'::regclass
      and conname = 'nfc_cards_user_id_fkey'
  ) then
    alter table public.nfc_cards drop constraint nfc_cards_user_id_fkey;
  end if;
  alter table public.nfc_cards
    add constraint nfc_cards_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade;
end;
$$;

update public.nfc_cards as card
set blocks = (
  select coalesce(jsonb_agg(block_value order by block_order), '[]'::jsonb)
  from lateral (
    select jsonb_build_object(
      'id', gen_random_uuid(),
      'type', block_type,
      'order', block_order,
      'visible', true,
      'data', block_data
    ) as block_value,
    block_order
    from (
      select 'profile'::text as block_type, 1 as block_order,
        jsonb_strip_nulls(jsonb_build_object(
          'name', card.title,
          'bank_name', card.bank_name
        )) as block_data
      union all
      select 'google_review', 2,
        jsonb_strip_nulls(jsonb_build_object('url', card.google_review_url))
      where card.google_review_url is not null
      union all
      select 'payment', 3,
        jsonb_strip_nulls(jsonb_build_object('iban', card.iban, 'bank_name', card.bank_name))
      where card.iban is not null
      union all
      select 'contact', 4,
        jsonb_strip_nulls(jsonb_build_object(
          'whatsapp', card.whatsapp,
          'sms', card.sms,
          'email', card.email
        ))
      where card.whatsapp is not null or card.sms is not null or card.email is not null
      union all
      select 'social', 5,
        jsonb_strip_nulls(jsonb_build_object('instagram_url', card.instagram_url))
      where card.instagram_url is not null
      union all
      select 'custom', 6,
        jsonb_build_object('links', card.extra_links)
      where jsonb_array_length(card.extra_links) > 0
    ) legacy_blocks
  ) ordered_blocks
)
where card.blocks = '[]'::jsonb
  and (
    card.title is not null
    or card.google_review_url is not null
    or card.iban is not null
    or card.whatsapp is not null
    or card.sms is not null
    or card.email is not null
    or card.instagram_url is not null
    or jsonb_array_length(card.extra_links) > 0
  );

alter table public.card_feedbacks
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists name text,
  add column if not exists email text,
  add column if not exists is_name_hidden boolean not null default false,
  add column if not exists is_email_hidden boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

update public.card_feedbacks
set email = customer_contact
where email is null and customer_contact is not null;

create index if not exists nfc_cards_blocks_gin_idx
  on public.nfc_cards using gin (blocks jsonb_path_ops);
create index if not exists nfc_cards_owner_status_idx
  on public.nfc_cards (user_id, status);
create index if not exists card_feedbacks_user_id_idx
  on public.card_feedbacks (user_id);

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
      and not is_suspended
      and (role in ('admin', 'reseller') or is_super_user)
  );
$$;
revoke all on function public.is_admin_or_reseller() from public, anon;
grant execute on function public.is_admin_or_reseller() to authenticated;

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
  using (public.is_admin_or_reseller());
grant select on public.admin_audit_log to authenticated;
revoke insert, update, delete on public.admin_audit_log from anon, authenticated;

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

drop policy if exists "Admins can read audit log" on public.admin_audit_log;
create policy "Admins can read audit log"
  on public.admin_audit_log for select to authenticated
  using (public.is_admin_or_super_user());

revoke update on public.profiles from authenticated;
grant update (
  full_name,
  phone,
  marketing_opt_in,
  account_type,
  onboarding_completed,
  updated_at
) on public.profiles to authenticated;

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

create or replace function public.get_card_feedback(p_card_id uuid default null)
returns table (
  id uuid,
  card_id uuid,
  rating smallint,
  customer_message text,
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
  privileged boolean := public.is_admin_or_super_user();
begin
  if caller is null or not public.is_account_active() then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not privileged and not exists (
    select 1 from public.nfc_cards c
    where c.user_id = caller and (p_card_id is null or c.id = p_card_id)
  ) then
    raise exception 'Not authorized to view these feedback records' using errcode = '42501';
  end if;

  return query
  select f.id,
    f.card_id,
    f.rating,
    f.customer_message,
    case
      when privileged then coalesce(f.name, 'Anonymous user')
      when f.is_name_hidden then 'Anonim Kullanıcı'
      else coalesce(f.name, 'Anonim Kullanıcı')
    end,
    case
      when privileged then coalesce(f.email, f.customer_contact)
      when f.is_email_hidden then
        case
          when coalesce(f.email, f.customer_contact) is null then null
          else left(split_part(coalesce(f.email, f.customer_contact), '@', 1), 1)
            || '***@' || split_part(coalesce(f.email, f.customer_contact), '@', 2)
        end
      else coalesce(f.email, f.customer_contact)
    end,
    f.is_name_hidden,
    f.is_email_hidden,
    f.created_at
  from public.card_feedbacks f
  join public.nfc_cards c on c.id = f.card_id
  where (p_card_id is null or f.card_id = p_card_id)
    and (privileged or c.user_id = caller)
  order by f.created_at desc;
end;
$$;

revoke all on function public.get_card_feedback(uuid) from public, anon;
grant execute on function public.get_card_feedback(uuid) to authenticated;

drop policy if exists "Card owners can read their feedback" on public.card_feedbacks;
drop policy if exists "Admins can view all feedback" on public.card_feedbacks;
revoke select on public.card_feedbacks from authenticated, anon;

drop policy if exists "Users can view their own profile" on public.profiles;
create policy "Users can view their own profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) and public.is_account_active());

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()) and public.is_account_active())
  with check (id = (select auth.uid()) and public.is_account_active());

drop policy if exists "Users can view their own consent record" on public.consent_records;
create policy "Users can view their own consent record"
  on public.consent_records for select to authenticated
  using (user_id = (select auth.uid()) and public.is_account_active());

drop policy if exists "Users can record their own consents" on public.consent_records;
create policy "Users can record their own consents"
  on public.consent_records for all to authenticated
  using (user_id = (select auth.uid()) and public.is_account_active())
  with check (user_id = (select auth.uid()) and public.is_account_active());

drop policy if exists "Users can manage their own cards" on public.nfc_cards;
create policy "Users can manage their own cards"
  on public.nfc_cards for all to authenticated
  using (user_id = (select auth.uid()) and not managed_by_admin and public.is_account_active())
  with check (user_id = (select auth.uid()) and not managed_by_admin and public.is_account_active());

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
alter table public.url_scan_allowlist enable row level security;
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
