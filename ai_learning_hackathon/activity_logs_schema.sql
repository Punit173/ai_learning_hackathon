-- Create a table to track user activity/engagement logs
create table public.activity_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  activity_type text not null, -- 'annotation', 'lecture', 'podcast'
  file_name text not null,
  created_at timestamptz default now()
);

-- Enable RLS
alter table public.activity_logs enable row level security;

-- Policies
create policy "Users can insert their own logs"
on public.activity_logs for insert
with check (auth.uid() = user_id);

create policy "Users can view their own logs"
on public.activity_logs for select
using (auth.uid() = user_id);
