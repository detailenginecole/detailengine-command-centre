"use client";

import Link from "next/link";
import { FormEvent, ReactNode, useMemo, useState } from "react";
import type { CommandCentreData } from "./CommandCentre";

type AccountStatus = NonNullable<CommandCentreData["account_status"]>;
type Cycle = AccountStatus["cycles"][number];
type DraftMessage = { id: string; body: string; created_at: string; category?: string | null; draft?: boolean };

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const preciseMoney = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatDate = (value: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
const today = () => new Date().toISOString().slice(0, 10);
const tone = (score: number | null) => score == null ? "unknown" : score >= 90 ? "excellent" : score >= 70 ? "good" : score >= 50 ? "warning" : "critical";

export function AccountStatusWorkspace({
  data,
  refreshing,
  onRange,
  overview,
  leads,
  campaigns,
  onConnectors,
  onReport,
}: {
  data: CommandCentreData;
  refreshing: boolean;
  onRange: (range: { start: string; end: string }) => void;
  overview: (open: (target: "leads" | "campaigns") => void) => ReactNode;
  leads: ReactNode;
  campaigns: ReactNode;
  onConnectors: () => void;
  onReport: (type: "leads" | "ads") => void;
}) {
  const status = data.account_status;
  const [tab, setTab] = useState<"overview" | "leads" | "campaigns" | "operations">("overview");
  const [lifecycle, setLifecycle] = useState(data.client.lifecycle_status);
  const [displayName, setDisplayName] = useState(data.client.display_name.replace(" — TEST", ""));
  const [aliases, setAliases] = useState(status?.aliases.map((alias) => alias.name) || []);
  const [messages, setMessages] = useState<DraftMessage[]>(data.operations?.notes || []);
  const [draftCycle, setDraftCycle] = useState<Cycle | null>(status?.cycle || null);
  const [stepStates, setStepStates] = useState<Record<string, string>>({});
  const hp = status?.hp;
  const nonPerformanceWarnings = useMemo(
    () => (status?.warnings || []).filter((warning) => warning.source !== "hp"),
    [status?.warnings],
  );
  const selectedCycleId = status?.cycle?.id || "";
  const cycleProgress = status?.cycle_days ? Math.min(100, (status.cycle_day / status.cycle_days) * 100) : 0;

  const chooseCycle = (id: string) => {
    const cycle = status?.cycles.find((item) => item.id === id);
    if (!cycle) return;
    const end = cycle.ends_on < today() ? cycle.ends_on : today();
    onRange({ start: cycle.starts_on, end });
  };

  const saveRenameDraft = () => {
    const clean = displayName.trim();
    if (!clean) return;
    const original = data.client.display_name.replace(" — TEST", "");
    if (clean !== original && !aliases.includes(original)) setAliases((items) => [original, ...items]);
  };

  const postDraft = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = String(form.get("body") || "").trim();
    if (!body) return;
    setMessages((items) => [{ id: `draft-${Date.now()}`, body, created_at: new Date().toISOString(), category: "internal_chat", draft: true }, ...items]);
    event.currentTarget.reset();
  };

  return <>
    <div className="account-back"><Link href="/accounts">← All accounts</Link><span>STAGING PREVIEW</span></div>
    <header className="account-status-header">
      <div className="account-title-block">
        <div className="account-title-row"><span className={`lifecycle-dot lifecycle-${lifecycle}`} /><div><span className="kicker">{lifecycle.toUpperCase()} ACCOUNT</span><h1>{displayName}</h1></div></div>
        <p>{data.client.general_location || "Location pending"} · CSM: {data.client.csm || "Unassigned"} · Media buyer: {data.client.media_buyer || "Unassigned"}</p>
        <div className="cycle-pills">
          <span>{status?.cycle?.label || "No cycle configured"}</span>
          <span>Day {status?.cycle_day || data.range.days} of {status?.cycle_days || data.range.days}</span>
          {(status?.cycle_warnings || []).map((warning) => <b key={warning}>{warning}</b>)}
        </div>
      </div>
      <div className="account-header-actions">
        <label className="cycle-control"><span>CYCLE</span><select value={selectedCycleId} disabled={refreshing} onChange={(event) => chooseCycle(event.target.value)}>{status?.cycles.length ? status.cycles.map((cycle) => <option key={cycle.id} value={cycle.id}>{cycle.label} · {cycle.status}</option>) : <option value="">Calendar month</option>}</select></label>
        <div className="report-buttons"><button onClick={onConnectors}>Integrations</button><button onClick={() => onReport("leads")}>Lead PDF</button><button onClick={() => onReport("ads")}>Ad PDF</button></div>
      </div>
    </header>

    <section className="account-health-strip">
      <article className={`hp-primary hp-${tone(hp?.score ?? null)}`}><span>HP · 4-DAY TRANSFER ECONOMICS</span><strong>{hp?.score ?? "N/A"}{hp?.score != null ? <small>/100</small> : null}</strong><p>{hp?.goal_percent == null ? "Waiting for budget, spend and goal data." : `${hp.goal_percent.toFixed(1)}% uncapped goal projection`}</p></article>
      <article><span>4-day CPT</span><strong>{hp?.recent_cpt == null ? "—" : preciseMoney.format(hp.recent_cpt)}</strong><small>{hp?.recent_transfers ?? 0} transfers · {money.format(hp?.recent_spend || 0)} spend</small></article>
      <article><span>Budget remaining</span><strong>{money.format(hp?.remaining_budget || 0)}</strong><small>{money.format(data.performance.actual_ad_spend)} spent this cycle</small></article>
      <article><span>Forecast total</span><strong>{hp?.projected_total_transfers == null ? "—" : hp.projected_total_transfers.toFixed(1)}</strong><small>{data.performance.warm_transfers} delivered + {hp?.projected_additional_transfers?.toFixed(1) || "0"} projected</small></article>
      <div className="cycle-progress"><i style={{ width: `${cycleProgress}%` }} /></div>
    </section>

    {nonPerformanceWarnings.length > 0 ? <section className="account-warning-dashboard"><header><span>!</span><div><strong>{nonPerformanceWarnings.length} account-level system warning{nonPerformanceWarnings.length === 1 ? "" : "s"}</strong><small>Performance warnings are intentionally excluded here.</small></div></header><div>{nonPerformanceWarnings.map((warning) => <article key={warning.key}><b>{warning.source.replaceAll("_", " ")}</b><p>{warning.message}</p></article>)}</div></section> : null}

    <nav className="account-tabs" aria-label="Account workspace">
      {([["overview", "Overview"], ["leads", `Leads (${data.leads.length})`], ["campaigns", "Campaigns"], ["operations", "Operations & chat"]] as const).map(([id, label]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}{id === "operations" && nonPerformanceWarnings.length ? <i /> : null}</button>)}
    </nav>
    {tab === "overview" ? overview((target) => setTab(target)) : null}
    {tab === "leads" ? leads : null}
    {tab === "campaigns" ? campaigns : null}
    {tab === "operations" ? <section className="operations-grid">
      <article className="panel operations-chat">
        <div className="panel-head"><div><span className="kicker">INTERNAL ACCOUNT CHAT</span><h2>Context that stays with the account</h2></div><span className="draft-badge">STAGING DRAFTS</span></div>
        <p className="muted">Notes and discussion share one chronological feed. ClickUp is not connected.</p>
        <form onSubmit={postDraft}><textarea name="body" placeholder="Post an update, decision, blocker or handoff…" required /><button type="submit">Post draft</button></form>
        <div className="activity-feed">{messages.length ? messages.map((message) => <article key={message.id}><span>DE</span><div><strong>DetailEngine team {message.draft ? <i>draft</i> : null}</strong><p>{message.body}</p><time>{new Date(message.created_at).toLocaleString()}</time></div></article>) : <div className="empty-state">No account activity yet.</div>}</div>
      </article>
      <div className="operations-stack">
        <article className="panel account-admin-card"><div className="panel-head"><div><span className="kicker">ACCOUNT CONTROL</span><h2>Identity & lifecycle</h2></div></div><label><span>Account name</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label><label><span>Lifecycle</span><select value={lifecycle} onChange={(event) => setLifecycle(event.target.value)}>{["prospect", "onboarding", "live", "paused", "churned", "archived"].map((value) => <option key={value}>{value}</option>)}</select></label><button onClick={saveRenameDraft}>Save staging draft</button><div className="alias-list"><strong>Aliases</strong>{aliases.length ? aliases.map((alias) => <span key={alias}>{alias}</span>) : <small>No aliases recorded.</small>}</div></article>
        <article className="panel cycle-editor"><div className="panel-head"><div><span className="kicker">CYCLE CONTROL</span><h2>Add or edit cycle</h2></div></div>{draftCycle ? <><label><span>Cycle name</span><input value={draftCycle.label} onChange={(event) => setDraftCycle({ ...draftCycle, label: event.target.value })} /></label><div><label><span>Starts</span><input type="date" value={draftCycle.starts_on} onChange={(event) => setDraftCycle({ ...draftCycle, starts_on: event.target.value })} /></label><label><span>Ends</span><input type="date" value={draftCycle.ends_on} onChange={(event) => setDraftCycle({ ...draftCycle, ends_on: event.target.value })} /></label></div><label><span>Campaign filter</span><input value={draftCycle.campaign_filter || ""} onChange={(event) => setDraftCycle({ ...draftCycle, campaign_filter: event.target.value })} /></label><button>Save staging draft</button></> : <button onClick={() => setDraftCycle({ id: "draft", label: "New cycle", starts_on: today(), ends_on: today(), status: "planned", monthly_budget: 0, campaign_filter: "" })}>Add cycle draft</button>}</article>
        <article className="panel integration-health"><div className="panel-head"><div><span className="kicker">INTEGRATION HEALTH</span><h2>Meta, GHL & lead data</h2></div><button className="text-button" onClick={onConnectors}>Manage</button></div>{(status?.integrations || []).map((integration) => <div key={integration.id || integration.provider}><span>{integration.provider.toUpperCase()}</span><strong>{integration.status}</strong><small>{integration.last_error || (integration.last_synced_at ? `Last sync ${formatDate(integration.last_synced_at)}` : "Never synced")}</small></div>)}</article>
        <article className="panel onboarding-card"><div className="panel-head"><div><span className="kicker">ONBOARDING STATE</span><h2>{status?.onboarding.runs[0]?.status || "Not started"}</h2></div></div>{status?.onboarding.steps.length ? status.onboarding.steps.map((step) => { const value = stepStates[step.id] || step.status; return <label key={step.id}><span>{step.label}</span><select value={value} onChange={(event) => setStepStates((items) => ({ ...items, [step.id]: event.target.value }))}>{["pending", "in_progress", "blocked", "complete", "skipped"].map((item) => <option key={item}>{item}</option>)}</select></label>; }) : <p className="muted">No onboarding run has been created.</p>}</article>
        <article className="panel wizard-placeholder"><span>GHL BUILD WIZARD</span><strong>Reserved for the next build phase.</strong><small>The integration contract is visible now; the guided build flow is intentionally not wired yet.</small></article>
      </div>
    </section> : null}
    <aside className="staging-safety-note">Staging draft controls are visual and local only. They do not write to the shared production Supabase database.</aside>
  </>;
}
