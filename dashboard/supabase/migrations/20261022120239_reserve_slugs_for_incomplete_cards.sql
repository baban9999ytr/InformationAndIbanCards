begin;

-- A private card can reserve its short slug while it is being completed.
alter table public.nfc_cards
  add column if not exists slug_expires_at timestamptz,
  add column if not exists slug_expiry_resolved_at timestamptz;

alter table public.nfc_cards
  drop constraint if exists nfc_cards_access_identifier;

alter table public.nfc_cards
  add constraint nfc_cards_access_identifier check (
    (access_mode = 'public' and slug is not null and access_token is null)
    or (access_mode = 'private' and access_token is not null)
  );

drop index if exists public.nfc_cards_public_slug_unique;
create unique index if not exists nfc_cards_reserved_slug_unique
  on public.nfc_cards (slug)
  where slug is not null;

create or replace function public.card_jsonb_has_text(p_value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_value) = 'string'
      then nullif(btrim(p_value #>> '{}'), '') is not null
    else false
  end;
$$;

revoke all on function public.card_jsonb_has_text(jsonb) from public;
grant execute on function public.card_jsonb_has_text(jsonb) to authenticated, service_role;

create or replace function public.card_has_public_content(
  p_title text,
  p_blocks jsonb,
  p_google_review_url text,
  p_whatsapp text,
  p_sms text,
  p_instagram_url text,
  p_email text,
  p_iban text,
  p_extra_links jsonb
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    nullif(btrim(coalesce(p_google_review_url, '')), '') is not null
    or nullif(btrim(coalesce(p_whatsapp, '')), '') is not null
    or nullif(btrim(coalesce(p_sms, '')), '') is not null
    or nullif(btrim(coalesce(p_instagram_url, '')), '') is not null
    or nullif(btrim(coalesce(p_email, '')), '') is not null
    or nullif(btrim(coalesce(p_iban, '')), '') is not null
    or exists (
      select 1
      from jsonb_array_elements(
        case
          when jsonb_typeof(p_extra_links) = 'array' then p_extra_links
          else '[]'::jsonb
        end
      ) as link
      where public.card_jsonb_has_text(link.value -> 'url')
    )
    or exists (
      select 1
      from jsonb_array_elements(
        case
          when jsonb_typeof(p_blocks) = 'array' then p_blocks
          else '[]'::jsonb
        end
      ) as block
      where block.value -> 'visible' is distinct from 'false'::jsonb
        and case block.value ->> 'type'
          when 'profile' then
            (
              public.card_jsonb_has_text(block.value -> 'data' -> 'title')
              or public.card_jsonb_has_text(block.value -> 'data' -> 'bio')
              or public.card_jsonb_has_text(block.value -> 'data' -> 'avatar_url')
              or public.card_jsonb_has_text(block.value -> 'data' -> 'cover_url')
              or public.card_jsonb_has_text(block.value -> 'data' -> 'location')
              or exists (
                select 1
                from jsonb_array_elements(
                  case
                    when jsonb_typeof(block.value -> 'data' -> 'gallery') = 'array'
                      then block.value -> 'data' -> 'gallery'
                    else '[]'::jsonb
                  end
                ) as gallery_item
                where public.card_jsonb_has_text(gallery_item.value)
              )
              or (
                public.card_jsonb_has_text(block.value -> 'data' -> 'name')
                and lower(btrim(block.value -> 'data' ->> 'name')) <> lower(btrim(coalesce(p_title, '')))
              )
              or (
                public.card_jsonb_has_text(block.value -> 'data' -> 'company')
                and lower(btrim(block.value -> 'data' ->> 'company')) <> lower(btrim(coalesce(p_title, '')))
              )
            )
          when 'google_review' then
            public.card_jsonb_has_text(block.value -> 'data' -> 'url')
          when 'payment_or_iban' then
            public.card_jsonb_has_text(block.value -> 'data' -> 'iban')
          when 'payment' then
            public.card_jsonb_has_text(block.value -> 'data' -> 'iban')
          when 'contact' then
            public.card_jsonb_has_text(block.value -> 'data' -> 'phone')
            or public.card_jsonb_has_text(block.value -> 'data' -> 'sms')
            or public.card_jsonb_has_text(block.value -> 'data' -> 'whatsapp')
            or public.card_jsonb_has_text(block.value -> 'data' -> 'email')
            or public.card_jsonb_has_text(block.value -> 'data' -> 'maps_url')
            or public.card_jsonb_has_text(block.value -> 'data' -> 'address')
          when 'location' then
            public.card_jsonb_has_text(block.value -> 'data' -> 'address')
            or public.card_jsonb_has_text(block.value -> 'data' -> 'map_url')
          when 'social' then
            exists (
              select 1 from jsonb_array_elements(
                case when jsonb_typeof(block.value -> 'data' -> 'links') = 'array'
                  then block.value -> 'data' -> 'links' else '[]'::jsonb end
              ) as item
              where public.card_jsonb_has_text(item.value -> 'url')
            )
          when 'custom_links' then
            exists (
              select 1 from jsonb_array_elements(
                case when jsonb_typeof(block.value -> 'data' -> 'links') = 'array'
                  then block.value -> 'data' -> 'links' else '[]'::jsonb end
              ) as item
              where public.card_jsonb_has_text(item.value -> 'url')
            )
          when 'custom' then
            exists (
              select 1 from jsonb_array_elements(
                case when jsonb_typeof(block.value -> 'data' -> 'links') = 'array'
                  then block.value -> 'data' -> 'links' else '[]'::jsonb end
              ) as item
              where public.card_jsonb_has_text(item.value -> 'url')
            )
          when 'custom_button' then
            public.card_jsonb_has_text(block.value -> 'data' -> 'url')
          when 'text_or_note' then
            public.card_jsonb_has_text(block.value -> 'data' -> 'title')
            or public.card_jsonb_has_text(block.value -> 'data' -> 'text')
          else false
        end
    );
$$;

revoke all on function public.card_has_public_content(text, jsonb, text, text, text, text, text, text, jsonb) from public;
grant execute on function public.card_has_public_content(text, jsonb, text, text, text, text, text, text, jsonb) to authenticated, service_role;

create or replace function public.enforce_card_public_readiness()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  card_ready boolean;
begin
  card_ready := public.card_has_public_content(
    new.title,
    new.blocks,
    new.google_review_url,
    new.whatsapp,
    new.sms,
    new.instagram_url,
    new.email,
    new.iban,
    new.extra_links
  );

  if card_ready then
    new.slug_expires_at := null;
    new.slug_expiry_resolved_at := null;
  else
    if new.access_mode = 'public' then
      new.access_mode := 'private';
      new.access_token := coalesce(new.access_token, gen_random_uuid()::text);
    end if;

    if new.slug is null then
      new.slug_expires_at := null;
      new.slug_expiry_resolved_at := null;
    elsif tg_op = 'INSERT' or old.slug is null then
      new.slug_expires_at := now() + interval '48 hours';
      new.slug_expiry_resolved_at := null;
    elsif old.slug_expires_at is null then
      new.slug_expires_at := now() + interval '48 hours';
    else
      -- Changing the slug must not reset its original 48-hour reservation.
      new.slug_expires_at := old.slug_expires_at;
    end if;

  end if;

  return new;
end;
$$;

revoke all on function public.enforce_card_public_readiness() from public;
drop trigger if exists enforce_card_public_readiness on public.nfc_cards;
create trigger enforce_card_public_readiness
  before insert or update on public.nfc_cards
  for each row execute function public.enforce_card_public_readiness();

-- Backfill only review timestamps; do not change visibility or release slugs.
update public.nfc_cards as card
set slug_expires_at = card.created_at + interval '48 hours'
where card.slug is not null
  and card.slug_expires_at is null
  and card.slug_expiry_resolved_at is null
  and not public.card_has_public_content(
    card.title,
    card.blocks,
    card.google_review_url,
    card.whatsapp,
    card.sms,
    card.instagram_url,
    card.email,
    card.iban,
    card.extra_links
  );

-- Expiry is a review-queue timestamp only. Admins choose whether to hide,
-- edit, delete, or release the slug; no scheduled mutation runs on records.

commit;
