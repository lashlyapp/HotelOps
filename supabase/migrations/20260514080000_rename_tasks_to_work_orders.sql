-- Full rename: "task(s)" → "work_order(s)".
--
-- The module that started life as Tasks is being renamed to Work Orders
-- to better match the language hotels actually use (Quore, HotSOS, ALICE
-- all call this "work orders") and to make room for a true generic
-- "tasks" concept later if we ever want one. This migration moves
-- everything user-visible and schema-visible — tables, columns,
-- enums, reference prefixes, R2 path fragments inside the JSON-ish
-- r2_key/poster_key text columns. After this lands, no DB object names
-- the old word at all.

-- ----------------------------------------------------------------------------
-- 1. Tables
-- ----------------------------------------------------------------------------
alter table public.tasks             rename to work_orders;
alter table public.task_attachments  rename to work_order_attachments;
alter table public.task_comments     rename to work_order_comments;
alter table public.task_activity     rename to work_order_activity;
alter table public.task_tags         rename to work_order_tags;

-- ----------------------------------------------------------------------------
-- 2. Foreign-key columns. task_id → work_order_id on every child table.
-- ----------------------------------------------------------------------------
alter table public.work_order_attachments rename column task_id to work_order_id;
alter table public.work_order_comments    rename column task_id to work_order_id;
alter table public.work_order_activity    rename column task_id to work_order_id;
alter table public.work_order_tags        rename column task_id to work_order_id;

-- ----------------------------------------------------------------------------
-- 3. Enums. Renaming a type updates all columns using it automatically.
-- ----------------------------------------------------------------------------
alter type public.task_status              rename to work_order_status;
alter type public.task_priority            rename to work_order_priority;
alter type public.task_category            rename to work_order_category;
alter type public.task_attachment_kind     rename to work_order_attachment_kind;
alter type public.task_attachment_phase    rename to work_order_attachment_phase;

-- ----------------------------------------------------------------------------
-- 4. Indexes. Postgres preserves index names through ALTER TABLE RENAME;
--    rename them explicitly to keep them grep-able alongside their tables.
-- ----------------------------------------------------------------------------
alter index if exists tasks_org_idx                          rename to work_orders_org_idx;
alter index if exists tasks_property_status_idx              rename to work_orders_property_status_idx;
alter index if exists tasks_assignee_idx                     rename to work_orders_assignee_idx;
alter index if exists tasks_org_status_priority_idx          rename to work_orders_org_status_priority_idx;
alter index if exists task_attachments_task_idx              rename to work_order_attachments_work_order_idx;
alter index if exists task_attachments_org_idx               rename to work_order_attachments_org_idx;
alter index if exists task_comments_task_idx                 rename to work_order_comments_work_order_idx;
alter index if exists task_activity_task_idx                 rename to work_order_activity_work_order_idx;
alter index if exists task_tags_task_idx                     rename to work_order_tags_work_order_idx;
alter index if exists task_tags_org_tag_idx                  rename to work_order_tags_org_tag_idx;

-- The work_orders.unique (property_id, reference) constraint also gets
-- a fresh name; existing data passes the constraint either way.
alter table public.work_orders rename constraint tasks_pkey to work_orders_pkey;
alter table public.work_orders rename constraint tasks_property_id_reference_key
  to work_orders_property_id_reference_key;

-- ----------------------------------------------------------------------------
-- 5. RLS policies. Drop and recreate with new names against the new
--    table names. Policy bodies are unchanged — still org-scoped reads.
-- ----------------------------------------------------------------------------
drop policy if exists tasks_select_org             on public.work_orders;
drop policy if exists task_attachments_select_org  on public.work_order_attachments;
drop policy if exists task_comments_select_org     on public.work_order_comments;
drop policy if exists task_activity_select_org     on public.work_order_activity;
drop policy if exists task_tags_select_org         on public.work_order_tags;

create policy work_orders_select_org
  on public.work_orders for select
  using (org_id = public.current_org_id() or public.is_platform_admin());

create policy work_order_attachments_select_org
  on public.work_order_attachments for select
  using (org_id = public.current_org_id() or public.is_platform_admin());

create policy work_order_comments_select_org
  on public.work_order_comments for select
  using (org_id = public.current_org_id() or public.is_platform_admin());

create policy work_order_activity_select_org
  on public.work_order_activity for select
  using (org_id = public.current_org_id() or public.is_platform_admin());

create policy work_order_tags_select_org
  on public.work_order_tags for select
  using (org_id = public.current_org_id() or public.is_platform_admin());

-- ----------------------------------------------------------------------------
-- 6. Data: rewrite TSK- references to WO-, and rewrite r2 paths that
--    embed the old "_tasks/" segment to "_work-orders/" so the storage
--    layout matches the module name. Any existing R2 objects that the
--    operator app uploaded under _tasks/ will need a companion R2-side
--    move; the code change in src/lib/r2/list.ts keeps both prefixes in
--    the /media exclusion list so dormant _tasks/ objects don't bleed
--    into the catalog during the transition.
-- ----------------------------------------------------------------------------
update public.work_orders
   set reference = 'WO-' || substring(reference from 5)
 where reference like 'TSK-%';

update public.work_order_attachments
   set r2_key     = replace(r2_key,     '/_tasks/', '/_work-orders/'),
       poster_key = case
                      when poster_key is null then null
                      else replace(poster_key, '/_tasks/', '/_work-orders/')
                    end
 where r2_key like '%/_tasks/%' or poster_key like '%/_tasks/%';

-- ----------------------------------------------------------------------------
-- 7. Activity rows have a "kind" column referenced by name in code.
--    Nothing schema-level to change, but the values stay consistent
--    (created/assigned/status/priority/attachment/comment/forced_done/
--    deleted) — they're not module-named so the rename is transparent.
-- ----------------------------------------------------------------------------
