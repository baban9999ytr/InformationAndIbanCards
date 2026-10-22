begin;

alter table public.nfc_cards
  add column if not exists map_address text,
  add column if not exists map_url text,
  add column if not exists map_type text;

alter table public.profiles
  add column if not exists card_permissions jsonb not null default
    '{"card_create":"on","card_manage":"on","card_view":"on"}'::jsonb;

alter table public.profiles
  drop constraint if exists profiles_card_permissions_check;
alter table public.profiles
  add constraint profiles_card_permissions_check check (
    jsonb_typeof(card_permissions) = 'object'
    and card_permissions ? 'card_create'
    and card_permissions ? 'card_manage'
    and card_permissions ? 'card_view'
    and card_permissions ->> 'card_create' in ('on', 'off', 'request')
    and card_permissions ->> 'card_manage' in ('on', 'off', 'request')
    and card_permissions ->> 'card_view' in ('on', 'off', 'request')
  );

alter table public.nfc_cards
  drop constraint if exists nfc_cards_map_type_check;
alter table public.nfc_cards
  add constraint nfc_cards_map_type_check check (
    map_type is null or map_type in ('embed', 'short', 'legacy')
  );

create or replace function public.is_valid_card_map_reference(
  p_map_type text,
  p_map_url text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_map_type
    when 'embed' then p_map_url ~ '^https://www[.]google[.]com/maps/embed([/?#]|$)'
    when 'short' then p_map_url ~ '^https://maps[.]app[.]goo[.]gl/[A-Za-z0-9_-]+/?([?][^#]*)?(#[^ ]*)?$'
    when 'legacy' then
      p_map_url ~ '^https://maps[.]google[.]com/([?].*)?$'
      or p_map_url ~ '^https://maps[.]google[.]com/maps([/?#]|$)'
      or p_map_url ~ '^https://www[.]google[.]com/maps/(search|place)([/?#]|$)'
    else false
  end;
$$;

revoke all on function public.is_valid_card_map_reference(text, text) from public, anon, authenticated;
grant execute on function public.is_valid_card_map_reference(text, text) to authenticated, service_role;

create or replace function public.enforce_card_location_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  block_value jsonb;
  contact_value jsonb;
  location_value jsonb;
  location_data jsonb;
  contact_data jsonb;
  address_value text;
  map_url_value text;
  map_type_value text;
  iframe_tag text;
  iframe_src text;
  iframe_src_count integer;
  submitted_map_url text;
  block_index integer;
begin
  if jsonb_typeof(new.blocks) = 'array' then
    for block_value in select value from jsonb_array_elements(new.blocks)
    loop
      if block_value ->> 'type' = 'location' then
        location_value := block_value;
      elsif block_value ->> 'type' = 'contact' then
        contact_value := block_value;
      end if;
    end loop;
  end if;

  location_data := case
    when jsonb_typeof(location_value -> 'data') = 'object'
      then location_value -> 'data'
    else '{}'::jsonb
  end;
  contact_data := case
    when jsonb_typeof(contact_value -> 'data') = 'object'
      then contact_value -> 'data'
    else '{}'::jsonb
  end;

  if location_value is not null then
    address_value := nullif(btrim(location_data ->> 'address'), '');
    map_url_value := nullif(btrim(location_data ->> 'map_url'), '');
    map_type_value := nullif(btrim(location_data ->> 'map_type'), '');
  else
    -- Keep older contact-block and explicit-column data readable while new
    -- cards write a dedicated location block.
    address_value := coalesce(
      nullif(btrim(new.map_address), ''),
      nullif(btrim(contact_data ->> 'address'), '')
    );
    map_url_value := coalesce(
      nullif(btrim(new.map_url), ''),
      nullif(btrim(contact_data ->> 'maps_url'), '')
    );
    map_type_value := coalesce(
      nullif(btrim(new.map_type), ''),
      nullif(btrim(contact_data ->> 'map_type'), '')
    );
    if map_url_value is not null and map_type_value is null then
      map_type_value := case
        when map_url_value ~ '^https://www[.]google[.]com/maps/embed([/?#]|$)' then 'embed'
        when map_url_value ~ '^https://maps[.]app[.]goo[.]gl/' then 'short'
        else 'legacy'
      end;
    end if;
  end if;

  submitted_map_url := map_url_value;

  -- Direct REST writes may submit a pasted iframe too. Extract exactly one
  -- quoted src from a single iframe element and discard all other markup.
  if map_url_value ~* '^<iframe([[:space:]]|>)' then
    if map_type_value <> 'embed'
      or map_url_value !~* '^<iframe[[:space:]][^>]*>[[:space:]]*</iframe[[:space:]]*>$' then
      raise exception 'Paste one Google Maps iframe embed code'
        using errcode = '23514';
    end if;
    iframe_tag := substring(map_url_value from '(?i)^<iframe[^>]*>');
    select count(*) into iframe_src_count
      from regexp_matches(iframe_tag, '[[:space:]]src[[:space:]]*=', 'gi');
    if iframe_src_count <> 1 then
      raise exception 'Iframe must contain exactly one src attribute'
        using errcode = '23514';
    end if;
    iframe_src := substring(iframe_tag from '[[:space:]]src[[:space:]]*=[[:space:]]*"([^"]*)"');
    if iframe_src is null then
      iframe_src := substring(iframe_tag from '[[:space:]]src[[:space:]]*=[[:space:]]*''([^'']*)''');
    end if;
    if iframe_src is null then
      raise exception 'Iframe src must be quoted'
        using errcode = '23514';
    end if;
    map_url_value := replace(replace(iframe_src, '&amp;', '&'), '&#38;', '&');
  end if;

  if location_value is not null and address_value is null and map_url_value is null then
    raise exception 'Location block requires an address or one map URL'
      using errcode = '23514';
  end if;

  if address_value is not null and (char_length(address_value) > 500 or address_value ~ '[[:cntrl:]]') then
    raise exception 'Address must be at most 500 characters and contain no control characters'
      using errcode = '23514';
  end if;
  if map_url_value is not null and char_length(map_url_value) > 10000 then
    raise exception 'Map URL is too long'
      using errcode = '23514';
  end if;

  if map_url_value is not null
    and not public.is_valid_card_map_reference(map_type_value, map_url_value) then
    raise exception 'Map URL must use an allowed Google Maps host and path'
      using errcode = '23514';
  end if;

  if submitted_map_url is distinct from map_url_value
    and jsonb_typeof(new.blocks) = 'array' then
    for block_index in 0..jsonb_array_length(new.blocks) - 1
    loop
      if new.blocks -> block_index ->> 'type' = 'location' then
        new.blocks := jsonb_set(
          new.blocks,
          array[block_index::text, 'data', 'map_url'],
          to_jsonb(map_url_value),
          true
        );
      elsif new.blocks -> block_index ->> 'type' = 'contact'
        and new.blocks -> block_index -> 'data' ->> 'maps_url' = submitted_map_url then
        new.blocks := jsonb_set(
          new.blocks,
          array[block_index::text, 'data', 'maps_url'],
          to_jsonb(map_url_value),
          true
        );
      end if;
    end loop;
  end if;

  if map_url_value is null then
    map_type_value := null;
  end if;
  new.map_address := address_value;
  new.map_url := map_url_value;
  new.map_type := map_type_value;
  return new;
end;
$$;

revoke all on function public.enforce_card_location_fields() from public, anon, authenticated;
drop trigger if exists enforce_card_location_fields on public.nfc_cards;
create trigger enforce_card_location_fields
  before insert or update of blocks, map_address, map_url, map_type
  on public.nfc_cards
  for each row execute function public.enforce_card_location_fields();

create or replace function public.card_permission_mode(p_permission text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_permission not in ('card_create', 'card_manage', 'card_view') then 'off'
    when p.is_suspended then 'off'
    when p.role in ('admin', 'reseller') or p.is_super_user then 'on'
    else coalesce(p.card_permissions ->> p_permission, 'on')
  end
  from public.profiles as p
  where p.id = (select auth.uid());
$$;

revoke all on function public.card_permission_mode(text) from public, anon;
grant execute on function public.card_permission_mode(text) to authenticated;

create or replace function public.has_card_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.card_permission_mode(p_permission) = 'on', false);
$$;

revoke all on function public.has_card_permission(text) from public, anon;
grant execute on function public.has_card_permission(text) to authenticated;

create table if not exists public.card_permission_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  permission_key text not null check (
    permission_key in ('card_create', 'card_manage', 'card_view')
  ),
  status text not null default 'pending' check (
    status in ('pending', 'approved', 'rejected')
  ),
  requested_at timestamptz not null default now(),
  resolved_by uuid,
  resolved_at timestamptz,
  constraint card_permission_requests_user_id_fkey
    foreign key (user_id) references public.profiles(id) on delete cascade,
  constraint card_permission_requests_resolver_fkey
    foreign key (resolved_by) references public.profiles(id) on delete set null,
  constraint card_permission_requests_resolution_check check (
    (status = 'pending' and resolved_by is null and resolved_at is null)
    or (status <> 'pending' and resolved_at is not null)
  )
);

