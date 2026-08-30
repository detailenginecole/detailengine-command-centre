alter table public.reporting_periods
  add column if not exists warm_transfer_goal integer;

update public.reporting_periods as period
set warm_transfer_goal = coalesce((
  select target.warm_transfer_goal
  from public.client_monthly_targets as target
  where target.client_id = period.client_id
  order by abs(target.month_start - period.starts_on)
  limit 1
), 0)
where period.warm_transfer_goal is null;

alter table public.reporting_periods
  alter column warm_transfer_goal set default 0,
  alter column warm_transfer_goal set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'reporting_periods_warm_transfer_goal_nonnegative'
      and conrelid = 'public.reporting_periods'::regclass
  ) then
    alter table public.reporting_periods
      add constraint reporting_periods_warm_transfer_goal_nonnegative
      check (warm_transfer_goal >= 0);
  end if;
end
$$;
