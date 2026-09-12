/* eslint-disable @typescript-eslint/no-explicit-any */
import {selectClient} from "../../../app/lib/client-identity.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-detailengine-secret",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const syncSecret = Deno.env.get("DETAILENGINE_SYNC_SECRET") ?? "";

type Row = Record<string, any>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

async function rest(path: string) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  });
  if (!response.ok) {
    const detail = await response.text();
    console.error("PostgREST", response.status, detail);
    throw new Error(`Database request failed (${response.status})`);
  }
  return await response.json();
}

function isoDate(value: string | null) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || "") ? value! : null;
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function monthStart(value: string) {
  return `${value.slice(0, 7)}-01`;
}

function monthEnd(value: string) {
  const date = new Date(`${monthStart(value)}T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCDate(0);
  return date.toISOString().slice(0, 10);
}

function rangeFromUrl(url: URL) {
  const month = /^\d{4}-\d{2}$/.test(url.searchParams.get("month") || "")
    ? url.searchParams.get("month")!
    : null;
  const today = new Date().toISOString().slice(0, 10);
  const fallbackFrom = month ? `${month}-01` : monthStart(today);
  const fallbackTo = month ? monthEnd(fallbackFrom) : today;
  const from = isoDate(url.searchParams.get("from")) || fallbackFrom;
  const to = isoDate(url.searchParams.get("to")) || fallbackTo;
  if (from > to) throw new Error("Start date must be before end date");
  const days = Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;
  if (days > 366) throw new Error("Date range cannot exceed 366 days");
  return { from, to, next: addDays(to, 1), days };
}

function num(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function groupBy<T extends Row>(rows: T[], key: keyof T) {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const value = String(row[key] || "");
    grouped.set(value, [...(grouped.get(value) || []), row]);
  }
  return grouped;
}

function aggregatePerformance(
  leads: Row[],
  outcomes: Row[],
  adMetrics: Row[],
  terms: Row[],
  range: { from: string; to: string },
) {
  const qualified = leads.filter((lead) => Boolean(lead.qualified_at) || ["qualified", "yes", "true"].includes(String(lead.qualification_status || "").toLowerCase()));
  const unqualified = leads.filter((lead) => Boolean(lead.disqualified_at) || ["unqualified", "disqualified", "not_qualified"].includes(String(lead.qualification_status || "").toLowerCase()));
  const transferred = outcomes.length;
  const spend = adMetrics.reduce((sum, row) => sum + num(row.spend), 0);
  const impressions = adMetrics.reduce((sum, row) => sum + num(row.impressions), 0);
  const clicks = adMetrics.reduce((sum, row) => sum + num(row.clicks), 0);
  const metaLeads = adMetrics.reduce((sum, row) => sum + num(row.leads), 0);
  const collected = outcomes.reduce((sum, row) => sum + num(row.collected_revenue), 0);
  const retainer = terms.reduce((sum, row) => sum + num(row.retainer_amount), 0);
  const investment = spend + retainer;
  const roiDollars = collected - investment;
  const speedRows = leads.map((lead) => num(lead.speed_to_lead_minutes)).filter((value) => value > 0);
  return {
    range_start: range.from,
    range_end: range.to,
    month_start: monthStart(range.from),
    month_end: monthEnd(range.from),
    total_leads: leads.length,
    qualified_leads: qualified.length,
    unqualified_leads: unqualified.length,
    warm_transfers: transferred,
    awaiting_feedback: outcomes.filter((row) => row.status === "awaiting_feedback").length,
    in_sales_process: outcomes.filter((row) => row.status === "sales_process").length,
    pending_payment: outcomes.filter((row) => row.status === "pending_payment").length,
    closed_transfers: outcomes.filter((row) => row.status === "closed").length,
    lost_transfers: outcomes.filter((row) => row.status === "lost").length,
    collected_revenue: collected,
    actual_ad_spend: spend,
    retainer_amount: retainer,
    total_investment: investment,
    roi_dollars: roiDollars,
    roi_percent: investment > 0 ? roiDollars / investment * 100 : null,
    impressions,
    clicks,
    meta_leads: metaLeads,
    ctr_percent: impressions > 0 ? clicks / impressions * 100 : null,
    cpc: clicks > 0 ? spend / clicks : null,
    cpm: impressions > 0 ? spend / impressions * 1000 : null,
    frequency: adMetrics.length ? adMetrics.reduce((sum, row) => sum + num(row.frequency), 0) / adMetrics.length : null,
    cost_per_lead: leads.length > 0 ? spend / leads.length : null,
    cost_per_qualified_lead: qualified.length > 0 ? spend / qualified.length : null,
    cost_per_transfer: transferred > 0 ? spend / transferred : null,
    qualification_rate: leads.length > 0 ? qualified.length / leads.length * 100 : null,
    transfer_rate: qualified.length > 0 ? transferred / qualified.length * 100 : null,
    feedback_resolution_rate: transferred > 0 ? outcomes.filter((row) => ["closed", "lost"].includes(row.status)).length / transferred * 100 : null,
    average_speed_to_lead_minutes: speedRows.length ? speedRows.reduce((sum, value) => sum + value, 0) / speedRows.length : null,
  };
}

function performanceHealthScore(performance: Row, target: Row | null, rangeEnd: string) {
  const transferGoal = num(target?.warm_transfer_goal);
  if (!transferGoal) return null;
  const monthDays = Number(monthEnd(rangeEnd).slice(8, 10));
  const expectedTransfers = transferGoal * Math.min(5, monthDays) / monthDays;
  const paceRatio = expectedTransfers > 0 ? Math.min(num(performance.warm_transfers) / expectedTransfers, 1.2) : 0;
  const paceScore = Math.min(90, Math.round(paceRatio * 90));
  let supportingScore = 0;
  let supportingMax = 0;
  const transferCostGoal = num(target?.target_cost_per_transfer);
  const transferCost = num(performance.cost_per_transfer);
  if (transferCostGoal > 0 && transferCost > 0) {
    supportingMax += 4;
    const ratio = transferCost / transferCostGoal;
    if (ratio <= .85) supportingScore += 4;
    else if (ratio <= 1) supportingScore += 3;
    else if (ratio <= 1.2) supportingScore += 2;
    else if (ratio <= 1.5) supportingScore += 1;
  }
  if (performance.qualification_rate !== null) {
    supportingMax += 2;
    if (performance.qualification_rate >= 45) supportingScore += 2;
    else if (performance.qualification_rate >= 30) supportingScore += 1;
  }
  if (performance.ctr_percent !== null) {
    supportingMax += 2;
    if (performance.ctr_percent >= 1.2) supportingScore += 2;
    else if (performance.ctr_percent >= .8) supportingScore += 1;
  }
  if (performance.frequency !== null) {
    supportingMax += 2;
    if (performance.frequency <= 2) supportingScore += 2;
    else if (performance.frequency <= 2.5) supportingScore += 1;
  }
  const supportingFinal = supportingMax > 0 ? Math.round(supportingScore / supportingMax * 10) : 5;
  return Math.min(100, paceScore + supportingFinal);
}

function fatigueScore(performance: Row) {
  const frequency = performance.frequency == null ? null : num(performance.frequency);
  const ctr = performance.ctr_percent == null ? null : num(performance.ctr_percent);
  if (frequency === null && ctr === null) return null;
  const frequencyRisk = frequency === null ? 50 : Math.max(0, Math.min(100, (frequency - 1.8) / 1.7 * 100));
  const ctrRisk = ctr === null ? 50 : Math.max(0, Math.min(100, (1.5 - ctr) * 100));
  return Math.round((frequencyRisk + ctrRisk) / 2);
}

function aggregateEntities(entities: Row[], metricRows: Row[]) {
  const byEntity = groupBy<Row>(metricRows, "ad_entity_id");
  return entities.map((entity) => {
    const rows = byEntity.get(String(entity.id)) || [];
    const spend = rows.reduce((sum, row) => sum + num(row.spend), 0);
    const impressions = rows.reduce((sum, row) => sum + num(row.impressions), 0);
    const clicks = rows.reduce((sum, row) => sum + num(row.clicks), 0);
    const leads = rows.reduce((sum, row) => sum + num(row.leads), 0);
    const qualified = rows.reduce((sum, row) => sum + num(row.qualified_leads), 0);
    const unqualified = rows.reduce((sum, row) => sum + num(row.unqualified_leads), 0);
    const transfers = rows.reduce((sum, row) => sum + num(row.warm_transfers), 0);
    return {
      ad_entity_id: entity.id,
      external_id: entity.external_id,
      entity_type: entity.entity_type,
      parent_external_id: entity.parent_external_id,
      name: entity.name,
      status: entity.status,
      effective_status: entity.effective_status,
      spend,
      impressions,
      clicks,
      leads,
      qualified_leads: qualified,
      unqualified_leads: unqualified,
      warm_transfers: transfers,
      ctr_percent: impressions > 0 ? clicks / impressions * 100 : null,
      cpc: clicks > 0 ? spend / clicks : null,
      cpm: impressions > 0 ? spend / impressions * 1000 : null,
      frequency: rows.length ? rows.reduce((sum, row) => sum + num(row.frequency), 0) / rows.length : null,
      cost_per_lead: leads > 0 ? spend / leads : null,
      cost_per_qualified_lead: qualified > 0 ? spend / qualified : null,
      cost_per_transfer: transfers > 0 ? spend / transfers : null,
    };
  });
}

async function authUsers(assignments: Row[]): Promise<Map<string, Row>> {
  if (!assignments.length) return new Map<string, Row>();
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users?page=1&per_page=1000`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  });
  if (!response.ok) return new Map<string, Row>();
  const payload = await response.json();
  const users = Array.isArray(payload) ? payload : payload.users || [];
  return new Map<string, Row>(users.map((user: Row): [string, Row] => [String(user.id), user]));
}

