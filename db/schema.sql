-- App tables. Better Auth's own tables (user, session, account, verification)
-- are created by `npm run db:migrate`, which runs this file and then the Better Auth CLI.

-- The old store: one JSON row per record. Kept read-only as a backup after the move to the tables below.
create table if not exists records (
  user_id    text        not null,
  collection text        not null check (collection in ('cars', 'tasks', 'log', 'docs')),
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, collection, id)
);

-- The garage, one table per kind of record. Ids come from the app; every row belongs to one user.
create table if not exists cars (
  user_id     text        not null,
  id          text        not null,
  name        text        not null,
  km          integer,
  km_date     date,
  schedule_id text,
  created     timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists visits (
  user_id text          not null,
  id      text          not null,
  car_id  text,
  title   text          not null default '',
  date    date,
  km      integer,
  shop    text,
  total   numeric(10,2),
  summary text,
  status  text          not null default 'draft' check (status in ('draft', 'open', 'confirmed')),
  created timestamptz   not null default now(),
  primary key (user_id, id),
  foreign key (user_id, car_id) references cars (user_id, id) on delete set null (car_id)
);

create table if not exists items (
  user_id   text          not null,
  id        text          not null,
  car_id    text,
  visit_id  text,
  source    text          not null default 'shop' check (source in ('shop', 'you')),
  kind      text          not null check (kind in ('done', 'found', 'quoted')),
  text      text          not null,
  original  text,
  cost      numeric(10,2),
  page      integer,
  unsure    boolean       not null default false,
  keywords  text[]        not null default '{}',
  note      text,
  decision  text          check (decision in ('pending', 'accepted', 'declined', 'deferred')),
  created   timestamptz   not null default now(),
  primary key (user_id, id),
  foreign key (user_id, car_id) references cars (user_id, id) on delete set null (car_id),
  foreign key (user_id, visit_id) references visits (user_id, id) on delete cascade
);
create index if not exists items_visit on items (user_id, visit_id);
create index if not exists items_car on items (user_id, car_id);

create table if not exists tasks (
  user_id      text        not null,
  id           text        not null,
  car_id       text        not null,
  title        text        not null,
  notes        text,
  every_months integer,
  every_km     integer,
  anchor       text,
  due_date     date,
  due_km       integer,
  sug_key      text,
  visit_id     text,
  created      timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, car_id) references cars (user_id, id) on delete cascade,
  foreign key (user_id, visit_id) references visits (user_id, id) on delete set null (visit_id)
);

-- Pages of a visit and photos of observations. orig and view are private Blob pathnames.
create table if not exists files (
  user_id  text        not null,
  id       text        not null,
  visit_id text,
  item_id  text,
  position integer     not null default 0,
  type     text        not null,
  name     text,
  orig     text        not null,
  view     text,
  created  timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, visit_id) references visits (user_id, id) on delete cascade,
  foreign key (user_id, item_id) references items (user_id, id) on delete cascade
);

-- Conversations with the assistant: one per visit, and one per car (visit_id null).
-- content is the Claude API message content, kept exactly as sent and received.
create table if not exists messages (
  user_id  text        not null,
  id       bigserial   primary key,
  car_id   text,
  visit_id text,
  role     text        not null check (role in ('user', 'assistant')),
  content  jsonb       not null,
  created  timestamptz not null default now(),
  check ((car_id is null) <> (visit_id is null)),
  foreign key (user_id, car_id) references cars (user_id, id) on delete cascade,
  foreign key (user_id, visit_id) references visits (user_id, id) on delete cascade
);
create index if not exists messages_thread on messages (user_id, visit_id, car_id, id);

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
