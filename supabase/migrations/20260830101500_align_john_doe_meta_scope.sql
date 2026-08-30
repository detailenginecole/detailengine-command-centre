update public.ad_entities
set name = case external_id
  when 'cmp_aug_protection' then 'DetailEngine B2C | August Protection Offers'
  when 'cmp_retarget' then 'DetailEngine B2C | Retargeting | Shop Visitors'
  when 'TEST-META-CAMPAIGN-JOHN-DOE' then 'DetailEngine B2C | John Doe | Ceramic Coating | TEST'
  else name
end,
updated_at = now()
where client_id = (select id from public.clients where slug = 'john-doe-test')
  and entity_type = 'campaign'
  and external_id in ('cmp_aug_protection', 'cmp_retarget', 'TEST-META-CAMPAIGN-JOHN-DOE');

insert into public.reporting_periods (
  client_id,
  label,
  starts_on,
  ends_on,
  status,
  monthly_budget,
  warm_transfer_goal,
  campaign_filter
)
select
  client.id,
  'Cycle 2',
  date '2026-08-10',
  date '2026-09-09',
  'active',
  6000,
  14,
  null
from public.clients client
where client.slug = 'john-doe-test'
  and not exists (
    select 1
    from public.reporting_periods period
    where period.client_id = client.id
      and period.starts_on = date '2026-08-10'
      and period.ends_on = date '2026-09-09'
  );
