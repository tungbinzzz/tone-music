-- ToneLink License Server — Supabase Schema
-- Run this in the Supabase SQL editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ── Users ────────────────────────────────────────────────────────────────────
create table if not exists users (
  id          uuid primary key default uuid_generate_v4(),
  email       text unique not null,
  name        text,
  created_at  timestamptz default now()
);

-- ── Licenses ─────────────────────────────────────────────────────────────────
create table if not exists licenses (
  id           uuid primary key default uuid_generate_v4(),
  license_key  text unique not null,
  user_id      uuid references users(id) on delete set null,
  plan         text not null default 'standard',
  status       text not null default 'active',  -- active | suspended | revoked
  max_devices  int not null default 1,
  expires_at   timestamptz,                      -- null = lifetime
  created_at   timestamptz default now()
);

create index if not exists idx_licenses_key on licenses(license_key);
create index if not exists idx_licenses_user on licenses(user_id);

-- ── Activations ──────────────────────────────────────────────────────────────
create table if not exists activations (
  id            uuid primary key default uuid_generate_v4(),
  license_id    uuid not null references licenses(id) on delete cascade,
  machine_id    text not null,
  machine_name  text,
  app_version   text,
  last_seen     timestamptz default now(),
  created_at    timestamptz default now(),
  unique(license_id, machine_id)
);

create index if not exists idx_activations_license on activations(license_id);
create index if not exists idx_activations_machine on activations(machine_id);

-- ── App Updates ───────────────────────────────────────────────────────────────
create table if not exists app_updates (
  id           uuid primary key default uuid_generate_v4(),
  version      text not null,
  platform     text not null default 'win32',
  url          text not null,
  changelog    text,
  is_required  boolean not null default false,
  created_at   timestamptz default now()
);

create index if not exists idx_updates_platform on app_updates(platform, created_at desc);

-- Online known-song tone cache contributed by licensed clients
create table if not exists known_songs (
  id                     uuid primary key default uuid_generate_v4(),
  video_id               text unique not null,
  title                  text not null,
  url                    text not null default '',
  duration               double precision not null default 0,
  main_tone              text not null,
  transitions            jsonb not null default '[]'::jsonb,
  contribution_count     int not null default 1,
  last_contributor_hash  text,
  last_app_version       text,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

create index if not exists idx_known_songs_video_id on known_songs(video_id);
create index if not exists idx_known_songs_updated_at on known_songs(updated_at desc);

-- ── Row Level Security (optional, server uses service role key) ───────────────
alter table licenses enable row level security;
alter table activations enable row level security;
alter table app_updates enable row level security;
alter table users enable row level security;
alter table known_songs enable row level security;

-- Service role bypasses RLS automatically — no policies needed for backend
-- Add a sample license for testing:
-- insert into licenses (license_key, plan, status, max_devices)
-- values ('TL-TEST-1234-ABCD', 'standard', 'active', 2);