create index if not exists card_permission_requests_pending_idx
  on public.card_permission_requests (requested_at desc)
  where status = 'pending';
create unique index if not exists card_permission_requests_one_pending_idx
  on public.card_permission_requests (user_id, permission_key)
  where status = 'pending';

alter table public.card_permission_requests enable row level security;
revoke all on public.card_permission_requests from anon, authenticated;
grant select, insert on public.card_permission_requests to authenticated;

drop policy if exists "Users can view their permission requests" on public.card_permission_requests;
create policy "Users can view their permission requests"
  on public.card_permission_requests for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_admin_or_super_user()
  );

drop policy if exists "Users can request configured card permissions" on public.card_permission_requests;
create policy "Users can request configured card permissions"
  on public.card_permission_requests for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'pending'
    and resolved_by is null
    and resolved_at is null
    and public.is_account_active()
    and public.card_permission_mode(permission_key) = 'request'
  );

revoke update, delete on public.card_permission_requests from authenticated;

revoke update (card_permissions) on public.profiles from authenticated;

drop policy if exists "Users can manage their own cards" on public.nfc_cards;
create policy "Users can view cards with card permission"
  on public.nfc_cards for select to authenticated
  using (
    user_id = (select auth.uid())
    and not managed_by_admin
    and public.is_account_active()
    and (
      (select public.has_card_permission('card_view'))
      or (select public.has_card_permission('card_manage'))
    )
  );

