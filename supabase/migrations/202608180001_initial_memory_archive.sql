-- Private two-member memory archive. Apply with `supabase db push`.
-- This migration intentionally creates no public storage bucket: originals belong in Cloudflare R2.

create extension if not exists pgcrypto;

create type public.member_role as enum ('owner', 'contributor');
create type public.media_kind as enum ('image', 'video', 'screenshot', 'audio', 'document');
create type public.media_status as enum ('pending_upload', 'uploaded', 'processing', 'ready', 'failed', 'archived');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  avatar_media_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  role public.member_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 160),
  description text,
  starts_on date,
  ends_on date,
  cover_media_id uuid,
  sort_order integer not null default 0,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id)
);

create table public.stops (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  introduction text,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  arrived_on date,
  sort_order integer not null default 0,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id)
);

create table public.media (
  id uuid primary key default gen_random_uuid(),
  kind public.media_kind not null,
  status public.media_status not null default 'pending_upload',
  original_object_key text unique,
  original_filename text not null,
  original_mime_type text not null,
  original_bytes bigint check (original_bytes >= 0),
  sha256 text check (sha256 is null or sha256 ~ '^[A-Fa-f0-9]{64}$'),
  width integer check (width > 0),
  height integer check (height > 0),
  duration_seconds numeric(12,3) check (duration_seconds >= 0),
  captured_at timestamptz,
  stream_uid text unique,
  thumbnail_object_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id)
);

alter table public.profiles add constraint profiles_avatar_media_id_fkey
  foreign key (avatar_media_id) references public.media(id) on delete set null;
alter table public.trips add constraint trips_cover_media_id_fkey
  foreign key (cover_media_id) references public.media(id) on delete set null;

create table public.stop_media (
  stop_id uuid not null references public.stops(id) on delete cascade,
  media_id uuid not null references public.media(id) on delete restrict,
  display_order integer not null default 0,
  primary key (stop_id, media_id)
);

create table public.moments (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id),
  body text not null default '',
  published_at timestamptz not null,
  location_name text,
  source_screenshot_media_id uuid references public.media(id) on delete set null,
  visibility_note text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id)
);

create table public.moment_media (
  moment_id uuid not null references public.moments(id) on delete cascade,
  media_id uuid not null references public.media(id) on delete restrict,
  display_order integer not null default 0,
  layout_hint text,
  primary key (moment_id, media_id)
);