function ownerName(user: Row | undefined) {
  if (!user) return "Unassigned";
  return user.user_metadata?.full_name || user.user_metadata?.name || user.email || "Assigned";
}

function freshness(rows: Row[]) {
  const timestamps = rows
    .flatMap((row) => [row.last_synced_at, row.updated_at, row.created_at])
    .filter(Boolean)
    .map((value) => Date.parse(String(value)))
    .filter(Number.isFinite);
  if (!timestamps.length) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}

function aggregateWorkspaceDaily(leads: Row[], outcomes: Row[], adMetrics: Row[]) {
  const days = new Map<string, Row>();
  const day = (value: string) => String(value || "").slice(0, 10);
  const ensure = (date: string) => {
    if (!days.has(date)) days.set(date, { metric_date: date, spend: 0, impressions: 0, clicks: 0, leads: 0, qualified: 0, unqualified: 0, transfers: 0, revenue: 0 });
    return days.get(date)!;
  };
  for (const row of adMetrics) {
    const target = ensure(day(row.metric_date));
    for (const key of ["spend", "impressions", "clicks"]) target[key] += num(row[key]);
  }
  for (const row of leads) {
    const target = ensure(day(row.submitted_at));
    target.leads += 1;
    const status = String(row.qualification_status || "").toLowerCase();
    if (row.qualified_at || ["qualified", "yes", "true"].includes(status)) target.qualified += 1;
    if (row.disqualified_at || ["unqualified", "disqualified", "not_qualified"].includes(status)) target.unqualified += 1;
  }
  for (const row of outcomes) {
    const target = ensure(day(row.transferred_at));
    target.transfers += 1;
    target.revenue += num(row.collected_revenue);
  }
  return [...days.values()].sort((a, b) => String(a.metric_date).localeCompare(String(b.metric_date)));
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);

  try {
    const requestUrl = new URL(request.url);
    const range = rangeFromUrl(requestUrl);
    const hasWorkspaceAccess = Boolean(syncSecret) && request.headers.get("x-detailengine-secret") === syncSecret;
    if (!hasWorkspaceAccess) return json({error: "Unauthorized"}, 401);
    const clientRows = await rest("client_command_centre?select=*&order=display_name.asc");
    const allClients = clientRows;
    if (!allClients.length) return json({ error: "No clients are available" }, 404);
    const client = selectClient<Row & {id:string;slug:string}>(allClients, {id:requestUrl.searchParams.get("client_id") ?? undefined, slug:requestUrl.searchParams.get("slug") ?? undefined});
    if (!client) return json({ error: "Account not found" }, 404);
    const clientId = encodeURIComponent(client.id);
    const fromMonth = monthStart(range.from);
    const toMonth = monthStart(range.to);
    const recentFrom = addDays(range.to, -4);
    const workspaceFrom = recentFrom < range.from ? recentFrom : range.from;

    const [workspaceLeads, workspaceOutcomes, workspaceAds, workspaceTerms, workspaceTargets, assignments, integrations, latestReports] = await Promise.all([
      rest(`leads?select=client_id,qualification_status,qualified_at,disqualified_at,transferred_at,speed_to_lead_minutes,submitted_at&submitted_at=gte.${workspaceFrom}&submitted_at=lt.${range.next}`),
      rest(`warm_transfer_outcomes?select=client_id,status,collected_revenue,transferred_at,updated_at&transferred_at=gte.${workspaceFrom}&transferred_at=lt.${range.next}`),
      rest(`ad_metrics_daily?select=client_id,metric_date,spend,impressions,clicks,leads,frequency&metric_date=gte.${workspaceFrom}&metric_date=lt.${range.next}`),
      rest(`client_monthly_terms?select=client_id,month_start,retainer_amount&month_start=gte.${fromMonth}&month_start=lte.${toMonth}`),
      rest(`client_monthly_targets?select=*&month_start=eq.${monthStart(range.to)}`),
      rest("team_assignments?select=client_id,user_id,assignment_role,starts_on,ends_on"),
      rest("client_integrations?select=client_id,provider,status,last_synced_at,last_error"),
      rest(`daily_client_reports?select=client_id,report_date,health_status,headline,alerts&order=report_date.desc&limit=${Math.max(allClients.length * 5, 25)}`),
    ]);

    const users = await authUsers(assignments);
    const leadGroups = groupBy<Row>(workspaceLeads, "client_id");
    const outcomeGroups = groupBy<Row>(workspaceOutcomes, "client_id");
    const adGroups = groupBy<Row>(workspaceAds, "client_id");
    const termGroups = groupBy<Row>(workspaceTerms, "client_id");
    const targetGroups = groupBy<Row>(workspaceTargets, "client_id");
    const assignmentGroups = groupBy<Row>(assignments, "client_id");
    const integrationGroups = groupBy<Row>(integrations, "client_id");
    const reportGroups = groupBy<Row>(latestReports, "client_id");

    const workspaceClients = allClients.map((account: Row) => {
      const id = String(account.id);
      const accountLeads = leadGroups.get(id) || [];
      const accountOutcomes = outcomeGroups.get(id) || [];
      const accountAds = adGroups.get(id) || [];
      const performance = aggregatePerformance(
        accountLeads.filter((row) => String(row.submitted_at || "").slice(0, 10) >= range.from),
        accountOutcomes.filter((row) => String(row.transferred_at || "").slice(0, 10) >= range.from),
        accountAds.filter((row) => String(row.metric_date || "").slice(0, 10) >= range.from),
        termGroups.get(id) || [],
        range,
      );
      const accountAssignments = assignmentGroups.get(id) || [];
      const csmAssignment = accountAssignments.find((row) => row.assignment_role === "csm");
      const buyerAssignment = accountAssignments.find((row) => ["media_buyer", "buyer"].includes(row.assignment_role));
      const accountIntegrations = integrationGroups.get(id) || [];
      const latestReport = (reportGroups.get(id) || [])[0] || null;
      const target = (targetGroups.get(id) || [])[0] || null;
      const recentRange = { from: recentFrom, to: range.to };
      const recentPerformance = aggregatePerformance(
        accountLeads.filter((row) => String(row.submitted_at || "").slice(0, 10) >= recentFrom),
        accountOutcomes.filter((row) => String(row.transferred_at || "").slice(0, 10) >= recentFrom),
        accountAds.filter((row) => String(row.metric_date || "").slice(0, 10) >= recentFrom),
        [],
        recentRange,
      );
      const hpScore = performanceHealthScore(recentPerformance, target, range.to);
      const elapsed = range.days;
      const fullPeriodDays = Math.floor((Date.parse(`${monthEnd(range.to)}T00:00:00Z`) - Date.parse(`${monthStart(range.to)}T00:00:00Z`)) / 86400000) + 1;
      const projectedTransfers = elapsed > 0 ? performance.warm_transfers / elapsed * fullPeriodDays : 0;
      const expectedTransfers = target?.warm_transfer_goal ? num(target.warm_transfer_goal) * Math.min(1, elapsed / fullPeriodDays) : null;
      const health = latestReport?.health_status || (expectedTransfers !== null && performance.warm_transfers < expectedTransfers * .8 ? "risk" : "healthy");
      return {
        id: account.id,
        slug: account.slug,
        display_name: account.display_name,
        lifecycle_status: account.lifecycle_status,
        general_location: account.general_location,
        niche: account.niche,
        pod_name: account.pod_name,
        csm: ownerName(users.get(String(csmAssignment?.user_id || ""))),
        media_buyer: ownerName(users.get(String(buyerAssignment?.user_id || ""))),
        performance,
        recent_performance: recentPerformance,
        target,
        hp_score: hpScore,
        fatigue_score: fatigueScore(recentPerformance),
        projected_transfers: projectedTransfers,
        health_status: health,
        latest_alerts: latestReport?.alerts || [],
        integration_issues: accountIntegrations.filter((row) => ["ghl", "meta"].includes(row.provider) && !["connected", "disabled"].includes(row.status)).length,
        last_synced_at: freshness(accountIntegrations),
        open_feedback: performance.awaiting_feedback + performance.in_sales_process + performance.pending_payment,
        transfer_pace_percent: expectedTransfers && expectedTransfers > 0 ? performance.warm_transfers / expectedTransfers * 100 : null,
      };
    });

    const [months, leads, outcomes, communications, adMetrics, changelog, feedbackContact, targets, mediaProfile, adEntities, adEntityDaily, auditRuns, recommendations, dailyReports, selectedTerms, clientNotes, syncRuns, supportTickets] = await Promise.all([
      rest(`client_monthly_performance?select=*&client_id=eq.${clientId}&order=month_start.desc`),
      rest(`leads?select=id,external_contact_id,first_name,last_name,email,phone,address,source,campaign,qualification_status,qualification_reason,not_qualified_reason,qualified_at,disqualified_at,call_transfer_status,ghl_tags,transferred_at,speed_to_lead_minutes,first_contact_at,ad_account_external_id,campaign_external_id,ad_set_external_id,ad_external_id,submitted_at,source_details&client_id=eq.${clientId}&submitted_at=gte.${range.from}&submitted_at=lt.${range.next}&order=submitted_at.desc`),
      rest(`warm_transfer_outcomes?select=id,lead_id,transferred_at,status,collected_revenue,collected_at,lost_reason,feedback_note,feedback_received_at,updated_at&client_id=eq.${clientId}&transferred_at=gte.${range.from}&transferred_at=lt.${range.next}&order=transferred_at.desc`),
      rest(`communication_events?select=id,lead_id,client_contact_id,event_type,channel,direction,status,body_text,sender_name,duration_seconds,call_status,summary,sentiment,occurred_at&client_id=eq.${clientId}&occurred_at=gte.${range.from}&occurred_at=lt.${range.next}&order=occurred_at.desc&limit=250`),
      rest(`ad_metrics_daily?select=metric_date,spend,impressions,clicks,leads,link_ctr,link_cpc,cpm,frequency&client_id=eq.${clientId}&metric_date=gte.${range.from}&metric_date=lt.${range.next}&order=metric_date.asc`),
      rest(`ad_action_daily_summary?select=action_date,total_actions,latest_at,actions&client_id=eq.${clientId}&action_date=gte.${range.from}&action_date=lt.${range.next}&order=action_date.desc&limit=31`),
      rest(`client_feedback_contacts?select=client_id,ghl_contact_id,phone,full_name,status,assignment_source,last_verified_at&client_id=eq.${clientId}&limit=1`),
      rest(`client_monthly_targets?select=*&client_id=eq.${clientId}&month_start=eq.${monthStart(range.to)}&limit=1`),
      rest(`media_buying_profiles?select=*&client_id=eq.${clientId}&limit=1`),
      rest(`ad_entities?select=id,external_id,entity_type,parent_external_id,name,status,effective_status,config,last_synced_at&client_id=eq.${clientId}&order=entity_type.asc,name.asc`),
      rest(`ad_entity_metrics_daily?select=ad_entity_id,metric_date,spend,impressions,clicks,outbound_clicks,leads,qualified_leads,unqualified_leads,warm_transfers,link_ctr,link_cpc,cpm,frequency&client_id=eq.${clientId}&metric_date=gte.${range.from}&metric_date=lt.${range.next}&order=metric_date.asc`),
      rest(`media_buying_audit_runs?select=*&client_id=eq.${clientId}&order=audit_date.desc&limit=31`),
      rest(`media_buying_recommendations?select=*&client_id=eq.${clientId}&order=created_at.desc&limit=100`),
      rest(`daily_client_reports?select=*&client_id=eq.${clientId}&report_date=gte.${range.from}&report_date=lt.${range.next}&order=report_date.desc&limit=366`),
      rest(`client_monthly_terms?select=*&client_id=eq.${clientId}&month_start=gte.${fromMonth}&month_start=lte.${toMonth}`),
      rest(`client_notes?select=id,category,body,created_by,created_at,updated_at&client_id=eq.${clientId}&order=created_at.desc&limit=100`),
      rest(`integration_sync_runs?select=id,integration_id,sync_type,status,discovered_count,imported_count,exported_count,error_count,error_summary,started_at,completed_at,created_at&client_id=eq.${clientId}&order=created_at.desc&limit=50`),
      rest(`support_tickets?select=id,subject,description,category,priority,status,submitted_by_name,assigned_to_name,resolution,metadata,created_at,updated_at&client_id=eq.${clientId}&order=created_at.desc&limit=100`),
    ]);

    const outcomeByLead = new Map(outcomes.map((outcome: Row) => [outcome.lead_id, outcome]));
    const hydratedLeads = leads.map((lead: Row) => ({
      ...lead,
      full_name: [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Unknown lead",
      is_qualified: Boolean(lead.qualified_at) || ["qualified", "yes", "true"].includes(String(lead.qualification_status || "").toLowerCase()),
      outcome: outcomeByLead.get(lead.id) ?? null,
    }));
    const performance = aggregatePerformance(hydratedLeads, outcomes, adMetrics, selectedTerms, range);
    const adEntityPerformance = aggregateEntities(adEntities, adEntityDaily);
    const currentWorkspaceClient = workspaceClients.find((row: Row) => row.id === client.id);
    const latestRecommendations = auditRuns?.[0]?.id ? recommendations.filter((row: Row) => row.audit_run_id === auditRuns[0].id) : recommendations;

    return json({
      mode: "workspace",
      generated_at: new Date().toISOString(),
      range: { start: range.from, end: range.to, days: range.days },
      client: { ...client, csm: currentWorkspaceClient?.csm, media_buyer: currentWorkspaceClient?.media_buyer },
      selected_month: monthStart(range.to),
      months,
      performance,
      leads: hydratedLeads,
      communications,
      ad_metrics: adMetrics,
      ad_changelog: changelog,
      feedback_contact: feedbackContact?.[0] ?? null,
      monthly_target: targets?.[0] ?? null,
      media_buying_profile: mediaProfile?.[0] ?? null,
      ad_entities: adEntities,
      ad_entity_daily_metrics: adEntityDaily,
      ad_entity_performance: adEntityPerformance,
      greg: { audits: auditRuns, recommendations: latestRecommendations },
      daily_reports: dailyReports,
      operations: {
        notes: clientNotes,
        sync_runs: syncRuns,
        support_tickets: supportTickets,
        data_quality: {
          leads_without_campaign: hydratedLeads.filter((lead: Row) => !lead.campaign_external_id).length,
          leads_without_ad: hydratedLeads.filter((lead: Row) => !lead.ad_external_id).length,
          unreviewed_leads: hydratedLeads.filter((lead: Row) => !lead.qualified_at && !lead.disqualified_at && !lead.qualification_status).length,
          stale_integrations: (client.integrations || []).filter((item: Row) => item.status !== "connected").length,
        },
      },
      workspace: {
        current_user: null,
        clients: workspaceClients,
        daily: aggregateWorkspaceDaily(
          workspaceLeads.filter((row: Row) => String(row.submitted_at || "").slice(0, 10) >= range.from),
          workspaceOutcomes.filter((row: Row) => String(row.transferred_at || "").slice(0, 10) >= range.from),
          workspaceAds.filter((row: Row) => String(row.metric_date || "").slice(0, 10) >= range.from),
        ),
        latest_reports: latestReports,
      },
      reports: {
        leads: `${supabaseUrl}/functions/v1/command-centre-report-staging?client_id=${encodeURIComponent(client.id)}&from=${range.from}&to=${range.to}&type=leads`,
        ads: `${supabaseUrl}/functions/v1/command-centre-report-staging?client_id=${encodeURIComponent(client.id)}&from=${range.from}&to=${range.to}&type=ads`,
      },
    });
  } catch (error) {
    console.error("command-centre-demo", error);
    const message = error instanceof Error ? error.message : "Could not load command centre data";
    return json({ error: message }, message.includes("date") || message.includes("range") ? 400 : 500);
  }
});
