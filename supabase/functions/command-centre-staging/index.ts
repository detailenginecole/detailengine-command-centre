/* eslint-disable @typescript-eslint/no-explicit-any */
const corsHeaders = {
  "Access-Control-Allow-Origin": "https://dashboard.getdetailengine.com",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-detailengine-secret",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const syncSecret = Deno.env.get("DETAILENGINE_SYNC_SECRET") ?? "";
const allowedEmailDomain = (Deno.env.get("DETAILENGINE_ALLOWED_EMAIL_DOMAIN") || "getdetailengine.com").toLowerCase();
type Row = Record<string, any>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
async function rest(path: string) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } });
  if (!response.ok) {
    const detail = await response.text();
    console.error("PostgREST", response.status, detail);
    throw new Error(`Database request failed (${response.status})`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : [];
}
async function allowedUser(request: Request) {
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return null;
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: serviceRoleKey, Authorization: authorization } });
  if (!response.ok) return null;
  const user = await response.json();
  const email = String(user?.email || "").toLowerCase();
  return user?.id && email.endsWith(`@${allowedEmailDomain}`) ? user : null;
}
async function loadBase(url: URL, from?: string, to?: string) {
  const target = new URL(`${supabaseUrl}/functions/v1/command-centre-demo`);
  for (const key of ["slug", "month"]) { const value = url.searchParams.get(key); if (value) target.searchParams.set(key, value); }
  const start = from || url.searchParams.get("from");
  const end = to || url.searchParams.get("to");
  if (start) target.searchParams.set("from", start);
  if (end) target.searchParams.set("to", end);
  const response = await fetch(target, { headers: { "x-detailengine-secret": syncSecret } });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Could not load command centre");
  return payload;
}
const num = (value: unknown) => { const parsed = Number(value || 0); return Number.isFinite(parsed) ? parsed : 0; };
const addDays = (value: string, days: number) => { const date = new Date(`${value}T00:00:00.000Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };
const dayCount = (from: string, to: string) => Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;
const dateOnly = (value: unknown) => String(value || "").slice(0, 10);
const monthStart = (value: string) => `${value.slice(0, 7)}-01`;
const activeMeta = (value: unknown) => String(value || "").toUpperCase() === "ACTIVE";
const campaignBaseline = "detailengine b2c";

function grouped(rows: Row[], key: string) {
  const result = new Map<string, Row[]>();
  for (const row of rows) {
    const value = String(row[key] || "");
    result.set(value, [...(result.get(value) || []), row]);
  }
  return result;
}

function scopeMeta(entities: Row[], filterValue: unknown) {
  const additional = String(filterValue || "").trim().toLowerCase();
  const campaigns = entities.filter((entity) => entity.entity_type === "campaign" && String(entity.name || "").toLowerCase().includes(campaignBaseline) && (!additional || String(entity.name || "").toLowerCase().includes(additional)));
  const campaignExternalIds = new Set(campaigns.map((entity) => String(entity.external_id)));
  const adSets = entities.filter((entity) => entity.entity_type === "ad_set" && campaignExternalIds.has(String(entity.parent_external_id || "")));
  const adSetExternalIds = new Set(adSets.map((entity) => String(entity.external_id)));
  const ads = entities.filter((entity) => entity.entity_type === "ad" && adSetExternalIds.has(String(entity.parent_external_id || "")));
  const adSetByExternal = new Map(adSets.map((entity) => [String(entity.external_id), entity]));
  const liveCampaignIds = new Set(campaigns.filter((entity) => activeMeta(entity.effective_status || entity.status)).map((entity) => String(entity.external_id)));
  const live = ads.some((entity) => {
    if (activeMeta(entity.effective_status || entity.status) === false) return false;
    const adSet = adSetByExternal.get(String(entity.parent_external_id || ""));
    return Boolean(adSet && liveCampaignIds.has(String(adSet.parent_external_id || "")));
  });
  return { campaigns, adSets, ads, entities: [...campaigns, ...adSets, ...ads], campaignExternalIds, live };
}

function aggregateDaily(rows: Row[]) {
  const days = new Map<string, Row>();
  for (const row of rows) {
    const date = dateOnly(row.metric_date);
    if (!date) continue;
    const current = days.get(date) || { metric_date: date, spend: 0, impressions: 0, clicks: 0, outbound_clicks: 0, leads: 0, qualified_leads: 0, unqualified_leads: 0, warm_transfers: 0, _frequency_weight: 0 };
    for (const key of ["spend", "impressions", "clicks", "outbound_clicks", "leads", "qualified_leads", "unqualified_leads", "warm_transfers"]) current[key] += num(row[key]);
    current._frequency_weight += num(row.frequency) * num(row.impressions);
    days.set(date, current);
  }
  return [...days.values()].sort((a, b) => String(a.metric_date).localeCompare(String(b.metric_date))).map((row) => ({
    ...row,
    frequency: row.impressions > 0 ? row._frequency_weight / row.impressions : null,
    link_ctr: row.impressions > 0 ? row.clicks / row.impressions * 100 : null,
    link_cpc: row.clicks > 0 ? row.spend / row.clicks : null,
    cpm: row.impressions > 0 ? row.spend / row.impressions * 1000 : null,
  }));
}

function aggregatePerformance(leads: Row[], outcomes: Row[], adMetrics: Row[], terms: Row[], range: { from: string; to: string }) {
  const qualified = leads.filter((lead) => Boolean(lead.qualified_at) || ["qualified", "yes", "true"].includes(String(lead.qualification_status || "").toLowerCase()));
  const unqualified = leads.filter((lead) => Boolean(lead.disqualified_at) || ["unqualified", "disqualified", "not_qualified"].includes(String(lead.qualification_status || "").toLowerCase()));
  const spend = adMetrics.reduce((sum, row) => sum + num(row.spend), 0);
  const impressions = adMetrics.reduce((sum, row) => sum + num(row.impressions), 0);
  const clicks = adMetrics.reduce((sum, row) => sum + num(row.clicks), 0);
  const metaLeads = adMetrics.reduce((sum, row) => sum + num(row.leads), 0);
  const collected = outcomes.reduce((sum, row) => sum + num(row.collected_revenue), 0);
  const retainer = terms.reduce((sum, row) => sum + num(row.retainer_amount), 0);
  const investment = spend + retainer;
  const frequencyWeight = adMetrics.reduce((sum, row) => sum + num(row.frequency) * num(row.impressions), 0);
  const speedRows = leads.map((lead) => num(lead.speed_to_lead_minutes)).filter((value) => value > 0);
  return {
    range_start: range.from,
    range_end: range.to,
    month_start: monthStart(range.from),
    month_end: range.to,
    total_leads: leads.length,
    qualified_leads: qualified.length,
    unqualified_leads: unqualified.length,
    warm_transfers: outcomes.length,
    awaiting_feedback: outcomes.filter((row) => row.status === "awaiting_feedback").length,
    in_sales_process: outcomes.filter((row) => row.status === "sales_process").length,
    pending_payment: outcomes.filter((row) => row.status === "pending_payment").length,
    closed_transfers: outcomes.filter((row) => row.status === "closed").length,
    lost_transfers: outcomes.filter((row) => row.status === "lost").length,
    collected_revenue: collected,
    actual_ad_spend: spend,
    retainer_amount: retainer,
    total_investment: investment,
    roi_dollars: collected - investment,
    roi_percent: investment > 0 ? (collected - investment) / investment * 100 : null,
    impressions,
    clicks,
    meta_leads: metaLeads,
    ctr_percent: impressions > 0 ? clicks / impressions * 100 : null,
    cpc: clicks > 0 ? spend / clicks : null,
    cpm: impressions > 0 ? spend / impressions * 1000 : null,
    frequency: impressions > 0 ? frequencyWeight / impressions : null,
    cost_per_lead: leads.length > 0 ? spend / leads.length : null,
    cost_per_qualified_lead: qualified.length > 0 ? spend / qualified.length : null,
    cost_per_transfer: outcomes.length > 0 ? spend / outcomes.length : null,
    qualification_rate: leads.length > 0 ? qualified.length / leads.length * 100 : null,
    transfer_rate: qualified.length > 0 ? outcomes.length / qualified.length * 100 : null,
    feedback_resolution_rate: outcomes.length > 0 ? outcomes.filter((row) => ["closed", "lost"].includes(row.status)).length / outcomes.length * 100 : null,
    average_speed_to_lead_minutes: speedRows.length ? speedRows.reduce((sum, value) => sum + value, 0) / speedRows.length : null,
  };
}

function aggregateEntities(entities: Row[], metricRows: Row[]) {
  const metricsByEntity = grouped(metricRows, "ad_entity_id");
  return entities.map((entity) => {
    const rows = metricsByEntity.get(String(entity.id)) || [];
    const daily = aggregateDaily(rows);
    const spend = daily.reduce((sum, row) => sum + num(row.spend), 0);
    const impressions = daily.reduce((sum, row) => sum + num(row.impressions), 0);
    const clicks = daily.reduce((sum, row) => sum + num(row.clicks), 0);
    const leads = daily.reduce((sum, row) => sum + num(row.leads), 0);
    const qualified = daily.reduce((sum, row) => sum + num(row.qualified_leads), 0);
    const unqualified = daily.reduce((sum, row) => sum + num(row.unqualified_leads), 0);
    const transfers = daily.reduce((sum, row) => sum + num(row.warm_transfers), 0);
    const frequencyWeight = daily.reduce((sum, row) => sum + num(row.frequency) * num(row.impressions), 0);
    return { ad_entity_id: entity.id, external_id: entity.external_id, entity_type: entity.entity_type, parent_external_id: entity.parent_external_id, name: entity.name, status: entity.status, effective_status: entity.effective_status, spend, impressions, clicks, leads, qualified_leads: qualified, unqualified_leads: unqualified, warm_transfers: transfers, ctr_percent: impressions > 0 ? clicks / impressions * 100 : null, cpc: clicks > 0 ? spend / clicks : null, cpm: impressions > 0 ? spend / impressions * 1000 : null, frequency: impressions > 0 ? frequencyWeight / impressions : null, cost_per_lead: leads > 0 ? spend / leads : null, cost_per_qualified_lead: qualified > 0 ? spend / qualified : null, cost_per_transfer: transfers > 0 ? spend / transfers : null };
  });
}

function scopeDetail(base: Row, cycle: Row | null) {
  const scope = scopeMeta(base.ad_entities || [], cycle?.campaign_filter);
  const allowedEntityIds = new Set(scope.entities.map((entity: Row) => String(entity.id)));
  const campaignEntityIds = new Set(scope.campaigns.map((entity: Row) => String(entity.id)));
  const scopedEntityMetrics = (base.ad_entity_daily_metrics || []).filter((row: Row) => allowedEntityIds.has(String(row.ad_entity_id)));
  const campaignMetrics = scopedEntityMetrics.filter((row: Row) => campaignEntityIds.has(String(row.ad_entity_id)));
  const scopedLeads = (base.leads || []).filter((lead: Row) => scope.campaignExternalIds.has(String(lead.campaign_external_id || "")));
  const outcomes = scopedLeads.map((lead: Row) => lead.outcome).filter(Boolean);
  const performance = aggregatePerformance(scopedLeads, outcomes, campaignMetrics, [{ retainer_amount: num(base.performance?.retainer_amount) }], { from: base.range.start, to: base.range.end });
  return {
    ...base,
    performance,
    leads: scopedLeads,
    ad_entities: scope.entities,
    ad_entity_daily_metrics: scopedEntityMetrics,
    ad_entity_performance: aggregateEntities(scope.entities, scopedEntityMetrics),
    ad_metrics: aggregateDaily(campaignMetrics),
    meta_scope: {
      live: scope.live,
      matching_campaigns: scope.campaigns.length,
      matching_ads: scope.ads.length,
      required_campaign_name: "DetailEngine B2C",
      campaign_filter: cycle?.campaign_filter || null,
    },
  };
}

function selectedCurrentCycle(cycles: Row[], today: string) {
  return cycles.find((cycle) => cycle.starts_on <= today && cycle.ends_on >= today) || cycles.at(-1) || null;
}

async function loadWorkspaceSnapshots(workspaceClients: Row[], requestUrl: URL) {
  const today = new Date().toISOString().slice(0, 10);
  const [databaseClients, allCycles] = await Promise.all([
    rest("clients?select=id,slug,lifecycle_status,onboarding_date,launch_date,created_at"),
    rest("reporting_periods?select=*&order=starts_on.asc"),
  ]);
  const databaseById = new Map(databaseClients.map((client: Row) => [String(client.id), client]));
  const cyclesByClient = grouped(allCycles, "client_id");

  return Promise.all(workspaceClients.map(async (workspaceClient: Row) => {
    try {
      const clientCycles = (cyclesByClient.get(String(workspaceClient.id)) || []).map((cycle: Row, index: number) => ({ ...cycle, label: `Cycle ${index + 1}` }));
      const cycle = selectedCurrentCycle(clientCycles, today);
      const effectiveEnd = cycle ? (cycle.ends_on < today ? cycle.ends_on : today < cycle.starts_on ? cycle.starts_on : today) : today;
      const detailUrl = new URL(requestUrl);
      detailUrl.searchParams.set("slug", workspaceClient.slug);
      detailUrl.searchParams.delete("cycle_id");
      detailUrl.searchParams.delete("from");
      detailUrl.searchParams.delete("to");
      let detail = await loadBase(detailUrl, cycle?.starts_on, effectiveEnd);
      if (cycle) detail = { ...detail, monthly_target: { ...(detail.monthly_target || {}), planned_ad_spend: num(cycle.monthly_budget), warm_transfer_goal: num(cycle.warm_transfer_goal) } };
      detail = scopeDetail(detail, cycle);
      const hp = healthProjection(detail, cycle);
      const databaseClient = databaseById.get(String(workspaceClient.id)) || {};
      const preserveLifecycle = ["churned", "archived"].includes(String(databaseClient.lifecycle_status || ""));
      const campaignIds = detail.ad_entities.filter((entity: Row) => entity.entity_type === "campaign").map((entity: Row) => String(entity.id));
      let lastLiveDate: string | null = null;
      if (campaignIds.length) {
        const latestSpend = await rest(`ad_entity_metrics_daily?select=metric_date&ad_entity_id=in.(${campaignIds.map(encodeURIComponent).join(",")})&spend=gt.0&order=metric_date.desc&limit=1`);
        lastLiveDate = dateOnly(latestSpend[0]?.metric_date) || null;
      }
      const launchDate = dateOnly(databaseClient.launch_date) || lastLiveDate;
      const lifecycle = preserveLifecycle ? databaseClient.lifecycle_status : detail.meta_scope.live ? "live" : launchDate ? "paused" : "onboarding";
      const pausedDays = lifecycle === "paused" && launchDate ? Math.max(0, dayCount(lastLiveDate || launchDate, today) - 1) : null;
      const cycleDays = cycle ? dayCount(cycle.starts_on, cycle.ends_on) : detail.range.days;
      const cycleDay = cycle ? Math.max(1, Math.min(cycleDays, dayCount(cycle.starts_on, effectiveEnd))) : detail.range.days;
      const onboardingStart = dateOnly(databaseClient.onboarding_date) || dateOnly(databaseClient.created_at) || today;
      return {
        ...workspaceClient,
        lifecycle_status: lifecycle,
        performance: detail.performance,
        target: detail.monthly_target,
        projected_transfers: hp.projected_total_transfers ?? detail.performance.warm_transfers,
        hp_score: hp.score,
        hp_projection: hp,
        cycle,
        cycle_day: cycleDay,
        cycle_days: cycleDays,
        paused_days: pausedDays,
        last_live_date: lastLiveDate,
        onboarding_days: lifecycle === "onboarding" ? Math.max(0, dayCount(onboardingStart, today) - 1) : null,
        meta_status: detail.meta_scope,
      };
    } catch (error) {
      console.error("workspace snapshot", workspaceClient.slug, error);
      return workspaceClient;
    }
  }));
}

function healthProjection(base: Row, cycle: Row | null) {
  const cycleStart = cycle?.starts_on || base.range.start;
  const cycleEnd = base.range.end;
  const cutoff = addDays(cycleEnd, -3) < cycleStart ? cycleStart : addDays(cycleEnd, -3);
  const recentSpend = (base.ad_metrics || []).filter((row: Row) => row.metric_date >= cutoff && row.metric_date <= cycleEnd).reduce((sum: number, row: Row) => sum + num(row.spend), 0);
  const recentTransfers = (base.leads || []).filter((lead: Row) => { const date = lead.outcome?.transferred_at?.slice(0, 10); return date && date >= cutoff && date <= cycleEnd; }).length;
  const spendToDate = num(base.performance?.actual_ad_spend);
  const transfersToDate = num(base.performance?.warm_transfers);
  const goal = num(cycle?.warm_transfer_goal || base.monthly_target?.warm_transfer_goal);
  const budget = num(cycle?.monthly_budget || base.monthly_target?.planned_ad_spend);
  const remainingBudget = Math.max(0, budget - spendToDate);
  const recentCpt = recentTransfers > 0 ? recentSpend / recentTransfers : null;
  const cycleDay = Math.max(1, dayCount(cycleStart, cycleEnd));
  const warnings: string[] = [];
  if (cycleDay <= 3) warnings.push("HP is provisional until four cycle days are available.");
  if (goal <= 0) warnings.push("Warm-transfer goal is missing.");
  if (budget <= 0) warnings.push("Cycle budget is missing.");
  if (spendToDate <= 0) warnings.push("No cycle spend has been recorded.");
  if (recentSpend > 0 && recentTransfers === 0) warnings.push("The rolling four-day window has spend but no transfers.");
  const unavailable = goal <= 0 || budget <= 0 || spendToDate <= 0;
  const projectedAdditional = unavailable ? null : recentCpt && recentCpt > 0 ? remainingBudget / recentCpt : 0;
  const projectedTotal = projectedAdditional == null ? null : transfersToDate + projectedAdditional;
  const goalPercent = projectedTotal == null ? null : projectedTotal / goal * 100;
  return { score: unavailable ? null : transfersToDate >= goal ? 100 : Math.max(0, Math.min(100, Math.round(goalPercent || 0))), goal_percent: goalPercent, recent_cpt: recentCpt, recent_spend: recentSpend, recent_transfers: recentTransfers, projected_additional_transfers: projectedAdditional, projected_total_transfers: projectedTotal, remaining_budget: remainingBudget, provisional: cycleDay <= 3, window: { start: cutoff, end: cycleEnd }, warnings };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
  const user = await allowedUser(request);
  if (!user) return json({ error: "Unauthorized" }, 401);
  try {
    const requestUrl = new URL(request.url);
    let base = await loadBase(requestUrl);
    const clientId = encodeURIComponent(base.client.id);
    const rawCycles = await rest(`reporting_periods?select=*&client_id=eq.${clientId}&order=starts_on.asc`);
    const cycles = rawCycles.map((cycle: Row, index: number) => ({ ...cycle, label: `Cycle ${index + 1}` }));
    const requestedCycle = cycles.find((cycle: Row) => cycle.id === requestUrl.searchParams.get("cycle_id"));
    let selectedCycle = requestedCycle || cycles.find((cycle: Row) => cycle.starts_on <= base.range.end && cycle.ends_on >= base.range.start) || cycles.at(-1) || null;
    if (selectedCycle && (requestedCycle || (!requestUrl.searchParams.get("from") && !requestUrl.searchParams.get("to")))) {
      const today = new Date().toISOString().slice(0, 10);
      const effectiveEnd = selectedCycle.ends_on < today ? selectedCycle.ends_on : today < selectedCycle.starts_on ? selectedCycle.starts_on : today;
      base = await loadBase(requestUrl, selectedCycle.starts_on, effectiveEnd);
    }
    selectedCycle = cycles.find((cycle: Row) => cycle.id === selectedCycle?.id) || null;
    if (selectedCycle) {
      base = { ...base, monthly_target: { ...(base.monthly_target || {}), planned_ad_spend: num(selectedCycle.monthly_budget), warm_transfer_goal: num(selectedCycle.warm_transfer_goal) } };
    }
    base = scopeDetail(base, selectedCycle);
    const workspaceClients = await loadWorkspaceSnapshots(base.workspace?.clients || [], requestUrl);
    const selectedWorkspaceClient = workspaceClients.find((client: Row) => client.id === base.client.id);
    base = {
      ...base,
      client: {
        ...base.client,
        lifecycle_status: selectedWorkspaceClient?.lifecycle_status || base.client.lifecycle_status,
      },
      workspace: {
        ...base.workspace,
        clients: workspaceClients,
      },
    };
    const [rawIntegrations, notes, onboardingRuns, onboardingSteps, messages, notifications] = await Promise.all([
      rest(`client_integrations?select=id,provider,display_name,external_account_id,status,is_primary,last_synced_at,verified_at,last_error,updated_at,secret_ref&client_id=eq.${clientId}&order=provider.asc`),
      rest(`client_notes?select=id,category,body,created_by,created_at,updated_at&client_id=eq.${clientId}&order=created_at.desc&limit=150`),
      rest(`onboarding_runs?select=*&client_id=eq.${clientId}&order=created_at.desc&limit=5`),
      rest(`onboarding_steps?select=*&client_id=eq.${clientId}&order=position.asc`),
      rest(`account_messages?select=*&client_id=eq.${clientId}&order=created_at.asc&limit=300`),
      rest(`account_notifications?select=*&recipient_user_id=eq.${encodeURIComponent(user.id)}&order=created_at.desc&limit=80`),
    ]);
    const integrations = rawIntegrations.map(({ secret_ref, ...item }: Row) => ({ ...item, has_secret: Boolean(secret_ref) }));
    const messageById = new Map(messages.map((message: Row) => [message.id, message]));
    const chatMessages = messages.map((message: Row) => ({ ...message, parent: message.parent_message_id ? messageById.get(message.parent_message_id) || null : null, mine: message.author_user_id === user.id }));
    const clientById = new Map((base.workspace?.clients || []).map((client: Row) => [client.id, client]));
    const notificationRows = notifications.map((notification: Row) => ({ ...notification, client: clientById.get(notification.client_id) || null }));
    const hp = healthProjection(base, selectedCycle);
    const quality = base.operations?.data_quality || {};
    const warnings = [
      ...integrations.filter((item: Row) => !["connected", "disabled"].includes(String(item.status || ""))).map((item: Row) => ({ key: `integration-${item.provider}`, source: item.provider, severity: item.status === "error" ? "critical" : "warning", message: item.last_error || `${String(item.provider).toUpperCase()} is ${item.status || "not connected"}.` })),
      ...(num(quality.leads_without_campaign) > 0 ? [{ key: "lead-campaign", source: "lead_data", severity: "warning", message: `${quality.leads_without_campaign} leads are missing campaign attribution.` }] : []),
      ...(num(quality.leads_without_ad) > 0 ? [{ key: "lead-ad", source: "lead_data", severity: "warning", message: `${quality.leads_without_ad} leads are missing ad attribution.` }] : []),
      ...hp.warnings.map((message: string, index: number) => ({ key: `hp-${index}`, source: "hp", severity: "warning", message })),
    ];
    const cycleWarnings = [
      ...(selectedCycle?.status && selectedCycle.status !== "active" ? [`Cycle is ${selectedCycle.status}.`] : []),
      ...(selectedCycle?.ends_on && selectedCycle.ends_on < new Date().toISOString().slice(0, 10) ? ["Cycle has ended."] : []),
      ...(hp.remaining_budget === 0 ? ["Cycle budget is fully spent."] : []),
      ...hp.warnings,
    ];
    const aliases = notes.filter((note: Row) => note.category === "account_alias").map((note: Row) => ({ id: note.id, name: note.body, created_at: note.created_at }));
    const activity = notes.filter((note: Row) => !["account_alias", "internal_chat"].includes(note.category));
    const selected = base.workspace?.clients?.find((row: Row) => row.id === base.client.id);
    if (selected) { selected.hp_score = hp.score; selected.projected_transfers = hp.projected_total_transfers ?? selected.projected_transfers; selected.hp_projection = hp; }
    return json({ ...base, client: { ...base.client, integrations }, operations: { ...base.operations, notes: activity }, account_chat: { messages: chatMessages }, notifications: notificationRows, account_status: { cycle: selectedCycle, cycles: [...cycles].reverse(), cycle_day: selectedCycle ? Math.max(1, dayCount(selectedCycle.starts_on, base.range.end)) : base.range.days, cycle_days: selectedCycle ? dayCount(selectedCycle.starts_on, selectedCycle.ends_on) : base.range.days, cycle_warnings: [...new Set(cycleWarnings)], hp, warnings, aliases, integrations, onboarding: { runs: onboardingRuns, steps: onboardingSteps }, meta_status: base.meta_scope } });
  } catch (error) {
    console.error("command-centre", error);
    return json({ error: error instanceof Error ? error.message : "Could not load command centre" }, 500);
  }
});