create table public.moment_likes (
  id uuid primary key default gen_random_uuid(),
  moment_id uuid not null references public.moments(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  actor_id uuid references public.profiles(id) on delete set null,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.moment_comments (
  id uuid primary key default gen_random_uuid(),
  moment_id uuid not null references public.moments(id) on delete cascade,
  author_name text not null check (char_length(author_name) between 1 and 80),
  reply_to_name text,
  body text not null check (char_length(body) between 1 and 2000),
  actor_id uuid references public.profiles(id) on delete set null,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.content_deletions (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('trip', 'stop', 'media', 'moment')),
  entity_id uuid not null,
  deleted_by uuid not null references public.profiles(id),
  deleted_at timestamptz not null default now(),
  purge_after timestamptz not null default (now() + interval '30 days'),
  restored_at timestamptz,
  restored_by uuid references public.profiles(id)
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create table public.usage_limits (
  id boolean primary key default true check (id),
  max_original_bytes bigint not null default 536870912000 check (max_original_bytes > 0),
  max_upload_bytes bigint not null default 10737418240 check (max_upload_bytes > 0),
  max_monthly_playback_minutes integer not null default 1000 check (max_monthly_playback_minutes > 0),
  media_access_paused boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);
insert into public.usage_limits (id) values (true) on conflict do nothing;

create table public.usage_daily (
  usage_date date not null,
  metric text not null check (metric in ('uploaded_bytes', 'stored_bytes', 'media_accesses', 'playback_minutes')),
  value numeric(20,3) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (usage_date, metric)
);

create table public.backup_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('started', 'completed', 'failed', 'verified')),
  destination text not null check (destination in ('b2', 'local_export')),
  manifest_object_key text,
  object_count bigint,
  total_bytes bigint,
  checksum text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error_message text,
  initiated_by uuid references public.profiles(id)
);

create index stops_trip_sort_idx on public.stops(trip_id, sort_order) where deleted_at is null;
create index moments_published_idx on public.moments(published_at desc) where deleted_at is null;
create index media_creator_idx on public.media(created_by) where deleted_at is null;
create index audit_logs_entity_idx on public.audit_logs(entity_type, entity_id, created_at desc);

create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships m where m.user_id = auth.uid() and m.is_active);
$$;
create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships m where m.user_id = auth.uid() and m.is_active and m.role = 'owner');
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql security definer set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, before_data, after_data)
  values (auth.uid(), lower(tg_op), tg_table_name, coalesce(new.id, old.id),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end;
$$;

create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger trips_touch before update on public.trips for each row execute function public.touch_updated_at();
create trigger stops_touch before update on public.stops for each row execute function public.touch_updated_at();
create trigger media_touch before update on public.media for each row execute function public.touch_updated_at();
create trigger moments_touch before update on public.moments for each row execute function public.touch_updated_at();
create trigger comments_touch before update on public.moment_comments for each row execute function public.touch_updated_at();
create trigger trips_audit after insert or update or delete on public.trips for each row execute function public.audit_row_change();
create trigger stops_audit after insert or update or delete on public.stops for each row execute function public.audit_row_change();
create trigger media_audit after insert or update or delete on public.media for each row execute function public.audit_row_change();
create trigger moments_audit after insert or update or delete on public.moments for each row execute function public.audit_row_change();

-- Profiles are private; owner provisions members with the service-role-only bootstrap process.
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.trips enable row level security;
alter table public.stops enable row level security;
alter table public.media enable row level security;
alter table public.stop_media enable row level security;
alter table public.moments enable row level security;
alter table public.moment_media enable row level security;
alter table public.moment_likes enable row level security;
alter table public.moment_comments enable row level security;
alter table public.content_deletions enable row level security;
alter table public.audit_logs enable row level security;
alter table public.usage_limits enable row level security;
alter table public.usage_daily enable row level security;
alter table public.backup_runs enable row level security;

create policy "members read profiles" on public.profiles for select using (public.is_member());
create policy "users update own profile" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "members read memberships" on public.memberships for select using (public.is_member());
create policy "owner manages memberships" on public.memberships for all using (public.is_owner()) with check (public.is_owner());

create policy "members read trips" on public.trips for select using (public.is_member() and deleted_at is null);
create policy "members create trips" on public.trips for insert with check (public.is_member() and created_by = auth.uid());
create policy "owner updates trips" on public.trips for update using (public.is_owner()) with check (public.is_owner());
create policy "owner deletes trips" on public.trips for delete using (public.is_owner());
create policy "members read stops" on public.stops for select using (public.is_member() and deleted_at is null);
create policy "members create stops" on public.stops for insert with check (public.is_member() and created_by = auth.uid());
create policy "owner updates stops" on public.stops for update using (public.is_owner()) with check (public.is_owner());
create policy "owner deletes stops" on public.stops for delete using (public.is_owner());
create policy "members read media" on public.media for select using (public.is_member() and deleted_at is null);
create policy "members create media" on public.media for insert with check (public.is_member() and created_by = auth.uid());
create policy "owner updates media" on public.media for update using (public.is_owner()) with check (public.is_owner());
create policy "owner deletes media" on public.media for delete using (public.is_owner());
create policy "members read stop media" on public.stop_media for select using (public.is_member());
create policy "members add stop media" on public.stop_media for insert with check (public.is_member());
create policy "owner changes stop media" on public.stop_media for update using (public.is_owner()) with check (public.is_owner());
create policy "owner removes stop media" on public.stop_media for delete using (public.is_owner());
create policy "members read moments" on public.moments for select using (public.is_member() and deleted_at is null);
create policy "members create moments" on public.moments for insert with check (public.is_member() and created_by = auth.uid());
create policy "owner updates moments" on public.moments for update using (public.is_owner()) with check (public.is_owner());
create policy "owner deletes moments" on public.moments for delete using (public.is_owner());
create policy "members read moment media" on public.moment_media for select using (public.is_member());
create policy "members add moment media" on public.moment_media for insert with check (public.is_member());
create policy "owner changes moment media" on public.moment_media for update using (public.is_owner()) with check (public.is_owner());
create policy "owner removes moment media" on public.moment_media for delete using (public.is_owner());
create policy "members read likes" on public.moment_likes for select using (public.is_member());
create policy "members add likes" on public.moment_likes for insert with check (public.is_member());
create policy "owner changes likes" on public.moment_likes for update using (public.is_owner()) with check (public.is_owner());
create policy "owner removes likes" on public.moment_likes for delete using (public.is_owner());
create policy "members read comments" on public.moment_comments for select using (public.is_member());
create policy "members add comments" on public.moment_comments for insert with check (public.is_member());
create policy "owner changes comments" on public.moment_comments for update using (public.is_owner()) with check (public.is_owner());
create policy "owner removes comments" on public.moment_comments for delete using (public.is_owner());
create policy "owner reads deletion log" on public.content_deletions for select using (public.is_owner());
create policy "owner manages deletion log" on public.content_deletions for all using (public.is_owner()) with check (public.is_owner());
create policy "owner reads audit" on public.audit_logs for select using (public.is_owner());
create policy "owner reads limits" on public.usage_limits for select using (public.is_owner());
create policy "owner changes limits" on public.usage_limits for update using (public.is_owner()) with check (public.is_owner());
create policy "owner reads usage" on public.usage_daily for select using (public.is_owner());
create policy "owner reads backups" on public.backup_runs for select using (public.is_owner());
create policy "owner manages backups" on public.backup_runs for all using (public.is_owner()) with check (public.is_owner());

revoke all on function public.is_member() from public;
revoke all on function public.is_owner() from public;
grant execute on function public.is_member() to authenticated;
grant execute on function public.is_owner() to authenticated;
