create table if not exists public.account_messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  parent_message_id uuid references public.account_messages(id) on delete cascade,
  author_user_id uuid not null references auth.users(id) on delete restrict,
  author_name text not null,
  body text not null check (char_length(body) between 1 and 8000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists account_messages_client_created_idx
  on public.account_messages(client_id, created_at desc);
create index if not exists account_messages_parent_idx
  on public.account_messages(parent_message_id)
  where parent_message_id is not null;

alter table public.account_messages enable row level security;

create policy "Account members can read account messages"
  on public.account_messages for select to authenticated
  using (private.can_access_client(client_id));
create policy "Account members can post account messages"
  on public.account_messages for insert to authenticated
  with check (author_user_id = auth.uid() and private.can_access_client(client_id));

grant select, insert on public.account_messages to authenticated;
grant all on public.account_messages to service_role;

create table if not exists public.account_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  message_id uuid not null references public.account_messages(id) on delete cascade,
  notification_type text not null default 'chat_reply' check (notification_type = 'chat_reply'),
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (recipient_user_id, message_id)
);

create index if not exists account_notifications_recipient_idx
  on public.account_notifications(recipient_user_id, read_at, created_at desc);

alter table public.account_notifications enable row level security;

create policy "Users can read their account notifications"
  on public.account_notifications for select to authenticated
  using (recipient_user_id = auth.uid());
create policy "Users can mark their account notifications read"
  on public.account_notifications for update to authenticated
  using (recipient_user_id = auth.uid())
  with check (recipient_user_id = auth.uid());

grant select, update on public.account_notifications to authenticated;
grant all on public.account_notifications to service_role;

with numbered as (
  select id, row_number() over (partition by client_id order by starts_on, created_at, id) as cycle_number
  from public.reporting_periods
)
update public.reporting_periods rp
set label = 'Cycle ' || numbered.cycle_number
from numbered
where rp.id = numbered.id and rp.label is distinct from 'Cycle ' || numbered.cycle_number;
