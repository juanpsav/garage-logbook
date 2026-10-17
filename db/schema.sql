-- App tables. Better Auth's own tables (user, session, account, verification)
-- are created by `npm run db:migrate`, which runs this file and then the Better Auth CLI.

-- The owner's cars, tasks, history and documents, one JSON row per record.
create table if not exists records (
  user_id    text        not null,
  collection text        not null check (collection in ('cars', 'tasks', 'log', 'docs')),
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, collection, id)
);

-- Manufacturer schedules found by lookups, shared with everyone (guests included).
create table if not exists schedules (
  id         text        primary key,
  data       jsonb       not null,
  created_by text,
  created_at timestamptz not null default now()
);

-- Daily counters for rate limits.
create table if not exists usage_counts (
  key   text not null,
  day   date not null,
  count int  not null default 0,
  primary key (key, day)
);
