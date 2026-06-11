-- Add user_web column to tracking table (migration 07 was run before column was added)
alter table public.encuestas_web_voto_tracking
  add column if not exists user_web text not null default '';
