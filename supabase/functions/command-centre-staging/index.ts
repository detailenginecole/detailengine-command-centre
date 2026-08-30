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
  if (!response.ok) throw new Error(`Database request failed (${response.status})`);
  return response.json();
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

function healthProjection(base: Row, cycle: Row | null) {
  const cycleStart = cycle?.starts_on || base.range.start;
  const cycleEnd = base.range.end;
  const cutoff = addDays(cycleEnd, -3) < cycleStart ? cycleStart : addDays(cycleEnd, -3);
  const recentSpend = (base.ad_metrics || []).filter((row: Row) => row.metric_date >= cutoff && row.metric_date <= cycleEnd).reduce((sum: number, row: Row) => sum + num(row.spend), 0);
  const recentTransfers = (base.leads || []).filter((lead: Row) => { const date = lead.outcome?.transferred_at?.slice(0, 10); return date && date >= cutoff && date <= cycleEnd; }).length;
  const spendToDate = num(base.performance?.actual_ad_spend);
  const transfersToDate = num(base.performance?.warm_transfers);
  const goal = num(base.monthly_target?.warm_transfer_goal);
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
    return json({ ...base, client: { ...base.client, integrations }, operations: { ...base.operations, notes: activity }, account_chat: { messages: chatMessages }, notifications: notificationRows, account_status: { cycle: selectedCycle, cycles: [...cycles].reverse(), cycle_day: selectedCycle ? Math.max(1, dayCount(selectedCycle.starts_on, base.range.end)) : base.range.days, cycle_days: selectedCycle ? dayCount(selectedCycle.starts_on, selectedCycle.ends_on) : base.range.days, cycle_warnings: [...new Set(cycleWarnings)], hp, warnings, aliases, integrations, onboarding: { runs: onboardingRuns, steps: onboardingSteps } } });
  } catch (error) {
    console.error("command-centre", error);
    return json({ error: error instanceof Error ? error.message : "Could not load command centre" }, 500);
  }
});