create policy "Users can create cards with card permission"
  on public.nfc_cards for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and not managed_by_admin
    and public.is_account_active()
    and (select public.has_card_permission('card_create'))
  );

create policy "Users can update cards with card permission"
  on public.nfc_cards for update to authenticated
  using (
    user_id = (select auth.uid())
    and not managed_by_admin
    and public.is_account_active()
    and (select public.has_card_permission('card_manage'))
  )
  with check (
    user_id = (select auth.uid())
    and not managed_by_admin
    and public.is_account_active()
    and (select public.has_card_permission('card_manage'))
  );

create policy "Users can delete cards with card permission"
  on public.nfc_cards for delete to authenticated
  using (
    user_id = (select auth.uid())
    and not managed_by_admin
    and public.is_account_active()
    and (select public.has_card_permission('card_manage'))
  );

create or replace function public.get_card_feedback(p_card_id uuid default null)
returns table (
  id uuid, card_id uuid, rating smallint, message text, display_name text,
  display_email text, is_name_hidden boolean, is_email_hidden boolean,
  created_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
declare caller uuid := auth.uid();
begin
  if caller is null or not public.is_account_active() then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if public.is_admin_or_super_user() then
    raise exception 'Use the administrator feedback function' using errcode = '42501';
  end if;
  if not public.has_card_permission('card_view') and not public.has_card_permission('card_manage') then
    raise exception 'Card viewing permission required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.nfc_cards c
    where c.user_id = caller and (p_card_id is null or c.id = p_card_id)
  ) then
    raise exception 'Not authorized to view these feedback records' using errcode = '42501';
  end if;
  return query
  select f.id, f.card_id, f.rating, f.customer_message,
    case when f.is_name_hidden then 'Anonim Kullanıcı'::text
      else coalesce(nullif(f.name, ''), 'Anonim Kullanıcı')::text end,
    case
      when coalesce(f.email, f.customer_contact) is null then null::text
      when f.is_email_hidden then left(split_part(coalesce(f.email, f.customer_contact), '@', 1), 1)
        || '***@' || split_part(coalesce(f.email, f.customer_contact), '@', 2)
      else coalesce(f.email, f.customer_contact)::text
    end,
    f.is_name_hidden, f.is_email_hidden, f.created_at
  from public.card_feedbacks f
  join public.nfc_cards c on c.id = f.card_id
  where (p_card_id is null or f.card_id = p_card_id) and c.user_id = caller
  order by f.created_at desc;
end;
$$;
revoke all on function public.get_card_feedback(uuid) from public, anon;
grant execute on function public.get_card_feedback(uuid) to authenticated;

-- Do not grant authenticated users update rights to permission-bearing profile
-- data; the admin-users Edge Function is the only write path for those keys.

commit;
