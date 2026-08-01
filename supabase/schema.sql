-- Khoj database schema, Row Level Security policies, RPC, and storage
-- buckets. Run this once in the Supabase SQL editor for a new project.

create table persons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_bn text,
  age integer,
  gender text,
  district text,
  photo_urls text[] not null default '{}',        -- up to 3 paths in the private person-photos bucket
  face_descriptors float8[][] not null default '{}', -- one descriptor per photo_urls entry
  display_photo_index smallint not null default 0,   -- which photo_urls entry shows in list views
  telegram_chat_id text,
  registered_by uuid,           -- auth.uid() of the registering account
  created_at timestamptz default now()
);
alter table persons add constraint persons_max_3_photos check (array_length(photo_urls,1) is null or array_length(photo_urls,1) <= 3);

create table reports (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('found', 'missing')),
  photo_urls text[] not null default '{}',         -- up to 3 public URLs in the photos bucket; [0] is primary
  face_descriptors float8[][] not null default '{}', -- one descriptor per photo_urls entry
  location_lat float8,
  location_lng float8,
  location_name text,
  description text,
  reporter_contact text,
  synced boolean default false,
  created_at timestamptz default now()
);
alter table reports add constraint reports_max_3_photos check (array_length(photo_urls,1) is null or array_length(photo_urls,1) <= 3);

create table matches (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references persons(id),
  report_id uuid references reports(id),
  confidence float8,
  notified boolean default false,
  created_at timestamptz default now()
);

-- Row Level Security: persons are only visible to the account that
-- registered them; reports/matches just require any session (including
-- an anonymous one) rather than the bare, unauthenticated API key.
alter table persons enable row level security;
create policy "owner select persons" on persons for select to authenticated using (auth.uid() = registered_by);
create policy "owner insert persons" on persons for insert to authenticated with check (auth.uid() = registered_by);
create policy "owner update persons" on persons for update to authenticated using (auth.uid() = registered_by);
create policy "owner delete persons" on persons for delete to authenticated using (auth.uid() = registered_by);

alter table reports enable row level security;
create policy "authenticated read reports" on reports for select to authenticated using (true);
create policy "authenticated insert reports" on reports for insert to authenticated with check (true);

alter table matches enable row level security;
create policy "authenticated select matches" on matches for select to authenticated using (true);
create policy "authenticated insert matches" on matches for insert to authenticated with check (true);

-- Narrow RPC for the offline-matching cache: id + descriptors only, no
-- PII. Bypasses the persons RLS above (security definer) but only ever
-- returns these two columns.
create or replace function public.get_match_registry()
returns table (id uuid, face_descriptors float8[][])
language sql security definer set search_path = public
as $$ select id, face_descriptors from persons where coalesce(array_length(face_descriptors,1),0) > 0; $$;
revoke all on function public.get_match_registry() from public, anon;
grant execute on function public.get_match_registry() to authenticated;

-- Private bucket for registration photos: only the owner can read/sign.
insert into storage.buckets (id, name, public) values ('person-photos', 'person-photos', false);
create policy "authenticated upload person-photos" on storage.objects for insert to authenticated with check (bucket_id = 'person-photos');
create policy "owner read person-photos" on storage.objects for select to authenticated using (bucket_id = 'person-photos' and owner_id = (auth.uid())::text);

-- Public bucket for report photos, shown on the crisis map.
insert into storage.buckets (id, name, public) values ('photos', 'photos', true);
create policy "public read photos" on storage.objects for select using (bucket_id = 'photos');
create policy "public upload photos" on storage.objects for insert with check (bucket_id = 'photos');

-- Realtime for the in-app match notification banner.
alter publication supabase_realtime add table matches;

-- Telegram notification trigger. Requires pg_net. Replace the url below
-- with your actual Vercel deployment before running this block.
create extension if not exists pg_net;

create or replace function public.notify_match_webhook()
returns trigger as $$
begin
  perform net.http_post(
    url := 'https://<your-deployment>.vercel.app/api/telegram-webhook',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object('type', 'INSERT', 'table', 'matches', 'schema', 'public', 'record', to_jsonb(NEW), 'old_record', null),
    timeout_milliseconds := 15000
  );
  return NEW;
end;
$$ language plpgsql security definer;

create trigger matches_notify_webhook after insert on matches for each row execute function public.notify_match_webhook();
