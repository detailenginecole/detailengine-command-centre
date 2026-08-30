const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const allowedEmailDomain = (Deno.env.get("DETAILENGINE_ALLOWED_EMAIL_DOMAIN") || "getdetailengine.com").toLowerCase();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
async function rest(path: string, method = "GET", body?: unknown, prefer?: string) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method,
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text();
    console.error("command-centre-admin", response.status, detail);
    throw new Error(`Database request failed (${response.status})`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
const number = (value: unknown) => { const parsed = Number(value || 0); return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0; };
const clean = (value: unknown) => String(value || "").trim();
const monthEnd = (start: string) => { const date = new Date(`${start}T00:00:00.000Z`); date.setUTCMonth(date.getUTCMonth() + 1); date.setUTCDate(date.getUTCDate() - 1); return date.toISOString().slice(0, 10); };
async function allowedUser(request: Request) {
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return null;
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: serviceRoleKey, Authorization: authorization } });
  if (!response.ok) return null;
  const user = await response.json();
  const email = String(user?.email || "").toLowerCase();
  return user?.id && email.endsWith(`@${allowedEmailDomain}`) ? user : null;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "POST required" }, 405);
  const user = await allowedUser(request);
  if (!user) return json({ error: "Unauthorized" }, 401);
  try {
    const payload = await request.json();
    const action = String(payload.action || "");
    const actorUserId = String(user.id);
    const actorName = clean(user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0]) || "DetailEngine team";

    if (action === "acknowledge_greg") {
      await rest(`media_buying_recommendations?id=eq.${encodeURIComponent(payload.recommendation_id)}`, "PATCH", { acknowledged_at: new Date().toISOString(), acknowledged_by: actorUserId || null });
      return json({ ok: true });
    }
    if (action === "mark_notification_read") {
      if (!actorUserId) return json({ error: "Signed-in user required" }, 401);
      await rest(`account_notifications?id=eq.${encodeURIComponent(clean(payload.notification_id))}&recipient_user_id=eq.${encodeURIComponent(actorUserId)}`, "PATCH", { read_at: new Date().toISOString() });
      return json({ ok: true });
    }

    const clientActions = ["add_note", "submit_support", "update_targets", "save_connector", "save_meta_integration", "update_account", "save_cycle", "update_onboarding_step", "post_message"];
    let selectedClient: Record<string, unknown> | null = null;
    if (clientActions.includes(action)) {
      const rows = await rest(`clients?select=id,organization_id,slug,display_name,lifecycle_status&slug=eq.${encodeURIComponent(clean(payload.client_slug))}&limit=1`);
      selectedClient = rows?.[0] || null;
      if (!selectedClient) return json({ error: "Account not found" }, 404);
    }

    if (action === "update_account") {
      const displayName = clean(payload.display_name);
      const lifecycleStatus = clean(payload.lifecycle_status);
      if (!displayName) return json({ error: "Account name is required" }, 400);
      if (!["prospect", "onboarding", "live", "paused", "churned", "archived", "active", "test"].includes(lifecycleStatus)) return json({ error: "Invalid lifecycle status" }, 400);
      const oldName = clean(selectedClient?.display_name);
      await rest(`clients?id=eq.${selectedClient?.id}`, "PATCH", { display_name: displayName, lifecycle_status: lifecycleStatus, updated_at: new Date().toISOString() });
      if (oldName && oldName !== displayName) {
        await rest("client_notes", "POST", { client_id: selectedClient?.id, category: "account_alias", body: oldName, created_by: actorUserId || null });
      }
      return json({ ok: true, display_name: displayName, lifecycle_status: lifecycleStatus });
    }

    if (action === "save_cycle") {
      const startsOn = /^\d{4}-\d{2}-\d{2}$/.test(clean(payload.starts_on)) ? clean(payload.starts_on) : "";
      if (!startsOn) return json({ error: "Cycle start date is required" }, 400);
      const endsOn = monthEnd(startsOn);
      const cycleId = clean(payload.cycle_id);
      if (cycleId) {
        const existing = await rest(`reporting_periods?select=id&client_id=eq.${selectedClient?.id}&id=eq.${encodeURIComponent(cycleId)}&limit=1`);
        if (!existing?.length) return json({ error: "Cycle not found" }, 404);
        await rest(`reporting_periods?id=eq.${encodeURIComponent(cycleId)}`, "PATCH", { starts_on: startsOn, ends_on: endsOn, status: clean(payload.status) || "active", monthly_budget: number(payload.monthly_budget), updated_at: new Date().toISOString() });
        return json({ ok: true, cycle_id: cycleId, starts_on: startsOn, ends_on: endsOn });
      }
      const cycles = await rest(`reporting_periods?select=id&client_id=eq.${selectedClient?.id}`);
      const label = `Cycle ${cycles.length + 1}`;
      const today = new Date().toISOString().slice(0, 10);
      const status = startsOn <= today && endsOn >= today ? "active" : startsOn > today ? "planned" : "completed";
      const rows = await rest("reporting_periods", "POST", { client_id: selectedClient?.id, label, starts_on: startsOn, ends_on: endsOn, status, monthly_budget: number(payload.monthly_budget), campaign_filter: "" }, "return=representation");
      return json({ ok: true, cycle: rows[0] }, 201);
    }

    if (action === "save_meta_integration") {
      const externalAccountId = clean(payload.external_account_id);
      if (!externalAccountId) return json({ error: "Meta ad account ID is required" }, 400);
      const rows = await rest("client_integrations?on_conflict=client_id,provider,connection_key", "POST", {
        client_id: selectedClient?.id, provider: "meta", connection_key: "primary", external_account_id: externalAccountId,
        display_name: externalAccountId, status: "pending", is_primary: true, config: {}, updated_at: new Date().toISOString(),
      }, "resolution=merge-duplicates,return=representation");
      const cycleId = clean(payload.cycle_id);
      if (cycleId) await rest(`reporting_periods?id=eq.${encodeURIComponent(cycleId)}&client_id=eq.${selectedClient?.id}`, "PATCH", { campaign_filter: clean(payload.campaign_filter) || null, updated_at: new Date().toISOString() });
      return json({ ok: true, integration: rows?.[0] });
    }

    if (action === "save_connector") {
      const provider = clean(payload.provider).toLowerCase();
      if (!["ghl", "meta"].includes(provider)) return json({ error: "Unsupported connector" }, 400);
      const externalAccountId = clean(payload.external_account_id);
      const secret = clean(payload.secret);
      if (!externalAccountId) return json({ error: provider === "ghl" ? "GHL location ID is required" : "Meta ad account ID is required" }, 400);
      const existing = await rest(`client_integrations?select=id,secret_ref&client_id=eq.${selectedClient?.id}&provider=eq.${provider}&connection_key=eq.primary&limit=1`);
      if (secret || existing?.[0]?.secret_ref) {
        const rows = await rest("rpc/upsert_client_integration_secret", "POST", { p_client_id: selectedClient?.id, p_provider: provider, p_connection_key: "primary", p_external_account_id: externalAccountId, p_secret: secret || null, p_config: {}, p_display_name: externalAccountId, p_is_primary: true });
        return json({ ok: true, integration_id: rows, status: "connected", has_secret: true });
      }
      const rows = await rest("client_integrations?on_conflict=client_id,provider,connection_key", "POST", { client_id: selectedClient?.id, provider, connection_key: "primary", external_account_id: externalAccountId, display_name: externalAccountId, status: "pending", is_primary: true, config: {}, updated_at: new Date().toISOString() }, "resolution=merge-duplicates,return=representation");
      return json({ ok: true, integration: rows?.[0], status: "pending", has_secret: false });
    }

    if (action === "update_onboarding_step") {
      const status = clean(payload.status);
      if (!["pending", "in_progress", "blocked", "complete", "skipped"].includes(status)) return json({ error: "Invalid onboarding status" }, 400);
      await rest(`onboarding_steps?id=eq.${encodeURIComponent(clean(payload.step_id))}&client_id=eq.${selectedClient?.id}`, "PATCH", { status, completed_at: status === "complete" ? new Date().toISOString() : null, updated_at: new Date().toISOString() });
      return json({ ok: true });
    }

    if (action === "post_message") {
      if (!actorUserId) return json({ error: "Signed-in user required" }, 401);
      const body = clean(payload.body);
      if (!body) return json({ error: "Message is required" }, 400);
      if (body.length > 8000) return json({ error: "Message is too long" }, 400);
      const parentId = clean(payload.parent_message_id);
      let parent = null;
      if (parentId) {
        const parents = await rest(`account_messages?select=id,author_user_id,author_name,body&client_id=eq.${selectedClient?.id}&id=eq.${encodeURIComponent(parentId)}&limit=1`);
        parent = parents?.[0] || null;
        if (!parent) return json({ error: "Reply target not found" }, 404);
      }
      const rows = await rest("account_messages", "POST", { client_id: selectedClient?.id, parent_message_id: parent?.id || null, author_user_id: actorUserId, author_name: actorName, body }, "return=representation");
      const message = rows[0];
      if (parent && parent.author_user_id !== actorUserId) {
        await rest("account_notifications?on_conflict=recipient_user_id,message_id", "POST", {
          recipient_user_id: parent.author_user_id, actor_user_id: actorUserId, client_id: selectedClient?.id, message_id: message.id,
          notification_type: "chat_reply", title: `${actorName} replied in ${selectedClient?.display_name}`, body: body.slice(0, 240),
        }, "resolution=merge-duplicates");
      }
      return json({ ok: true, message }, 201);
    }

    if (action === "add_note") {
      const body = clean(payload.body);
      if (!body) return json({ error: "Note is required" }, 400);
      const rows = await rest("client_notes", "POST", { client_id: selectedClient?.id, category: clean(payload.category) || "general", body, created_by: actorUserId || null }, "return=representation");
      return json({ ok: true, note: rows[0] }, 201);
    }
    if (action === "submit_support") {
      const subject = clean(payload.subject);
      if (!subject) return json({ error: "Issue subject is required" }, 400);
      const rows = await rest("support_tickets", "POST", { client_id: selectedClient?.id, subject, description: clean(payload.description), category: clean(payload.category) || "operations", priority: clean(payload.priority) || "normal", submitted_by_user_id: actorUserId || null, submitted_by_name: actorName, metadata: { source: "command_centre" } }, "return=representation");
      return json({ ok: true, ticket: rows[0] }, 201);
    }
    if (action === "update_targets") {
      const month = /^\d{4}-\d{2}-01$/.test(clean(payload.month_start)) ? clean(payload.month_start) : `${new Date().toISOString().slice(0, 7)}-01`;
      const rows = await rest("client_monthly_targets?on_conflict=client_id,month_start", "POST", { client_id: selectedClient?.id, month_start: month, planned_ad_spend: number(payload.planned_ad_spend), lead_goal: number(payload.lead_goal), qualified_lead_goal: number(payload.qualified_lead_goal), warm_transfer_goal: number(payload.warm_transfer_goal), target_cpl: number(payload.target_cpl) || null, target_cost_per_qualified_lead: number(payload.target_cost_per_qualified_lead) || null, target_cost_per_transfer: number(payload.target_cost_per_transfer) || null, source: "command_centre", updated_at: new Date().toISOString() }, "resolution=merge-duplicates,return=representation");
      return json({ ok: true, target: rows[0] });
    }

    if (action !== "create") return json({ error: "Unsupported action" }, 400);
    const displayName = clean(payload.display_name);
    if (!displayName) return json({ error: "Company name is required" }, 400);
    const organizations = await rest("organizations?select=id&order=created_at.asc&limit=1");
    if (!organizations?.[0]?.id) return json({ error: "DetailEngine organization is missing" }, 409);
    let slug = slugify(displayName);
    const existing = await rest(`clients?select=id&slug=eq.${encodeURIComponent(slug)}&limit=1`);
    if (existing.length) slug = `${slug}-${Date.now().toString().slice(-5)}`;
    const clients = await rest("clients", "POST", { organization_id: organizations[0].id, slug, legal_name: displayName, display_name: displayName, lifecycle_status: "onboarding", vertical: clean(payload.niche) || "Auto detailing", timezone: clean(payload.timezone) || "America/New_York", currency: "USD", source_system: "detailengine_command_centre" }, "return=representation");
    const client = clients[0];
    const currentMonth = `${new Date().toISOString().slice(0, 7)}-01`;
    const currentMonthEnd = monthEnd(currentMonth);
    await Promise.all([
      rest("client_operating_profiles", "POST", { client_id: client.id, niche: clean(payload.niche) || "Auto detailing", general_location: clean(payload.general_location), communication_channel: "ghl", management_fee: number(payload.retainer_amount), campaign_filter: "" }),
      rest("client_monthly_terms", "POST", { client_id: client.id, month_start: currentMonth, retainer_amount: number(payload.retainer_amount), currency: "USD", source: "command_centre" }),
      rest("client_monthly_targets", "POST", { client_id: client.id, month_start: currentMonth, planned_ad_spend: number(payload.planned_ad_spend), lead_goal: 0, qualified_lead_goal: 0, warm_transfer_goal: number(payload.warm_transfer_goal), source: "command_centre" }),
      rest("reporting_periods", "POST", { client_id: client.id, label: "Cycle 1", starts_on: currentMonth, ends_on: currentMonthEnd, status: "active", monthly_budget: number(payload.planned_ad_spend), campaign_filter: "" }),
      rest("client_integrations", "POST", [
        { client_id: client.id, provider: "ghl", connection_key: "primary", external_account_id: clean(payload.ghl_location_id) || null, display_name: clean(payload.ghl_location_id) || "GHL setup required", status: payload.ghl_location_id ? "pending" : "disconnected", is_primary: true, config: {} },
        { client_id: client.id, provider: "meta", connection_key: "primary", display_name: "Meta setup required", status: "disconnected", is_primary: true, config: {} },
      ]),
    ]);
    return json({ ok: true, client }, 201);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Could not complete admin action" }, 500);
  }
});
