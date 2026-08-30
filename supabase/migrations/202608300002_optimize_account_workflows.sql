create index if not exists account_messages_author_idx
  on public.account_messages(author_user_id);
create index if not exists account_notifications_actor_idx
  on public.account_notifications(actor_user_id);
create index if not exists account_notifications_client_idx
  on public.account_notifications(client_id);
create index if not exists account_notifications_message_idx
  on public.account_notifications(message_id);

drop policy if exists "Account members can post account messages" on public.account_messages;
create policy "Account members can post account messages"
  on public.account_messages for insert to authenticated
  with check (author_user_id = (select auth.uid()) and private.can_access_client(client_id));

drop policy if exists "Users can read their account notifications" on public.account_notifications;
create policy "Users can read their account notifications"
  on public.account_notifications for select to authenticated
  using (recipient_user_id = (select auth.uid()));

drop policy if exists "Users can mark their account notifications read" on public.account_notifications;
create policy "Users can mark their account notifications read"
  on public.account_notifications for update to authenticated
  using (recipient_user_id = (select auth.uid()))
  with check (recipient_user_id = (select auth.uid()));
