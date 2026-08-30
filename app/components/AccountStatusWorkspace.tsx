"use client";

import Link from "next/link";
import { FormEvent, ReactNode, useState } from "react";
import type { CommandCentreData } from "./CommandCentre";

type AccountStatus = NonNullable<CommandCentreData["account_status"]>;
type Cycle = AccountStatus["cycles"][number];
type ChatMessage = NonNullable<CommandCentreData["account_chat"]>["messages"][number];

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const preciseMoney = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatDate = (value: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value.slice(0, 10) + "T00:00:00Z"));
const today = () => new Date().toISOString().slice(0, 10);
const addDay = (value: string) => { const date = new Date(value + "T00:00:00Z"); date.setUTCDate(date.getUTCDate() + 1); return date.toISOString().slice(0, 10); };
const monthEnd = (value: string) => { const date = new Date(value + "T00:00:00Z"); date.setUTCMonth(date.getUTCMonth() + 1); date.setUTCDate(date.getUTCDate() - 1); return date.toISOString().slice(0, 10); };
const tone = (score: number | null) => score == null ? "unknown" : score >= 90 ? "excellent" : score >= 70 ? "good" : score >= 50 ? "warning" : "critical";
const initials = (value: string) => value.split(" ").filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase();

export function AccountStatusWorkspace({
  data, refreshing, onRange, overview, leads, comparison, campaigns, communications, onReport,
}: {
  data: CommandCentreData;
  refreshing: boolean;
  onRange: (range: { start: string; end: string; cycleId?: string }) => Promise<void>;
  overview: (open: (target: "leads" | "campaigns") => void) => ReactNode;
  leads: ReactNode;
  comparison: ReactNode;
  campaigns: ReactNode;
  communications: ReactNode;
  onReport: (type: "leads" | "ads") => void;
}) {
  const status = data.account_status;
  const [manageOpen, setManageOpen] = useState(false);
  const [lifecycle, setLifecycle] = useState(data.client.lifecycle_status);
  const [displayName, setDisplayName] = useState(data.client.display_name.replace(" — TEST", ""));
  const [cycle, setCycle] = useState<Cycle | null>(status?.cycle || null);
  const [newCycle, setNewCycle] = useState<Cycle | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const hp = status?.hp;
  const performance = data.performance;
  const integrations = status?.integrations || data.client.integrations;
  const transferGoal = Number(data.monthly_target?.warm_transfer_goal || 0);
  const unresolvedOutcomes = performance.awaiting_feedback + performance.in_sales_process + performance.pending_payment;
  const selectedCycleId = status?.cycle?.id || "";
  const cycleProgress = status?.cycle_days ? Math.min(100, (status.cycle_day / status.cycle_days) * 100) : 0;
  const meta = integrations.find((item) => item.provider === "meta");
  const ghl = integrations.find((item) => item.provider === "ghl");
  const chat = data.account_chat?.messages || [];

  async function mutate(action: string, payload: Record<string, unknown> = {}) {
    setBusy(action); setMessage("");
    try {
      const response = await fetch("/api/manage-client", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, client_slug: data.client.slug, ...payload }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not save change");
      setMessage("Saved to DetailEngine.");
      await onRange({ start: data.range.start, end: data.range.end, cycleId: selectedCycleId || undefined });
      return body;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save change");
      return null;
    } finally { setBusy(""); }
  }

  const chooseCycle = async (id: string) => {
    const selected = status?.cycles.find((item) => item.id === id);
    if (!selected) return;
    setCycle(selected);
    const end = selected.ends_on < today() ? selected.ends_on : today() < selected.starts_on ? selected.starts_on : today();
    await onRange({ start: selected.starts_on, end, cycleId: selected.id });
  };
  const scrollToSection = (target: "leads" | "campaigns") => document.getElementById(target === "campaigns" ? "account-ads-manager" : "account-leads")?.scrollIntoView({ behavior: "smooth", block: "start" });
  const saveAccount = () => mutate("update_account", { display_name: displayName.trim(), lifecycle_status: lifecycle });
  const saveCycle = () => cycle && mutate("save_cycle", { cycle_id: cycle.id, starts_on: cycle.starts_on, monthly_budget: cycle.monthly_budget, warm_transfer_goal: cycle.warm_transfer_goal, status: cycle.status });
  const beginAddCycle = () => {
    const latestEnd = status?.cycles.map((item) => item.ends_on).sort().at(-1);
    const starts = latestEnd ? addDay(latestEnd) : today();
    setNewCycle({ id: "new", label: `Cycle ${(status?.cycles.length || 0) + 1}`, starts_on: starts, ends_on: monthEnd(starts), status: starts > today() ? "planned" : "active", monthly_budget: Number(cycle?.monthly_budget || data.monthly_target?.planned_ad_spend || 0), warm_transfer_goal: Number(cycle?.warm_transfer_goal || transferGoal || 0), campaign_filter: "" });
  };
  const createCycle = async () => {
    if (!newCycle) return;
    const saved = await mutate("save_cycle", { starts_on: newCycle.starts_on, monthly_budget: newCycle.monthly_budget, warm_transfer_goal: newCycle.warm_transfer_goal });
    if (saved?.cycle?.id) {
      setNewCycle(null);
      setCycle(saved.cycle);
      const end = newCycle.starts_on > today() ? newCycle.starts_on : today() < newCycle.ends_on ? today() : newCycle.ends_on;
      await onRange({ start: newCycle.starts_on, end, cycleId: saved.cycle.id });
    }
  };
  const postMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const body = String(new FormData(form).get("body") || "").trim();
    if (!body) return;
    const saved = await mutate("post_message", { body, parent_message_id: replyTo?.id || null });
    if (saved) { form.reset(); setReplyTo(null); }
  };
  const saveMeta = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    mutate("save_meta_integration", { external_account_id: form.get("external_account_id"), campaign_filter: form.get("campaign_filter"), cycle_id: selectedCycleId });
  };
  const saveGhl = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    mutate("save_connector", { provider: "ghl", external_account_id: form.get("external_account_id"), secret: form.get("secret") });
  };

  return <>
    <div className="account-back"><Link href="/accounts">← All accounts</Link><span>LIVE DASHBOARD</span></div>
    <header className="account-status-header">
      <div className="account-title-block">
        <div className="account-title-row"><span className={"lifecycle-dot lifecycle-" + lifecycle} /><div><span className="kicker">{lifecycle.toUpperCase()} ACCOUNT</span><h1>{displayName}</h1></div></div>
        <p>{data.client.general_location || "Location pending"} · CSM: {data.client.csm || "Unassigned"} · Media buyer: {data.client.media_buyer || "Unassigned"}</p>
        <div className="cycle-pills"><span>{status?.cycle?.label || "No cycle configured"}</span><span>Day {status?.cycle_day || data.range.days} of {status?.cycle_days || data.range.days}</span>{(status?.cycle_warnings || []).map((warning) => <b key={warning}>{warning}</b>)}</div>
      </div>
      <div className="account-header-actions">
        <label className="cycle-control"><span>CYCLE</span><select value={selectedCycleId} disabled={refreshing} onChange={(event) => chooseCycle(event.target.value)}>{status?.cycles.length ? status.cycles.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.status}</option>) : <option value="">No cycles</option>}</select></label>
        <div className="report-buttons"><button type="button" onClick={() => setManageOpen(true)}>Manage account</button><button type="button" onClick={() => onReport("leads")}>Lead PDF</button><button type="button" onClick={() => onReport("ads")}>Ad PDF</button></div>
      </div>
    </header>

    <section className="account-section" id="account-overview">
      <header className="account-section-heading"><div><span className="kicker">01 · OVERVIEW</span><h2>What needs attention now</h2></div><p>Health, pace and operating readiness at a glance.</p></header>
      <section className="account-health-strip">
        <article className={"hp-primary hp-" + tone(hp?.score ?? null)}><span>HP · 4-DAY TRANSFER ECONOMICS</span><strong>{hp?.score ?? "N/A"}{hp?.score != null ? <small>/100</small> : null}</strong><p>{hp?.goal_percent == null ? "Waiting for budget, spend and goal data." : hp.goal_percent.toFixed(1) + "% uncapped goal projection"}</p></article>
        <article><span>4-day CPT</span><strong>{hp?.recent_cpt == null ? "—" : preciseMoney.format(hp.recent_cpt)}</strong><small>{hp?.recent_transfers ?? 0} transfers · {money.format(hp?.recent_spend || 0)} spend</small></article>
        <article><span>Budget remaining</span><strong>{money.format(hp?.remaining_budget || 0)}</strong><small>{money.format(performance.actual_ad_spend)} spent this cycle</small></article>
        <article><span>Forecast total</span><strong>{hp?.projected_total_transfers == null ? "—" : hp.projected_total_transfers.toFixed(1)}</strong><small>{performance.warm_transfers} delivered + {hp?.projected_additional_transfers?.toFixed(1) || "0"} projected</small></article>
        <div className="cycle-progress"><i style={{ width: cycleProgress + "%" }} /></div>
      </section>
      <div className="account-overview-grid"><article className="panel overview-pulse"><div className="panel-head"><div><span className="kicker">OUTCOME PULSE</span><h2>{performance.warm_transfers} of {transferGoal || "—"} transfers delivered</h2></div></div><div className="overview-stat-grid"><div><span>Total leads</span><strong>{performance.total_leads}</strong></div><div><span>Qualified</span><strong>{performance.qualified_leads}</strong></div><div><span>Open outcomes</span><strong>{unresolvedOutcomes}</strong></div><div><span>Client return</span><strong>{money.format(performance.roi_dollars)}</strong></div></div></article></div>
    </section>

    <section className="account-section" id="account-performance">
      <header className="account-section-heading"><div><span className="kicker">02 · PERFORMANCE</span><h2>Client outcomes and delivery economics</h2></div><p>Are we producing the promised business result?</p></header>
      {overview(scrollToSection)}
      <div className="account-subsection" id="account-leads">{leads}</div>
      <div className="account-subsection account-comparison">{comparison}</div>
    </section>

    <section className="account-section" id="account-ads-manager">
      <header className="account-section-heading"><div><span className="kicker">03 · ADS MANAGER</span><h2>Meta operations and media intelligence</h2></div><p>Why performance is happening and what to do next.</p></header>
      {campaigns}
    </section>

    <section className="account-section" id="account-communications">
      <header className="account-section-heading"><div><span className="kicker">04 · COMMUNICATIONS</span><h2>Discussion, decisions and unresolved outcomes</h2></div><p>One chronological account record with no ClickUp dependency.</p></header>
      <div className="communications-grid">
        <article className="panel operations-chat">
          <div className="panel-head"><div><span className="kicker">INTERNAL ACCOUNT CHAT</span><h2>Context that stays with the account</h2></div><span className="status-pill good">LIVE</span></div>
          <p className="muted">Messages are attributed to the signed-in user. Replies notify the original author.</p>
          <div className="activity-feed">{chat.length ? chat.map((item) => <article key={item.id} className={item.mine ? "mine" : ""}><span>{initials(item.author_name)}</span><div>{item.parent ? <blockquote><b>{item.parent.author_name}</b>{item.parent.body}</blockquote> : null}<strong>{item.author_name}</strong><p>{item.body}</p><footer><time>{new Date(item.created_at).toLocaleString()}</time><button type="button" onClick={() => setReplyTo(item)}>Reply</button></footer></div></article>) : <div className="empty-state">No account messages yet.</div>}</div>
          {replyTo ? <div className="chat-reply-bar"><span>Replying to <b>{replyTo.author_name}</b>: {replyTo.body}</span><button type="button" onClick={() => setReplyTo(null)}>×</button></div> : null}
          <form onSubmit={postMessage}><textarea name="body" placeholder={replyTo ? "Write your reply…" : "Message the DetailEngine team…"} required /><button disabled={busy === "post_message"} type="submit">{busy === "post_message" ? "Sending…" : replyTo ? "Reply" : "Send"}</button></form>
          <small className="posting-as">Posting as <b>{data.workspace.current_user?.name || data.workspace.current_user?.email || "signed-in user"}</b></small>
        </article>
        <div className="communications-stack">{communications}</div>
      </div>
    </section>

    {manageOpen ? <div className="drawer-backdrop account-manage-backdrop" onClick={() => setManageOpen(false)}><aside className="account-manage-drawer" role="dialog" aria-modal="true" aria-label="Manage account" onClick={(event) => event.stopPropagation()}>
      <header><div><span className="kicker">ACCOUNT MANAGEMENT</span><h2>Identity, cycles and integrations</h2></div><button type="button" aria-label="Close account management" onClick={() => setManageOpen(false)}>×</button></header>
      {message ? <p className="manage-message">{message}</p> : null}
      <article className="panel account-admin-card"><div className="panel-head"><div><span className="kicker">ACCOUNT CONTROL</span><h2>Identity & lifecycle</h2></div></div><label><span>Account name</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label><label><span>Lifecycle</span><select value={lifecycle} onChange={(event) => setLifecycle(event.target.value)}>{["prospect", "onboarding", "live", "paused", "churned", "archived"].map((value) => <option key={value}>{value}</option>)}</select></label><button disabled={busy === "update_account"} type="button" onClick={saveAccount}>{busy === "update_account" ? "Saving…" : "Save account"}</button><div className="alias-list"><strong>Aliases</strong>{status?.aliases.length ? status.aliases.map((alias) => <span key={alias.id}>{alias.name}</span>) : <small>No aliases recorded.</small>}</div></article>
      <article className="panel cycle-editor"><div className="panel-head"><div><span className="kicker">CYCLE CONTROL</span><h2>{cycle?.label || "No cycle yet"}</h2></div><button className="text-button" type="button" onClick={beginAddCycle}>＋ Add a cycle</button></div>{cycle ? <><label><span>Start date</span><input required type="date" value={cycle.starts_on} onChange={(event) => { if (!event.target.value) return; setCycle({ ...cycle, starts_on: event.target.value, ends_on: monthEnd(event.target.value) }); }} /></label><label><span>Cycle length</span><input value={`1 calendar month · ends ${formatDate(monthEnd(cycle.starts_on))}`} disabled /></label><label><span>Cycle budget</span><input type="number" min="0" value={cycle.monthly_budget || 0} onChange={(event) => setCycle({ ...cycle, monthly_budget: Number(event.target.value) })} /></label><label><span>Cycle goal · warm transfers</span><input type="number" min="0" step="1" value={cycle.warm_transfer_goal || 0} onChange={(event) => setCycle({ ...cycle, warm_transfer_goal: Number(event.target.value) })} /></label><label><span>Status</span><select value={cycle.status} onChange={(event) => setCycle({ ...cycle, status: event.target.value })}>{["planned", "active", "completed", "paused"].map((value) => <option key={value}>{value}</option>)}</select></label><button disabled={busy === "save_cycle"} type="button" onClick={saveCycle}>{busy === "save_cycle" ? "Saving…" : "Save cycle"}</button></> : null}{newCycle ? <section className="cycle-confirmation" aria-label="Confirm new cycle"><div><span className="kicker">CONFIRM NEW CYCLE</span><h3>{newCycle.label}</h3><p>Review the complete cycle before it is added to the live account.</p></div><label><span>Start date</span><input required type="date" value={newCycle.starts_on} onChange={(event) => { const starts_on = event.target.value; if (!starts_on) return; setNewCycle({ ...newCycle, starts_on, ends_on: monthEnd(starts_on), status: starts_on > today() ? "planned" : "active" }); }} /></label><label><span>Cycle length</span><input value={`1 calendar month · ${formatDate(newCycle.starts_on)} – ${formatDate(newCycle.ends_on)}`} disabled /></label><label><span>Cycle budget</span><input type="number" min="0" value={newCycle.monthly_budget} onChange={(event) => setNewCycle({ ...newCycle, monthly_budget: Number(event.target.value) })} /></label><label><span>Cycle goal · warm transfers</span><input type="number" min="0" step="1" value={newCycle.warm_transfer_goal} onChange={(event) => setNewCycle({ ...newCycle, warm_transfer_goal: Number(event.target.value) })} /></label><div className="cycle-confirmation-actions"><button className="text-button" type="button" onClick={() => setNewCycle(null)}>Cancel</button><button disabled={busy === "save_cycle"} type="button" onClick={createCycle}>{busy === "save_cycle" ? "Adding…" : `Add ${newCycle.label}`}</button></div></section> : !cycle ? <button type="button" onClick={beginAddCycle}>Add Cycle 1</button> : null}</article>
      <article className="panel connector-inline"><div className="panel-head"><div><span className="kicker">META INTEGRATION</span><h2>Account and campaign filter</h2></div><span className="status-pill neutral">{meta?.status || "disconnected"}</span></div><form onSubmit={saveMeta}><label><span>Ad account ID</span><input name="external_account_id" defaultValue={meta?.external_account_id || ""} placeholder="act_123456789" required /></label><label><span>Campaign filter for {status?.cycle?.label || "selected cycle"}</span><input name="campaign_filter" defaultValue={status?.cycle?.campaign_filter || ""} placeholder="Campaign name contains…" /></label><p>No Meta access token is required here.</p><button disabled={busy === "save_meta_integration"}>{busy === "save_meta_integration" ? "Saving…" : "Save Meta integration"}</button></form></article>
      <article className="panel connector-inline"><div className="panel-head"><div><span className="kicker">GHL INTEGRATION</span><h2>Client location</h2></div><span className="status-pill neutral">{ghl?.status || "disconnected"}</span></div><form onSubmit={saveGhl}><label><span>Location ID</span><input name="external_account_id" defaultValue={ghl?.external_account_id || ""} required /></label><label><span>Private integration token</span><input name="secret" type="password" autoComplete="new-password" placeholder={ghl?.has_secret ? "Leave blank to keep stored token" : "Enter client PIT"} /></label><button disabled={busy === "save_connector"}>{busy === "save_connector" ? "Saving…" : "Save GHL integration"}</button></form></article>
      <article className="panel wizard-placeholder"><span>GHL BUILD WIZARD</span><strong>Reserved for the next build phase.</strong><small>The integration contract is visible now; the guided build flow is intentionally not wired yet.</small></article>
    </aside></div> : null}
  </>;
}
