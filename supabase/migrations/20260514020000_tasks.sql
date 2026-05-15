-- Maintenance & service tasks: photo/video-first Kanban for non-routine work.
-- Spec: docs/tasks-spec.md
--
-- One canonical board per org, scoped to properties. Cards carry their proof
-- in R2 (photo or short video). Status moves through Open → In progress →
-- Waiting → Done. Activity is logged per state change so the timeline is
-- auditable for a GM or insurance claim months later.

create type public.task_status as enum (
  'open',
  'in_progress',
  'waiting',
  'done'
);

create type public.task_priority as enum (
  'low',
  'normal',
  'high',
  'urgent'
);

create type public.task_category as enum (
  'plumbing',
  'electrical',
  'hvac',
  'appliance',
  'furniture',
  'fixtures',
  'flooring',
  'paint_wall',
  'door_lock',
  'window',
  'lighting',
  'tv_av',
  'pool_spa',
  'landscaping',
  'pest',
  'housekeeping',
  'lost_found',
  'amenities',
  'cleanliness',
  'guest_request',
  'safety',
  'it',
  'other'
);

create type public.task_attachment_kind as enum ('photo', 'video');

create type public.task_attachment_phase as enum ('before', 'progress', 'after');

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  reference text not null,
  title text not null check (char_length(title) between 1 and 200),
  description text check (description is null or char_length(description) <= 4000),
  status public.task_status not null default 'open',
  priority public.task_priority not null default 'normal',
  category public.task_category not null default 'other',
  location text check (location is null or char_length(location) <= 120),
  assignee_id uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_by_email text,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id, reference)
);

create index tasks_org_idx on public.tasks(org_id);
create index tasks_property_status_idx on public.tasks(property_id, status);
create index tasks_assignee_idx on public.tasks(assignee_id) where assignee_id is not null;
create index tasks_org_status_priority_idx on public.tasks(org_id, status, priority);

create table public.task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind public.task_attachment_kind not null,
  r2_key text not null,
  poster_key text,
  filename text not null,
  content_type text,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  caption text check (caption is null or char_length(caption) <= 280),
  phase public.task_attachment_phase not null default 'before',
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index task_attachments_task_idx on public.task_attachments(task_id);
create index task_attachments_org_idx on public.task_attachments(org_id);

create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  author_id uuid references public.profiles(id) on delete set null,
  author_email text,
  created_at timestamptz not null default now()
);

create index task_comments_task_idx on public.task_comments(task_id, created_at);

-- Audit-worthy state changes (created, assigned, status, priority, evidence
-- upload, comment). Renders as the timeline on the detail page.
create table public.task_activity (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in (
    'created', 'assigned', 'unassigned', 'status', 'priority',
    'attachment', 'comment', 'forced_done', 'deleted'
  )),
  from_value text,
  to_value text,
  note text check (note is null or char_length(note) <= 500),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_email text,
  created_at timestamptz not null default now()
);

create index task_activity_task_idx on public.task_activity(task_id, created_at);

create table public.task_tags (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  tag text not null check (char_length(tag) between 1 and 48),
  created_at timestamptz not null default now(),
  unique (task_id, tag)
);

create index task_tags_task_idx on public.task_tags(task_id);
create index task_tags_org_tag_idx on public.task_tags(org_id, tag);

-- ----------------------------------------------------------------------------
-- RLS: org-scoped read; writes go through the server actions w/ admin client.
-- ----------------------------------------------------------------------------
alter table public.tasks enable row level security;
alter table public.task_attachments enable row level security;
alter table public.task_comments enable row level security;
alter table public.task_activity enable row level security;
alter table public.task_tags enable row level security;

create policy tasks_select_org
  on public.tasks for select
  using (org_id = public.current_org_id() or public.is_platform_admin());

create policy task_attachments_select_org
  on public.task_attachments for select
  using (org_id = public.current_org_id() or public.is_platform_admin());

create policy task_comments_select_org
  on public.task_comments for select
  using (org_id = public.current_org_id() or public.is_platform_admin());

create policy task_activity_select_org
  on public.task_activity for select
  using (org_id = public.current_org_id() or public.is_platform_admin());

create policy task_tags_select_org
  on public.task_tags for select
  using (org_id = public.current_org_id() or public.is_platform_admin());
