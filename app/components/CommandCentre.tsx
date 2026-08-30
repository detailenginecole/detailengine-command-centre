"use client";
/* eslint-disable @next/next/no-img-element */

import { FormEvent, Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AccountStatusWorkspace } from "./AccountStatusWorkspace";

type Integration = { id?: string; provider: string; status: string; display_name: string; external_account_id?: string | null; has_secret: boolean; last_synced_at?: string | null; last_error?: string | null };
type Performance = {
  range_start?: string; range_end?: string; month_start: string; month_end: string;
  total_leads: number; qualified_leads: number; unqualified_leads: number; warm_transfers: number;
  awaiting_feedback: number; in_sales_process: number; pending_payment: number; closed_transfers: number; lost_transfers: number;
  collected_revenue: number; actual_ad_spend: number; retainer_amount: number; total_investment: number; roi_dollars: number; roi_percent: number | null;
  impressions: number; clicks: number; meta_leads: number; ctr_percent: number | null; cpc: number | null; cpm: number | null; frequency?: number | null;
  cost_per_lead: number | null; cost_per_qualified_lead?: number | null; cost_per_transfer: number | null;
  qualification_rate?: number | null; transfer_rate?: number | null; feedback_resolution_rate?: number | null; average_speed_to_lead_minutes?: number | null;
};
type MonthlyTarget = { planned_ad_spend: number; lead_goal: number; qualified_lead_goal: number; warm_transfer_goal: number; target_cpl: number | null; target_cost_per_qualified_lead: number | null; target_cost_per_transfer: number | null };
type Client = {
  id: string; slug: string; display_name: string; lifecycle_status: string; niche: string; general_location: string; pod_name: string;
  csm?: string; media_buyer?: string; integrations: Integration[];
};
type WorkspaceClient = Pick<Client, "id" | "slug" | "display_name" | "lifecycle_status" | "general_location" | "niche" | "pod_name"> & {
  csm: string; media_buyer: string; performance: Performance; recent_performance: Performance; target: MonthlyTarget | null; projected_transfers: number; health_status: string; hp_score: number | null; fatigue_score: number | null; latest_alerts: string[]; integration_issues: number;
  last_synced_at?: string | null; open_feedback?: number; transfer_pace_percent?: number | null;
};
type Outcome = { id: string; transferred_at: string; status: "awaiting_feedback" | "sales_process" | "pending_payment" | "closed" | "lost"; collected_revenue: number; collected_at: string | null; lost_reason: string | null; feedback_note: string | null; feedback_received_at: string | null };
type Lead = {
  id: string; full_name: string; email: string; phone: string; source: string; campaign: string; qualification_status: string | null; qualification_reason: string | null; not_qualified_reason: string | null;
  is_qualified: boolean; submitted_at: string; transferred_at: string | null; speed_to_lead_minutes?: number | null; campaign_external_id?: string | null; ad_set_external_id?: string | null; ad_external_id?: string | null; outcome: Outcome | null;
};
type Communication = { id: string; lead_id: string | null; client_contact_id: string | null; event_type: string; channel: string; direction: string; body_text: string | null; sender_name: string | null; duration_seconds: number | null; occurred_at: string };
type DailyMetric = { metric_date: string; spend: number; impressions: number; clicks: number; leads: number; link_ctr?: number | null; link_cpc?: number | null; cpm?: number | null; frequency?: number | null };
type ChangeAction = { action: string; entity_type: string; count: number; summary: string };
type ChangeDay = { action_date: string; total_actions: number; latest_at: string; actions: ChangeAction[] };
type FeedbackContact = { ghl_contact_id: string; phone: string; full_name: string | null; status: string; last_verified_at: string | null };
type AdEntity = { id: string; external_id: string; entity_type: "campaign" | "ad_set" | "ad"; parent_external_id: string | null; name: string; status: string | null; effective_status: string | null; config: Record<string, unknown>; last_synced_at: string | null };
type AdEntityPerformance = { ad_entity_id: string; external_id: string; entity_type: string; parent_external_id: string | null; name: string; status: string | null; effective_status: string | null; spend: number; impressions: number; clicks: number; leads: number; qualified_leads: number; unqualified_leads: number; warm_transfers: number; ctr_percent: number | null; cpc: number | null; cpm: number | null; frequency: number | null; cost_per_lead: number | null; cost_per_qualified_lead: number | null; cost_per_transfer: number | null };
type AdEntityDaily = { ad_entity_id: string; metric_date: string; spend: number; impressions: number; clicks: number; outbound_clicks?: number; leads: number; qualified_leads: number; unqualified_leads: number; warm_transfers: number; link_ctr?: number | null; link_cpc?: number | null; cpm?: number | null; frequency: number | null };
type GregAudit = { id: string; audit_date: string; window_start: string; window_end: string; health_status: string; headline: string; summary: string; metrics: Record<string, number | string | null>; completed_at: string | null };
type GregRecommendation = { id: string; audit_run_id: string; external_entity_id: string; entity_type: string; entity_name: string; verdict: "scale" | "hold" | "watch" | "pause" | "resume" | "investigate"; priority: string; reason: string; evidence: Record<string, number | string>; acknowledged_at?: string | null };
type DailyReport = { id: string; report_date: string; health_status: string; headline: string; summary: string; metrics: Record<string, number | string | null>; alerts: string[]; generated_at: string };
type WorkspaceDaily = { metric_date: string; spend: number; impressions: number; clicks: number; leads: number; qualified: number; unqualified: number; transfers: number; revenue: number };
type ClientNote = { id: string; category: string | null; body: string; created_at: string };
type SyncRun = { id: string; sync_type: string; status: string; imported_count: number; error_count: number; error_summary: string | null; created_at: string; completed_at: string | null };
type SupportTicket = { id: string; subject: string; description: string | null; category: string | null; priority: string; status: string; submitted_by_name: string | null; created_at: string };
type AccountMessage = { id: string; client_id: string; parent_message_id: string | null; author_user_id: string; author_name: string; body: string; created_at: string; mine: boolean; parent: { id: string; author_name: string; body: string } | null };
type AccountNotification = { id: string; client_id: string; title: string; body: string; read_at: string | null; created_at: string; client: { slug: string; display_name: string } | null };

export type CommandCentreData = {
  mode: string; generated_at: string; range: { start: string; end: string; days: number }; client: Client; selected_month: string; months: Performance[]; performance: Performance;
  leads: Lead[]; communications: Communication[]; ad_metrics: DailyMetric[]; ad_changelog: ChangeDay[]; feedback_contact: FeedbackContact | null; monthly_target: MonthlyTarget | null;
  media_buying_profile: { operating_mode: string; recent_window_days: number; minimum_spend_multiplier?: number; pause_spend_multiplier?: number; cpl_over_goal_multiplier?: number; minimum_leads_for_signal?: number; notes?: string | null } | null;
  ad_entities: AdEntity[]; ad_entity_daily_metrics: AdEntityDaily[]; ad_entity_performance: AdEntityPerformance[];
  greg: { audits: GregAudit[]; recommendations: GregRecommendation[] }; daily_reports: DailyReport[];
  workspace: { current_user: { id: string; email: string; name?: string } | null; clients: WorkspaceClient[]; daily?: WorkspaceDaily[]; latest_reports?: DailyReport[] };
  account_chat?: { messages: AccountMessage[] };
  notifications?: AccountNotification[];
  operations?: { notes: ClientNote[]; sync_runs: SyncRun[]; support_tickets: SupportTicket[]; data_quality: { leads_without_campaign: number; leads_without_ad: number; unreviewed_leads: number; stale_integrations: number } };
  account_status?: {
    cycle: { id: string; label: string; starts_on: string; ends_on: string; status: string; monthly_budget: number; warm_transfer_goal: number; campaign_filter: string | null } | null;
    cycles: Array<{ id: string; label: string; starts_on: string; ends_on: string; status: string; monthly_budget: number; warm_transfer_goal: number; campaign_filter: string | null }>;
    cycle_day: number; cycle_days: number; cycle_warnings: string[];
    hp: { score: number | null; goal_percent: number | null; recent_cpt: number | null; recent_spend: number; recent_transfers: number; projected_additional_transfers: number | null; projected_total_transfers: number | null; remaining_budget: number; provisional: boolean; window: { start: string; end: string }; warnings: string[] };
    warnings: Array<{ key: string; source: string; severity: string; message: string }>;
    aliases: Array<{ id: string; name: string; created_at: string }>;
    integrations: Integration[];
    onboarding: { runs: Array<{ id: string; status: string; started_at?: string | null; completed_at?: string | null }>; steps: Array<{ id: string; label: string; status: string; position: number }> };
  };
  reports: { leads: string; ads: string };
};

export type Screen = "overview" | "accounts" | "account" | "manage";
type LeadFilter = "all" | "transferred" | "qualified" | "unqualified" | "open";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const preciseMoney = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const count = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const pct = (value: number | null | undefined, digits = 1) => value == null ? "—" : `${Number(value).toFixed(digits)}%`;
const cleanName = (value: string) => value.replace(" — TEST", "").replace(" - TEST", "");
const initials = (value: string) => value.split(" ").filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
const shortDate = (value: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(value));
const dateTime = (value: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
const rangeLabel = (start: string, end: string) => `${shortDate(`${start}T00:00:00Z`)} – ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${end}T00:00:00Z`))}`;
const isoToday = () => new Date().toISOString().slice(0, 10);
const monthStart = (date = isoToday()) => `${date.slice(0, 7)}-01`;
const daysInMonth = (date: string) => new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0)).getUTCDate();
const addIsoDays = (value: string, days: number) => { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };
const isRisk = (value: string) => ["risk", "critical", "poor", "unhealthy", "attention"].includes(String(value || "").toLowerCase());
const statusText = (value: string) => String(value || "unknown").replaceAll("_", " ");

function MetricCard({ label, value, note, tone = "paper" }: { label: string; value: string; note: string; tone?: "paper" | "orange" | "green" | "blue" | "yellow" }) {
  return <article className={`metric-card tone-${tone}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;
}

function StatusPill({ status }: { status: string }) {
  return <span className={`status-pill ${isRisk(status) ? "risk" : ["healthy", "active", "connected", "good", "scale"].includes(status.toLowerCase()) ? "good" : "neutral"}`}>{statusText(status)}</span>;
}

function Shell({ screen, children, user, notifications, mobileOpen, setMobileOpen }: { screen: Screen; children: React.ReactNode; user: CommandCentreData["workspace"]["current_user"]; notifications: AccountNotification[]; mobileOpen: boolean; setMobileOpen: (value: boolean) => void }) {
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [locallyRead, setLocallyRead] = useState<string[]>([]);
  const items = notifications.map((item) => locallyRead.includes(item.id) ? { ...item, read_at: item.read_at || "just-read" } : item);
  const unread = items.filter((item) => !item.read_at).length;
  async function openNotification(item: AccountNotification) {
    if (!item.read_at) {
      await fetch("/api/manage-client", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "mark_notification_read", notification_id: item.id }) });
      setLocallyRead((current) => current.includes(item.id) ? current : [...current, item.id]);
    }
    if (item.client?.slug) window.location.assign(`/accounts/${item.client.slug}#account-communications`);
  }
  const nav = [
    { id: "overview", href: "/", label: "Company Overview", icon: "⌂" },
    { id: "accounts", href: "/accounts", label: "Accounts", icon: "◎" },
    { id: "manage", href: "/manage", label: "Manage", icon: "⚙" },
  ];
  return <main className="app-shell">
    <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
      <Link className="brand" href="/"><span>DE</span><div><strong>DETAILENGINE</strong><small>COMMAND CENTRE</small></div></Link>
      <nav aria-label="Main navigation">{nav.map((item) => <Link key={item.id} href={item.href} className={screen === item.id || (screen === "account" && item.id === "accounts") ? "active" : ""}><b>{item.icon}</b><span>{item.label}</span></Link>)}<button className="notification-button" type="button" onClick={() => setNotificationOpen((value) => !value)}><b>♢</b><span>Notifications</span>{unread ? <i>{unread}</i> : null}</button></nav>
      {notificationOpen ? <section className="notification-popover"><header><strong>Notifications</strong><span>{unread} unread</span></header>{items.length ? items.map((item) => <button key={item.id} className={item.read_at ? "" : "unread"} onClick={() => openNotification(item)}><strong>{item.title}</strong><span>{item.body}</span><small>{dateTime(item.created_at)}</small></button>) : <p>No reply notifications yet.</p>}</section> : null}
      <div className="sidebar-foot"><div className="user-avatar">{initials(user?.name || user?.email || "Preview User")}</div><div><strong>{user?.name || "Preview user"}</strong><small>{user?.email || "Google gate pending"}</small></div></div>
    </aside>
    {mobileOpen && <button className="sidebar-scrim" aria-label="Close menu" onClick={() => setMobileOpen(false)} />}
    <section className="app-stage"><header className="mobile-bar"><button onClick={() => setMobileOpen(true)} aria-label="Open menu">☰</button><Link href="/">DETAILENGINE</Link><span>LIVE</span></header>{children}</section>
  </main>;
}

function RangePicker({ value, onApply, refreshing }: { value: { start: string; end: string }; onApply: (range: { start: string; end: string }) => void; refreshing: boolean }) {
  const [start, setStart] = useState(value.start);
  const [end, setEnd] = useState(value.end);
  const setPreset = (preset: "mtd" | "5d" | "30d") => {
    const finish = isoToday();
    const date = new Date(`${finish}T00:00:00Z`);
    if (preset === "mtd") setStart(monthStart(finish));
    else { date.setUTCDate(date.getUTCDate() - (preset === "5d" ? 4 : 29)); setStart(date.toISOString().slice(0, 10)); }
    setEnd(finish);
  };
  return <div className="range-control"><div className="range-presets"><button onClick={() => setPreset("mtd")}>MTD</button><button onClick={() => setPreset("5d")}>5D</button><button onClick={() => setPreset("30d")}>30D</button></div><label><span>FROM</span><input type="date" value={start} onChange={(event) => setStart(event.target.value)} /></label><label><span>TO</span><input type="date" value={end} onChange={(event) => setEnd(event.target.value)} /></label><button className="apply-range" disabled={refreshing || !start || !end || start > end} onClick={() => onApply({ start, end })}>{refreshing ? "Loading…" : "Apply"}</button></div>;
}

export function CommandCentre({ initialData, dataUrl, screen }: { initialData: CommandCentreData; dataUrl: string; screen: Screen }) {
  const [data, setData] = useState(initialData);
  const [refreshing, setRefreshing] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [reportType, setReportType] = useState<"leads" | "ads" | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  async function refresh(next: { start: string; end: string; cycleId?: string } = data.range) {
    setRefreshing(true);
    try {
      const url = new URL(dataUrl, window.location.origin);
      url.searchParams.set("slug", data.client.slug);
      url.searchParams.set("from", next.start);
      url.searchParams.set("to", next.end);
      if (next.cycleId) url.searchParams.set("cycle_id", next.cycleId);
      url.searchParams.set("t", String(Date.now()));
      const response = await fetch(url.toString());
      if (!response.ok) throw new Error("Refresh failed");
      const nextData = await response.json() as CommandCentreData;
      nextData.workspace.current_user = data.workspace.current_user;
      setData(nextData);
    } finally { setRefreshing(false); }
  }

  return <Shell screen={screen} user={data.workspace.current_user} notifications={data.notifications || []} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen}>
    <div className="page-wrap">
      {screen === "overview" && <CompanyOverview data={data} refreshing={refreshing} onRange={refresh} />}
      {screen === "accounts" && <AccountsPage data={data} />}
      {screen === "manage" && <ManagePage />}
      {screen === "account" && <AccountWorkspace data={data} refreshing={refreshing} onRange={refresh} onReport={setReportType} onSelectLead={setSelectedLead} />}
    </div>
    {reportType && <ReportModal type={reportType} data={data} onClose={() => setReportType(null)} />}
    {selectedLead && <LeadDrawer lead={selectedLead} communications={data.communications.filter((item) => item.lead_id === selectedLead.id)} onClose={() => setSelectedLead(null)} />}
  </Shell>;
}

function PageHeader({ kicker, title, copy, range, refreshing, onRange, action }: { kicker: string; title: string; copy: string; range?: { start: string; end: string }; refreshing?: boolean; onRange?: (range: { start: string; end: string }) => void; action?: React.ReactNode }) {
  return <header className="page-header"><div><span className="kicker">{kicker}</span><h1>{title}</h1><p>{copy}</p></div><div className="header-tools">{action}{range && onRange && <RangePicker value={range} onApply={onRange} refreshing={Boolean(refreshing)} />}</div></header>;
}

function CompanyOverview({ data, refreshing, onRange }: { data: CommandCentreData; refreshing: boolean; onRange: (range: { start: string; end: string }) => void }) {
  const clients = data.workspace.clients;
  const active = clients.filter((client) => ["active", "test", "onboarding"].includes(client.lifecycle_status));
  const total = (key: keyof Performance) => clients.reduce((sum, client) => sum + Number(client.performance[key] || 0), 0);
  const retainers = total("retainer_amount");
  const spend = total("actual_ad_spend");
  const clientRevenue = total("collected_revenue");
  const net = clientRevenue - spend - retainers;
  const riskAccounts = clients.filter((client) => isRisk(client.health_status) || client.integration_issues > 0);
  const transfers = total("warm_transfers");
  const resolved = clients.reduce((sum, client) => sum + client.performance.closed_transfers + client.performance.lost_transfers, 0);
  const topRetainer = Math.max(0, ...clients.map((client) => client.performance.retainer_amount));
  const concentration = retainers > 0 ? topRetainer / retainers * 100 : 0;
  const projectedTransfers = clients.reduce((sum, client) => sum + client.projected_transfers, 0);
  const healthyPct = clients.length ? (clients.length - riskAccounts.length) / clients.length * 100 : 0;
  return <>
    <PageHeader kicker="BOOK OF BUSINESS" title="Company Overview" copy="Revenue, delivery, client outcomes and risk—across every account." range={data.range} refreshing={refreshing} onRange={onRange} />
    <section className="company-hero panel"><div><span>PROJECTED MONTHLY RETAINER REVENUE</span><strong>{money.format(retainers)}</strong><small>{active.length} active accounts · {rangeLabel(data.range.start, data.range.end)}</small></div><div className="health-orbit"><b>{healthyPct.toFixed(0)}%</b><span>portfolio healthy</span></div><div className="hero-facts"><div><span>Projected transfers</span><strong>{count.format(projectedTransfers)}</strong></div><div><span>Accounts at risk</span><strong className={riskAccounts.length ? "bad" : "good-text"}>{riskAccounts.length}</strong></div><div><span>Feedback resolved</span><strong>{transfers ? pct(resolved / transfers * 100, 0) : "—"}</strong></div></div></section>
    <section className="metric-grid company-metrics"><MetricCard label="Client revenue collected" value={money.format(clientRevenue)} note="Closed warm-transfer outcomes" tone="green" /><MetricCard label="Client investment" value={money.format(spend + retainers)} note={`${money.format(spend)} ad spend + retainers`} tone="yellow" /><MetricCard label="Portfolio ROI" value={`${money.format(net)} · ${spend + retainers ? pct(net / (spend + retainers) * 100) : "—"}`} note="Client revenue minus spend and retainers" tone={net >= 0 ? "green" : "orange"} /><MetricCard label="Warm transfers" value={count.format(transfers)} note={`${count.format(total("qualified_leads"))} qualified leads`} tone="blue" /></section>
    <section className="dashboard-grid">
      <PortfolioTrend rows={data.workspace.daily || []} />
      <article className="panel span-4"><div className="panel-head"><div><span className="kicker">TODAY&apos;S BRIEFING</span><h2>Priority work</h2></div><Link href="/accounts">Open queue →</Link></div><div className="briefing-list">{riskAccounts.slice(0, 4).map((client) => <Link href={`/accounts/${client.slug}`} key={client.id}><StatusPill status={client.health_status} /><div><strong>{cleanName(client.display_name)}</strong><small>{client.latest_alerts[0] || `${client.open_feedback || 0} open transfer outcomes`}</small></div></Link>)}{!riskAccounts.length && <div className="empty-good">✓ Portfolio is clear.</div>}</div></article>
      <article className="panel span-8"><div className="panel-head"><div><span className="kicker">ACCOUNT HEALTH</span><h2>Where attention is needed</h2></div><Link href="/accounts">View accounts →</Link></div>{riskAccounts.length ? <div className="attention-list">{riskAccounts.slice(0, 6).map((client) => <Link href={`/accounts/${client.slug}`} key={client.id}><div className="account-badge">{initials(cleanName(client.display_name))}</div><div><strong>{cleanName(client.display_name)}</strong><small>{client.latest_alerts[0] || (client.integration_issues ? `${client.integration_issues} integration issue${client.integration_issues === 1 ? "" : "s"}` : "Delivery is below pace")}</small></div><StatusPill status={client.health_status} /></Link>)}</div> : <div className="empty-good">✓ No account needs immediate attention.</div>}</article>
      <article className="panel span-4"><div className="panel-head"><div><span className="kicker">REVENUE RISK</span><h2>Client concentration</h2></div></div><div className="big-stat">{pct(concentration, 0)}</div><p className="muted">of current retainer revenue comes from the largest account.</p><div className="meter"><i style={{ width: `${Math.min(100, concentration)}%` }} /></div><small className="health-note">Lower concentration means one churn cannot heavily damage company revenue.</small></article>
      <article className="panel span-7"><div className="panel-head"><div><span className="kicker">PORTFOLIO DELIVERY</span><h2>Transfers versus monthly goals</h2></div></div><div className="portfolio-bars">{clients.slice(0, 8).map((client) => { const goal = Number(client.target?.warm_transfer_goal || 0); const progress = goal ? client.performance.warm_transfers / goal * 100 : 0; return <Link href={`/accounts/${client.slug}`} key={client.id}><span>{cleanName(client.display_name)}</span><div><i style={{ width: `${Math.min(100, progress)}%` }} /></div><strong>{client.performance.warm_transfers}/{goal || "—"}</strong></Link>; })}</div></article>
      <TeamLoad clients={clients} />
    </section>
  </>;
}

function PortfolioTrend({ rows }: { rows: WorkspaceDaily[] }) {
  const recent = rows.slice(-30); const max = Math.max(1, ...recent.map((row) => row.spend));
  const last7 = recent.slice(-7); const prior7 = recent.slice(-14, -7);
  const average = (items: WorkspaceDaily[], key: keyof WorkspaceDaily) => items.length ? items.reduce((sum, row) => sum + Number(row[key] || 0), 0) / items.length : 0;
  const spendDelta = average(last7, "spend") - average(prior7, "spend");
  const transferDelta = average(last7, "transfers") - average(prior7, "transfers");
  return <article className="panel span-8 portfolio-trend"><div className="panel-head"><div><span className="kicker">30-DAY OPERATING TREND</span><h2>Spend and warm-transfer flow</h2></div><div className="trend-deltas"><span className={spendDelta <= 0 ? "good-text" : ""}>7D spend {spendDelta >= 0 ? "+" : ""}{money.format(spendDelta)}/day</span><span className={transferDelta >= 0 ? "good-text" : "bad"}>7D transfers {transferDelta >= 0 ? "+" : ""}{transferDelta.toFixed(1)}/day</span></div></div><div className="portfolio-chart">{recent.map((row) => <div key={row.metric_date} title={`${shortDate(row.metric_date)} · ${money.format(row.spend)} · ${row.transfers} transfers`}><i style={{ height: `${Math.max(5, row.spend / max * 100)}%` }}><b>{row.transfers || ""}</b></i><span>{shortDate(row.metric_date)}</span></div>)}{!recent.length && <div className="empty-state">Trend data appears as accounts sync.</div>}</div></article>;
}

function TeamLoad({ clients }: { clients: WorkspaceClient[] }) {
  const groups = (role: "csm" | "media_buyer") => Object.entries(clients.reduce<Record<string, WorkspaceClient[]>>((acc, client) => { const name = client[role] || "Unassigned"; acc[name] = [...(acc[name] || []), client]; return acc; }, {}));
  return <article className="panel span-5"><div className="panel-head"><div><span className="kicker">TEAM LOAD</span><h2>Account ownership</h2></div></div><div className="owner-columns"><div><b>CSMs</b>{groups("csm").map(([name, rows]) => <div key={name}><span>{name}</span><strong>{rows.length}</strong></div>)}</div><div><b>MEDIA BUYERS</b>{groups("media_buyer").map(([name, rows]) => <div key={name}><span>{name}</span><strong>{rows.length}</strong></div>)}</div></div></article>;
}

function AccountsPage({ data }: { data: CommandCentreData }) {
  const [ownerView, setOwnerView] = useState<"csm" | "media_buyer">("csm");
  const [scope, setScope] = useState<"mine" | "all">(data.workspace.current_user ? "mine" : "all");
  const [lifecycle, setLifecycle] = useState("all");
  const [query, setQuery] = useState("");
  const currentIdentity = (data.workspace.current_user?.name || data.workspace.current_user?.email || "").toLowerCase();
  const visible = data.workspace.clients.filter((client) => {
    const matchesMine = scope === "all" || !currentIdentity || [client.csm, client.media_buyer].some((name) => name.toLowerCase().includes(currentIdentity));
    const q = query.trim().toLowerCase();
    return matchesMine && (lifecycle === "all" || client.lifecycle_status === lifecycle) && (!q || [client.display_name, client.general_location, client.csm, client.media_buyer].some((value) => String(value || "").toLowerCase().includes(q)));
  }).sort((a, b) => {
    const owner = String(a[ownerView] || "").localeCompare(String(b[ownerView] || ""));
    if (owner !== 0) return owner;
    if (a.hp_score == null && b.hp_score == null) return a.display_name.localeCompare(b.display_name);
    if (a.hp_score == null) return 1;
    if (b.hp_score == null) return -1;
    return a.hp_score - b.hp_score;
  });
  const active = visible.filter((client) => ["active", "test", "onboarding"].includes(client.lifecycle_status));
  const inactive = visible.filter((client) => !["active", "test", "onboarding"].includes(client.lifecycle_status));
  const generated = new Date(data.generated_at); const hour = generated.getUTCHours();
  const greeting = hour < 5 ? "Working late" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : hour < 22 ? "Good evening" : "Working late";
  const firstName = (data.workspace.current_user?.name || data.workspace.current_user?.email?.split("@")[0] || "Team").split(/[\s.]/)[0];
  const dateLabel = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(generated);
  const monthWindow = `${shortDate(`${monthStart(data.range.end)}T00:00:00Z`)} → ${shortDate(`${data.range.end.slice(0, 7)}-${String(daysInMonth(data.range.end)).padStart(2, "0")}T00:00:00Z`)}`;
  const monthDay = Number(data.range.end.slice(8, 10)); const monthLength = daysInMonth(data.range.end); const monthProgress = Math.min(100, monthDay / monthLength * 100);
  const hpTone = (value: number | null) => value == null ? "unknown" : value >= 80 ? "healthy" : value >= 60 ? "watch" : value >= 40 ? "risk" : "critical";
  const fatigueTone = (value: number | null) => value == null ? "unknown" : value >= 80 ? "critical" : value >= 60 ? "risk" : value >= 40 ? "watch" : "healthy";
  const tableRows = [...active, ...inactive];
  return <section className="accounts-command">
    <header className="accounts-greeting"><span>{dateLabel}</span><h1>{greeting}, <strong>{firstName}.</strong></h1><p>You&apos;re managing <b>{active.length}</b> active account{active.length === 1 ? "" : "s"} · {inactive.length} inactive</p><i /></header>
    <div className="accounts-command-controls"><div className="segmented"><button className={scope === "mine" ? "active" : ""} onClick={() => setScope("mine")}>My accounts</button><button className={scope === "all" ? "active" : ""} onClick={() => setScope("all")}>All accounts</button></div><div className="segmented"><button className={ownerView === "csm" ? "active" : ""} onClick={() => setOwnerView("csm")}>By CSM</button><button className={ownerView === "media_buyer" ? "active" : ""} onClick={() => setOwnerView("media_buyer")}>By media buyer</button></div><select value={lifecycle} onChange={(event) => setLifecycle(event.target.value)}><option value="all">All stages</option><option value="active">Active</option><option value="onboarding">Onboarding</option><option value="paused">Paused</option><option value="test">Test</option></select><label className="command-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search accounts" /></label></div>
    <div className="accounts-command-table"><div className="table-scroll"><table><thead><tr><th>HP</th><th>Account</th><th>Flag</th><th>FTG</th><th>Month</th><th>Month window</th><th>Days</th><th>Leads</th><th>Transfers</th><th>Projected</th><th>CPT goal</th><th>CPT</th><th>Spend</th><th>CTR</th><th>CPC</th><th>CPM</th><th>Freq</th><th>Qual%</th><th>Survey%</th></tr></thead><tbody>{tableRows.map((client) => { const p = client.performance; const hp = client.hp_score; const ftg = client.fatigue_score; const goal = Number(client.target?.warm_transfer_goal || 0); const spendGoal = Number(client.target?.planned_ad_spend || 0); const cptGoal = Number(client.target?.target_cost_per_transfer || 0); const survey = p.clicks ? p.meta_leads / p.clicks * 100 : null; const isActive = active.some((row) => row.id === client.id); const needsAttention = client.integration_issues > 0 || Number(client.open_feedback || 0) > 0 || (hp != null && hp < 60); return <tr key={client.id} className={isActive ? "" : "inactive"} tabIndex={0} onClick={() => window.location.assign(`/accounts/${client.slug}`)} onKeyDown={(event) => { if (event.key === "Enter") window.location.assign(`/accounts/${client.slug}`); }}><td><span className={`hp-score ${hpTone(hp)}`} title="Health score: 90% five-day warm-transfer pace, 10% supporting metrics">{hp ?? "—"}</span></td><td><div className="command-account"><strong>{cleanName(client.display_name)}</strong><small>{client[ownerView] || "Unassigned"} · {client.general_location || client.niche || "—"}</small>{!isActive && <i>INACTIVE</i>}</div></td><td><span className={`attention-dot ${needsAttention ? "alert" : "clear"}`} title={needsAttention ? client.latest_alerts[0] || "Needs attention" : "No active flags"} /></td><td><span className={`ftg-score ${fatigueTone(ftg)}`}>{ftg ?? "—"}</span></td><td><span className="month-label">{new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(new Date(`${data.range.end.slice(0, 7)}-01T00:00:00Z`))}</span></td><td><div className="month-window"><span>{monthWindow}</span><div><i style={{ width: `${monthProgress}%` }} /></div><small>{monthProgress.toFixed(0)}%</small></div></td><td><b className="day-label">Day {monthDay}</b></td><td><b>{p.total_leads}</b></td><td><strong className="transfer-cell">{p.warm_transfers}<small> / {goal || "—"}</small></strong></td><td><span className={(goal && client.projected_transfers < goal) ? "metric-bad" : "metric-good"}>{client.projected_transfers.toFixed(0)}</span></td><td>{cptGoal ? preciseMoney.format(cptGoal) : "—"}</td><td><span className={p.cost_per_transfer && cptGoal && p.cost_per_transfer > cptGoal ? "metric-bad" : ""}>{p.cost_per_transfer == null ? "—" : preciseMoney.format(p.cost_per_transfer)}</span></td><td><div className="spend-cell"><strong>{money.format(p.actual_ad_spend)}<small>/{money.format(spendGoal)}</small></strong><span>{spendGoal ? `${money.format(spendGoal / monthLength)}/day` : "No plan"}</span></div></td><td><span className={Number(p.ctr_percent || 0) >= 1.2 ? "metric-good" : "metric-bad"}>{pct(p.ctr_percent, 2)}</span></td><td>{p.cpc == null ? "—" : preciseMoney.format(p.cpc)}</td><td>{p.cpm == null ? "—" : preciseMoney.format(p.cpm)}</td><td><span className={Number(p.frequency || 0) > 2.5 ? "metric-warn" : "metric-good"}>{p.frequency == null ? "—" : p.frequency.toFixed(2)}</span></td><td><span className={Number(p.qualification_rate || 0) >= 35 ? "metric-good" : "metric-bad"}>{pct(p.qualification_rate, 0)}</span></td><td><span className={Number(survey || 0) >= 5 ? "metric-good" : "metric-bad"}>{pct(survey, 2)}</span></td></tr>; })}</tbody></table>{!tableRows.length && <div className="command-empty">No accounts match these filters.</div>}</div></div>
  </section>;
}

function AccountWorkspace({ data, refreshing, onRange, onReport, onSelectLead }: { data: CommandCentreData; refreshing: boolean; onRange: (range: { start: string; end: string; cycleId?: string }) => Promise<void>; onReport: (type: "leads" | "ads") => void; onSelectLead: (lead: Lead) => void }) {
  return <AccountStatusWorkspace
    key={`${data.client.id}:${data.account_status?.cycle?.id || "calendar"}:${data.range.start}:${data.range.end}`}
    data={data}
    refreshing={refreshing}
    onRange={onRange}
    onReport={onReport}
    overview={(open) => <PerformanceTab data={data} onOpenAds={() => open("campaigns")} />}
    leads={<LeadsTab data={data} onSelect={onSelectLead} />}
    comparison={<MonthComparison months={data.months} />}
    campaigns={<AdsManager data={data} />}
  />;
}

function PerformanceTab({ data, onOpenAds }: { data: CommandCentreData; onOpenAds: () => void }) {
  const p = data.performance;
  const target = data.monthly_target;
  const day = Math.max(1, Number(data.range.end.slice(8, 10)));
  const monthDays = daysInMonth(data.range.end);
  const elapsed = Math.min(100, day / monthDays * 100);
  const delivery = target?.warm_transfer_goal ? p.warm_transfers / target.warm_transfer_goal * 100 : 0;
  const hp = data.account_status?.hp;
  return <>
    <section className="delivery-hero panel"><div><span className="kicker">CYCLE DELIVERY PACE</span><h2>{p.warm_transfers} of {target?.warm_transfer_goal || "—"} warm transfers</h2><p>{hp?.projected_total_transfers == null ? "Projection unavailable until budget, spend and transfer goal are present." : `${hp.projected_total_transfers.toFixed(1)} forecast from four-day CPT and remaining budget · ${pct(hp.goal_percent)} of goal`}</p></div><div className="pace-score"><strong>{hp?.score ?? "—"}</strong><span>HP score</span></div><div className="pace-track"><i style={{ width: `${Math.min(100, hp?.goal_percent || delivery)}%` }} /><b style={{ left: `${elapsed}%` }} title={`${elapsed.toFixed(0)}% of month elapsed`} /></div><footer><span>{p.warm_transfers} delivered</span><span>{hp?.recent_cpt == null ? "4-day CPT unavailable" : `${preciseMoney.format(hp.recent_cpt)} 4-day CPT`}</span><span>{money.format(hp?.remaining_budget || 0)} budget remaining</span></footer></section>
    <section className="metric-grid"><MetricCard label="Total leads" value={count.format(p.total_leads)} note={`${count.format(p.meta_leads)} recorded by Meta`} /><MetricCard label="Qualified" value={count.format(p.qualified_leads)} note={`${pct(p.qualification_rate)} qualification rate`} tone="blue" /><MetricCard label="Warm transfers" value={count.format(p.warm_transfers)} note={`${pct(p.transfer_rate)} of qualified leads`} tone="orange" /><MetricCard label="Speed to lead" value={p.average_speed_to_lead_minutes ? `${p.average_speed_to_lead_minutes.toFixed(1)}m` : "—"} note="Average first response" tone="yellow" /></section>
    <section className="dashboard-grid">
      <article className="panel span-12 roi-card"><div className="panel-head"><div><span className="kicker">REAL CLIENT ROI</span><h2>Collected revenue, not pipeline</h2></div><StatusPill status={p.roi_dollars >= 0 ? "positive" : "negative"} /></div><div className="roi-equation"><div><span>Collected revenue</span><strong>{money.format(p.collected_revenue)}</strong></div><b>−</b><div><span>Actual ad spend</span><strong>{money.format(p.actual_ad_spend)}</strong></div><b>−</b><div><span>Retainer</span><strong>{money.format(p.retainer_amount)}</strong></div><b>=</b><div className={p.roi_dollars >= 0 ? "positive" : "negative"}><span>Return</span><strong>{money.format(p.roi_dollars)}</strong><small>{pct(p.roi_percent)}</small></div></div><div className="outcome-strip"><div><strong>{p.closed_transfers}</strong><span>Closed</span></div><div><strong>{p.in_sales_process}</strong><span>Sales process</span></div><div><strong>{p.pending_payment}</strong><span>Pending payment</span></div><div><strong>{p.lost_transfers}</strong><span>Lost</span></div><div><strong>{p.awaiting_feedback}</strong><span>Awaiting</span></div></div></article>
      <article className="panel span-12"><div className="panel-head"><div><span className="kicker">META PERFORMANCE</span><h2>Delivery and economics</h2></div><button className="text-button" onClick={onOpenAds}>Open Ads Manager →</button></div><div className="stat-matrix"><SmallStat label="Spend" value={money.format(p.actual_ad_spend)} /><SmallStat label="CPL" value={p.cost_per_lead == null ? "—" : preciseMoney.format(p.cost_per_lead)} /><SmallStat label="CPQL" value={p.cost_per_qualified_lead == null ? "—" : preciseMoney.format(p.cost_per_qualified_lead)} /><SmallStat label="Cost / transfer" value={p.cost_per_transfer == null ? "—" : preciseMoney.format(p.cost_per_transfer)} /><SmallStat label="CTR" value={pct(p.ctr_percent, 2)} /><SmallStat label="CPC" value={p.cpc == null ? "—" : preciseMoney.format(p.cpc)} /><SmallStat label="CPM" value={p.cpm == null ? "—" : preciseMoney.format(p.cpm)} /><SmallStat label="Frequency" value={p.frequency == null ? "—" : p.frequency.toFixed(2)} /></div><MiniBars rows={data.ad_metrics} metric="spend" /></article>
    </section>
  </>;
}

function SmallStat({ label, value }: { label: string; value: string }) { return <div className="small-stat"><span>{label}</span><strong>{value}</strong></div>; }
function MiniBars({ rows, metric }: { rows: DailyMetric[]; metric: "spend" | "leads" | "clicks" | "impressions" }) { const latest = rows.slice(-14); const max = Math.max(1, ...latest.map((row) => Number(row[metric] || 0))); return <div className="mini-bars">{latest.map((row) => <div key={row.metric_date} title={`${shortDate(row.metric_date)}: ${row[metric]}`}><i style={{ height: `${Math.max(4, Number(row[metric] || 0) / max * 100)}%` }} /><span>{shortDate(row.metric_date)}</span></div>)}</div>; }
function ChangeLog({ days }: { days: ChangeDay[] }) { return <div className="change-log">{days.length ? days.map((day) => <div key={day.action_date}><time>{shortDate(day.action_date)}<b>{day.total_actions} actions</b></time><section>{day.actions.map((action, index) => <p key={`${action.action}-${index}`}><i />{action.summary}</p>)}</section></div>) : <div className="empty-state">No Meta changes in this range.</div>}</div>; }

function MonthComparison({ months }: { months: Performance[] }) {
  const [first, setFirst] = useState(Math.min(1, Math.max(0, months.length - 1)));
  const [second, setSecond] = useState(0);
  const a = months[first]; const b = months[second];
  const metrics: Array<[string, keyof Performance, "money" | "number" | "percent", boolean]> = [["Leads", "total_leads", "number", true], ["Qualified", "qualified_leads", "number", true], ["Transfers", "warm_transfers", "number", true], ["Spend", "actual_ad_spend", "money", false], ["CPL", "cost_per_lead", "money", false], ["Client ROI", "roi_percent", "percent", true]];
  const monthName = (value: string) => new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
  const format = (value: number, type: string) => type === "money" ? money.format(value) : type === "percent" ? pct(value) : count.format(value);
  return <article className="panel span-12 comparison-panel"><div className="panel-head"><div><span className="kicker">MONTH COMPARISON</span><h2>Compare any two calendar months</h2></div><div className="comparison-selects"><select value={first} onChange={(event) => setFirst(Number(event.target.value))}>{months.map((month, index) => <option key={month.month_start} value={index}>{monthName(month.month_start)}</option>)}</select><span>vs</span><select value={second} onChange={(event) => setSecond(Number(event.target.value))}>{months.map((month, index) => <option key={month.month_start} value={index}>{monthName(month.month_start)}</option>)}</select></div></div>{a && b ? <div className="comparison-grid">{metrics.map(([label, key, type, higherIsBetter]) => { const av = Number(a[key] || 0); const bv = Number(b[key] || 0); const change = av ? (bv - av) / Math.abs(av) * 100 : null; const improved = change == null ? null : higherIsBetter ? change >= 0 : change <= 0; return <div key={key}><span>{label}</span><strong>{format(bv, type)}</strong><small>was {format(av, type)}</small><b className={improved == null ? "" : improved ? "good-text" : "bad"}>{change == null ? "—" : `${change >= 0 ? "↑" : "↓"} ${Math.abs(change).toFixed(0)}%`}</b></div>; })}</div> : <div className="empty-state">A comparison appears after two months are stored.</div>}</article>;
}

function LeadsTab({ data, onSelect }: { data: CommandCentreData; onSelect: (lead: Lead) => void }) {
  const [filter, setFilter] = useState<LeadFilter>("all"); const [query, setQuery] = useState("");
  const filtered = useMemo(() => data.leads.filter((lead) => { const q = query.toLowerCase(); const matches = !q || [lead.full_name, lead.email, lead.phone, lead.source, lead.campaign].some((value) => String(value || "").toLowerCase().includes(q)); const status = String(lead.qualification_status || "").toLowerCase(); return matches && (filter === "all" || (filter === "transferred" && Boolean(lead.outcome)) || (filter === "qualified" && lead.is_qualified) || (filter === "unqualified" && ["unqualified", "disqualified", "not_qualified"].includes(status)) || (filter === "open" && (!lead.outcome || ["awaiting_feedback", "sales_process", "pending_payment"].includes(lead.outcome.status)))); }), [data.leads, filter, query]);
  const cycleDays = Math.max(1, Math.floor((Date.parse(data.range.end) - Date.parse(data.range.start)) / 86400000) + 1);
  const weeks = data.leads.reduce<Record<string, Lead[]>>((acc, lead) => { const offset = Math.max(0, Math.floor((Date.parse(lead.submitted_at.slice(0, 10)) - Date.parse(data.range.start)) / 86400000)); const key = `Week ${Math.min(4, Math.floor(offset * 4 / cycleDays) + 1)}`; acc[key] = [...(acc[key] || []), lead]; return acc; }, {});
  return <section className="panel page-panel"><div className="panel-head large"><div><span className="kicker">LEAD BREAKDOWN</span><h2>Every lead. Every real outcome.</h2><p>{rangeLabel(data.range.start, data.range.end)}</p></div><label className="search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search leads" /></label></div><div className="week-grid">{Object.entries(weeks).map(([week, leads]) => <div key={week}><span>{week}</span><strong>{leads.length}</strong><small>{leads.filter((row) => row.is_qualified).length} qualified · {leads.filter((row) => row.outcome).length} transferred</small></div>)}</div><div className="filter-tabs">{(["all", "transferred", "qualified", "unqualified", "open"] as LeadFilter[]).map((item) => <button className={filter === item ? "active" : ""} key={item} onClick={() => setFilter(item)}>{item}</button>)}</div><LeadTable leads={filtered} onSelect={onSelect} /></section>;
}

function LeadTable({ leads, onSelect }: { leads: Lead[]; onSelect: (lead: Lead) => void }) { return <div className="table-scroll"><table className="data-table lead-table"><thead><tr><th>Lead</th><th>Submitted</th><th>Source</th><th>Qualification</th><th>Warm transfer</th><th>Outcome</th><th>Ticket</th><th /></tr></thead><tbody>{leads.map((lead) => <tr key={lead.id} onClick={() => onSelect(lead)}><td><div className="table-identity"><span>{initials(lead.full_name)}</span><div><strong>{lead.full_name}</strong><small>{lead.phone || lead.email || "No contact"}</small></div></div></td><td>{shortDate(lead.submitted_at)}</td><td><strong>{lead.source || "—"}</strong><small>{lead.campaign || "No campaign"}</small></td><td><StatusPill status={lead.qualification_status || "pending"} /></td><td>{lead.outcome ? "Completed" : "—"}</td><td><StatusPill status={lead.outcome ? lead.outcome.status : "not transferred"} /></td><td>{lead.outcome?.status === "closed" ? money.format(lead.outcome.collected_revenue) : "—"}</td><td>→</td></tr>)}</tbody></table>{!leads.length && <div className="empty-state">No leads match this view.</div>}</div>; }

function AdsManager({ data }: { data: CommandCentreData }) {
  const [level, setLevel] = useState<"campaign" | "ad_set" | "ad">("campaign");
  const [windowMode, setWindowMode] = useState<"cycle" | "quarter" | "daily">("cycle");
  const [selected, setSelected] = useState<string[]>([]); const [creative, setCreative] = useState<AdEntity | null>(null);
  const [showIntelligenceLog, setShowIntelligenceLog] = useState(false);
  const entityByExternal = useMemo(() => new Map(data.ad_entities.map((row) => [row.external_id, row])), [data.ad_entities]);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      try {
        const saved = localStorage.getItem(`de-ad-selection:${data.client.slug}`);
        if (active && saved) setSelected(JSON.parse(saved));
      } catch {}
    });
    return () => { active = false; };
  }, [data.client.slug]);
  useEffect(() => { try { localStorage.setItem(`de-ad-selection:${data.client.slug}`, JSON.stringify(selected)); } catch {} }, [data.client.slug, selected]);
  const selectedEntities = selected.map((id) => data.ad_entities.find((entity) => entity.id === id)).filter(Boolean) as AdEntity[];
  const selectedCampaigns = new Set(selectedEntities.filter((row) => row.entity_type === "campaign").map((row) => row.external_id));
  const selectedAdSets = new Set(selectedEntities.filter((row) => row.entity_type === "ad_set").map((row) => row.external_id));
  const campaignFilter = String(data.account_status?.cycle?.campaign_filter || "").trim().toLowerCase();
  const eligible = data.ad_entity_performance.filter((row) => {
    if (row.entity_type !== level) return false;
    if (level === "ad_set" && selectedCampaigns.size) return selectedCampaigns.has(String(row.parent_external_id || ""));
    if (level === "ad" && selectedAdSets.size) return selectedAdSets.has(String(row.parent_external_id || ""));
    if (level === "ad" && selectedCampaigns.size) return selectedCampaigns.has(String(entityByExternal.get(String(row.parent_external_id || ""))?.parent_external_id || ""));
    if (!campaignFilter) return true;
    const entity = entityByExternal.get(row.external_id);
    const parent = entityByExternal.get(String(entity?.parent_external_id || ""));
    const grandparent = entityByExternal.get(String(parent?.parent_external_id || ""));
    const campaign = row.entity_type === "campaign" ? row : row.entity_type === "ad_set" ? parent : grandparent;
    return [campaign?.name, campaign?.external_id].some((value) => String(value || "").toLowerCase().includes(campaignFilter));
  });
  const cycleStart = data.account_status?.cycle?.starts_on || data.range.start;
  const cycleDays = data.account_status?.cycle_days || data.range.days;
  const cycleDay = data.account_status?.cycle_day || data.range.days;
  const quarterLength = Math.max(1, Math.ceil(cycleDays / 4));
  const quarterStart = addIsoDays(cycleStart, Math.floor(Math.max(0, cycleDay - 1) / quarterLength) * quarterLength);
  const cutoff = windowMode === "daily" ? data.range.end : windowMode === "quarter" ? quarterStart : cycleStart;
  const rowMetrics = eligible.map((base) => {
    const daily = data.ad_entity_daily_metrics.filter((item) => item.ad_entity_id === base.ad_entity_id && item.metric_date >= cutoff && item.metric_date <= data.range.end);
    const useDaily = windowMode !== "cycle";
    const sum = (key: keyof AdEntityDaily) => daily.reduce((total, item) => total + Number(item[key] || 0), 0);
    const spend = useDaily ? sum("spend") : base.spend;
    const impressions = useDaily ? sum("impressions") : base.impressions;
    const clicks = useDaily ? sum("clicks") : base.clicks;
    const frequency = daily.length ? daily.reduce((total, item) => total + Number(item.frequency || 0), 0) / daily.length : base.frequency;
    const attributed = data.leads.filter((lead) => lead.submitted_at.slice(0, 10) >= cutoff && lead.submitted_at.slice(0, 10) <= data.range.end && (level === "campaign" ? lead.campaign_external_id === base.external_id : level === "ad_set" ? lead.ad_set_external_id === base.external_id : lead.ad_external_id === base.external_id));
    const metaLeads = useDaily ? sum("leads") : base.leads;
    const leads = metaLeads;
    const transfers = attributed.filter((lead) => Boolean(lead.outcome)).length;
    const speeds = attributed.map((lead) => Number(lead.speed_to_lead_minutes)).filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
    const medianSpeed = speeds.length ? speeds[Math.floor(speeds.length / 2)] : null;
    const outbound = sum("outbound_clicks");
    return { ...base, spend, impressions, clicks, frequency, leads, warm_transfers: transfers, cpc: clicks ? spend / clicks : null, ctr_percent: impressions ? clicks / impressions * 100 : null, cpm: impressions ? spend / impressions * 1000 : null, cost_per_lead: leads ? spend / leads : null, cost_per_transfer: transfers ? spend / transfers : null, survey: outbound ? leads / outbound * 100 : null, medianSpeed, attributed };
  }).sort((a, b) => b.spend - a.spend);
  const rows = rowMetrics;
  const totalSpend = rows.reduce((sum, row) => sum + row.spend, 0);
  const configuredDaily = data.ad_entities.reduce((sum, entity) => { const config = entity.config || {}; const cents = Number(config.daily_budget_cents || 0); const value = cents ? cents / 100 : Number(config.daily_budget || config.dailyBudget || 0); const isCampaign = entity.entity_type === "campaign" && value > 0; const isAboSet = entity.entity_type === "ad_set" && value > 0 && !entityByExternal.get(String(entity.parent_external_id || ""))?.config?.daily_budget; return sum + (isCampaign || isAboSet ? value : 0); }, 0);
  const recByEntity = new Map(data.greg.recommendations.map((row) => [row.external_entity_id, row]));
  const latestAudit = data.greg.audits[0];
  const target = data.monthly_target;
  const toggle = (id: string) => setSelected((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]);
  const visibleIds = rows.map((row) => row.ad_entity_id); const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));
  const metaIntegration = data.client.integrations.find((row) => row.provider === "meta");
  const openMeta = () => { if (!metaIntegration?.external_account_id) return; const account = metaIntegration.external_account_id.replace(/^act_/, ""); window.open(`https://business.facebook.com/adsmanager/manage/campaigns?act=${encodeURIComponent(account)}`, "_blank", "noopener,noreferrer"); };
  const levelCount = (entityLevel: "campaign" | "ad_set" | "ad") => data.ad_entities.filter((row) => row.entity_type === entityLevel).length;
  return <>
    <section className="panel unified-ads-manager">
      <header className="ads-console-heading"><span className="ads-console-mark">DE</span><div><span className="kicker">DETAILENGINE MEDIA OPERATIONS</span><h2>Ads Manager <em>+ Intelligence</em></h2><p>Manage every Meta layer with the reason behind every recommendation.</p></div><b>ADVISE ONLY</b></header>
      <div className="manager-topbar"><button className="meta-link" onClick={openMeta} disabled={!metaIntegration?.external_account_id}>ⓕ View selected in Meta ↗</button><span className="daily-budget">{money.format(configuredDaily)}/day <b>· {selected.length || levelCount("campaign")} selected</b></span><div className="manager-controls"><span>CAMPAIGN VIEW:</span><div className="segmented"><button className={windowMode === "daily" ? "active" : ""} onClick={() => setWindowMode("daily")}>Daily</button><button className={windowMode === "quarter" ? "active" : ""} onClick={() => setWindowMode("quarter")}>Quarter</button><button className={windowMode === "cycle" ? "active" : ""} onClick={() => setWindowMode("cycle")}>Full cycle</button></div></div></div>
      <IntelligenceGoals target={target} audit={latestAudit} />
      <div className="manager-levelbar"><div className="manager-levels">{(["campaign", "ad_set", "ad"] as const).map((item) => <button key={item} className={`${level === item ? "active" : ""} level-${item}`} onClick={() => setLevel(item)}>{item === "ad_set" ? "Ad Sets" : item === "ad" ? "Ads" : "Campaigns"} <b>{levelCount(item)}</b></button>)}</div><div className="greg-controls"><span>◆ <b>DetailEngine Intelligence</b></span><i>Advise only</i><button onClick={() => setShowIntelligenceLog(!showIntelligenceLog)}>Intelligence log</button></div></div>
      {selectedCampaigns.size > 0 && level !== "campaign" && <div className="selection-context">Showing children of {selectedCampaigns.size} selected campaign{selectedCampaigns.size === 1 ? "" : "s"}. <button onClick={() => setSelected((items) => items.filter((id) => !selectedEntities.find((entity) => entity.id === id && entity.entity_type === "campaign")))}>Clear campaign filter</button></div>}
      {selectedAdSets.size > 0 && level === "ad" && <div className="selection-context">Showing ads from {selectedAdSets.size} selected ad set{selectedAdSets.size === 1 ? "" : "s"}. <button onClick={() => setSelected((items) => items.filter((id) => !selectedEntities.find((entity) => entity.id === id && entity.entity_type === "ad_set")))}>Clear ad set filter</button></div>}
      <div className="table-scroll"><table className={`ads-management-table entity-${level}`}><thead><tr><th><input type="checkbox" checked={allVisibleSelected} onChange={() => setSelected((items) => allVisibleSelected ? items.filter((id) => !visibleIds.includes(id)) : Array.from(new Set([...items, ...visibleIds])))} aria-label="Select all visible" /></th><th>Status</th><th>{level === "campaign" ? "Campaign" : level === "ad_set" ? "Ad set" : "Ad"}</th><th>Results</th><th>CPR</th><th>Leads</th><th>CPL</th><th>Spend</th><th>CPC</th><th>CTR</th><th>Freq</th><th>CPM</th><th>Clicks</th><th>Survey</th><th>Med S2L</th></tr></thead><tbody>{rows.map((row) => { const entity = entityByExternal.get(row.external_id); const config = entity?.config || {}; const rec = recByEntity.get(row.external_id); const dailyBudget = Number(config.daily_budget_cents || 0) ? Number(config.daily_budget_cents) / 100 : Number(config.daily_budget || config.dailyBudget || 0); const children = data.ad_entities.filter((item) => item.parent_external_id === row.external_id); const activeChildren = children.filter((item) => String(item.effective_status || item.status).toLowerCase() === "active").length; const detail = level === "campaign" ? `${children.filter((item) => item.entity_type === "ad_set").length} ad sets · ${activeChildren}/${children.length} active` : level === "ad_set" ? `${children.length} ads · ${activeChildren}/${children.length} active` : String(config.headline || config.primary_text || "Creative"); const sentences = (rec?.reason || "DetailEngine Intelligence will grade this entity after the next media audit.").split(/(?<=[.!?])\s+/).filter(Boolean); return <Fragment key={row.ad_entity_id}><tr className="entity-row"><td><input type="checkbox" checked={selected.includes(row.ad_entity_id)} onChange={() => toggle(row.ad_entity_id)} aria-label={`Select ${row.name}`} /></td><td><span className={`entity-status ${String(row.effective_status || row.status).toLowerCase() === "active" ? "active" : "paused"}`}>{statusText(row.effective_status || row.status || "unknown")}</span></td><td><button className="entity-name" onClick={() => level === "ad" && setCreative(entity || null)}>{level === "ad" && typeof config.thumbnail_url === "string" && <img src={config.thumbnail_url} alt="" />}<span><strong>{row.name}</strong><small>{detail}{dailyBudget ? ` · ${money.format(dailyBudget)}/day` : ""}</small></span></button></td><td><strong>{row.warm_transfers}</strong></td><td>{row.cost_per_transfer == null ? "—" : preciseMoney.format(row.cost_per_transfer)}</td><td><strong>{row.leads}</strong><small>META</small></td><td className={row.cost_per_lead && target?.target_cpl && row.cost_per_lead > target.target_cpl ? "bad" : ""}>{row.cost_per_lead == null ? "—" : preciseMoney.format(row.cost_per_lead)}</td><td><strong>{money.format(row.spend)}</strong><div className="spend-share"><i style={{ width: `${totalSpend ? row.spend / totalSpend * 100 : 0}%` }} /></div></td><td>{row.cpc == null ? "—" : preciseMoney.format(row.cpc)}</td><td>{pct(row.ctr_percent, 2)}</td><td>{row.frequency == null ? "—" : row.frequency.toFixed(2)}</td><td>{row.cpm == null ? "—" : preciseMoney.format(row.cpm)}</td><td>{count.format(row.clicks)}</td><td>{pct(row.survey, 2)}</td><td>{row.medianSpeed == null ? "—" : `${row.medianSpeed.toFixed(0)}m`}</td></tr><tr className={`greg-decision-row verdict-${rec?.verdict || "hold"}`}><td colSpan={15}><div><span className={`verdict verdict-${rec?.verdict || "hold"}`}>🤖 {String(rec?.evidence?.greg_label || rec?.verdict || "Watch")}</span>{sentences.length > 1 && level !== "ad" ? <ul>{sentences.map((sentence) => <li key={sentence}>{sentence}</li>)}</ul> : <p>{sentences.join(" ")}</p>}</div></td></tr></Fragment>; })}</tbody></table>{!rows.length && <div className="empty-state">No {statusText(level)} data matches the current selection.</div>}</div>
      {showIntelligenceLog && <div className="greg-log-inline">{data.greg.audits.map((row) => <article key={row.id}><time>{shortDate(row.audit_date)}</time><StatusPill status={row.health_status} /><div><strong>{row.headline}</strong><p>{row.summary}</p></div></article>)}{!data.greg.audits.length && <div className="empty-state">No media intelligence audits yet.</div>}</div>}
    </section>
    <section className="dashboard-grid"><article className="panel span-7"><div className="panel-head"><div><span className="kicker">DAILY DETAIL</span><h2>Account performance by day</h2></div></div><div className="table-scroll"><table className="data-table compact"><thead><tr><th>Date</th><th>Spend</th><th>Impressions</th><th>Clicks</th><th>Meta leads</th><th>CTR</th><th>CPC</th><th>Frequency</th></tr></thead><tbody>{data.ad_metrics.map((row) => <tr key={row.metric_date}><td>{shortDate(row.metric_date)}</td><td>{money.format(row.spend)}</td><td>{count.format(row.impressions)}</td><td>{row.clicks}</td><td>{row.leads}</td><td>{pct(row.link_ctr, 2)}</td><td>{row.link_cpc == null ? "—" : preciseMoney.format(row.link_cpc)}</td><td>{row.frequency == null ? "—" : Number(row.frequency).toFixed(2)}</td></tr>)}</tbody></table></div></article><article className="panel span-5"><div className="panel-head"><div><span className="kicker">META CHANGELOG</span><h2>Recent changes</h2></div></div><ChangeLog days={data.ad_changelog} /></article></section>
    {creative && <CreativeDrawer entity={creative} onClose={() => setCreative(null)} />}
  </>;
}

function IntelligenceGoals({ target, audit }: { target: MonthlyTarget | null; audit?: GregAudit }) {
  const goal = Number(target?.target_cpl || 0); const mode = String(audit?.metrics?.operating_mode || "standard"); const pace = Number(audit?.metrics?.transfer_pace || 0) * 100; const cpcLimit = Number(audit?.metrics?.cpc_limit || 4.2);
  const stage = (label: string, leads: string, multiple: number, tone: string, copy: string) => <div className={tone}><header><b>{label}</b><span>{leads}</span></header><small>{goal ? `${copy} ${preciseMoney.format(goal * multiple)}` : "Set a CPL target"}</small></div>;
  return <section className="greg-goals"><header><div><span className="greg-mark">DE</span><span><b>Media intelligence guardrails</b><small>DetailEngine media intelligence</small></span><i>{statusText(mode)} · {pace ? `${pace.toFixed(0)}% of pace` : "pace pending"}</i></div><small>More proven leads earn more room to spend.</small></header><div className="greg-goal-grid"><div><b>COST PER LEAD</b><strong>{goal ? `≤ ${money.format(goal)}` : "Not set"}</strong><small>Primary decision metric</small></div><div><b>COST PER CLICK</b><strong>≤ {preciseMoney.format(cpcLimit)}</strong><small>Only used for no-lead ads in Struggling mode</small></div><div><b>MODE</b><strong>{statusText(mode)}</strong><small>CPL first · CPC is conditional</small></div>{stage("Zero", "0 leads", 1.2, "zero", "Pause near")}{stage("One", "1 lead", 1.8, "one", "Pause at CPL ≥")}{stage("Low", "2–3 leads", 1.4, "low", "Pause at CPL ≥")}{stage("Proven", "4+ leads", 1.375, "proven", "Pause at CPL ≥")}</div></section>;
}

function ActivityList({ items }: { items: Communication[] }) { return <div className="activity-list">{items.map((item) => <article key={item.id}><span className={item.lead_id ? "lead" : "client"}>{item.channel === "phone" ? "☎" : "✉"}</span><div><header><strong>{item.sender_name || (item.direction === "outbound" ? "DetailEngine" : "Contact")}</strong><StatusPill status={item.lead_id ? "lead" : "client"} /></header><p>{item.body_text || `${statusText(item.event_type)}${item.duration_seconds ? ` · ${Math.round(item.duration_seconds / 60)} min` : ""}`}</p><small>{dateTime(item.occurred_at)} · {item.direction}</small></div></article>)}{!items.length && <div className="empty-state">No communications in this range.</div>}</div>; }

function ManagePage() {
  const [open, setOpen] = useState(false); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setMessage(""); const form = new FormData(event.currentTarget); const payload = Object.fromEntries(form.entries()); try { const response = await fetch("/api/manage-client", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", ...payload }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error || "Could not add account"); setMessage("Account created. Refreshing…"); setTimeout(() => window.location.assign(`/accounts/${body.client.slug}`), 700); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not add account"); } finally { setBusy(false); } }
  return <>
    <PageHeader kicker="COMPANY ADMIN" title="Manage" copy="Company-wide tools only." action={<button className="primary-button" onClick={() => setOpen(true)}>＋ Add a client</button>} />
    <section className="panel manage-empty"><div className="manage-mark">＋</div><span className="kicker">CLIENT MANAGEMENT</span><h2>Add a DetailEngine client</h2><p>Account-specific connectors and settings live inside each client account.</p><button className="primary-button" onClick={() => setOpen(true)}>Add a client</button>{message && <p className="manage-message">{message}</p>}</section>
    {open && <div className="modal-backdrop" onClick={() => setOpen(false)}><form className="modal-card account-form" onSubmit={submit} onClick={(event) => event.stopPropagation()}><header><div><span className="kicker">NEW CLIENT</span><h2>Add a DetailEngine client</h2></div><button type="button" onClick={() => setOpen(false)}>×</button></header><div className="form-grid"><label><span>COMPANY NAME</span><input required name="display_name" placeholder="Shine Auto Studio" /></label><label><span>LOCATION</span><input required name="general_location" placeholder="Austin, TX" /></label><label><span>NICHE</span><input name="niche" defaultValue="Auto detailing" /></label><label><span>TIMEZONE</span><input name="timezone" defaultValue="America/Chicago" /></label><label><span>MONTHLY RETAINER</span><input required name="retainer_amount" type="number" min="0" placeholder="2500" /></label><label><span>PLANNED AD SPEND</span><input required name="planned_ad_spend" type="number" min="0" placeholder="3000" /></label><label><span>TRANSFER GOAL</span><input required name="warm_transfer_goal" type="number" min="0" placeholder="20" /></label></div>{message && <p className="form-message">{message}</p>}<button className="primary-button" disabled={busy}>{busy ? "Creating…" : "Create client"}</button></form></div>}
  </>;
}

function ReportModal({ type, data, onClose }: { type: "leads" | "ads"; data: CommandCentreData; onClose: () => void }) { const [start, setStart] = useState(monthStart()); const [end, setEnd] = useState(isoToday()); const openReport = () => { const url = new URL("/api/report", window.location.origin); url.searchParams.set("slug", data.client.slug); url.searchParams.set("type", type); url.searchParams.set("from", start); url.searchParams.set("to", end); window.open(url.toString(), "_blank", "noopener,noreferrer"); }; return <div className="modal-backdrop" onClick={onClose}><section className="modal-card report-modal" onClick={(event) => event.stopPropagation()}><header><div><span className="kicker">{type === "leads" ? "LEAD REPORT" : "AD METRICS REPORT"}</span><h2>Choose the reporting range</h2></div><button onClick={onClose}>×</button></header><p>Defaults to month-to-date. Choose any valid range before generating the PDF.</p><div className="form-grid"><label><span>FROM</span><input type="date" value={start} onChange={(event) => setStart(event.target.value)} /></label><label><span>TO</span><input type="date" value={end} onChange={(event) => setEnd(event.target.value)} /></label></div><button className="primary-button" disabled={!start || !end || start > end} onClick={openReport}>Generate PDF →</button></section></div>; }

function LeadDrawer({ lead, communications, onClose }: { lead: Lead; communications: Communication[]; onClose: () => void }) { return <div className="drawer-backdrop" onClick={onClose}><aside className="drawer" onClick={(event) => event.stopPropagation()}><header><span className="kicker">LEAD RECORD</span><button onClick={onClose}>×</button></header><div className="drawer-person"><span>{initials(lead.full_name)}</span><div><h2>{lead.full_name}</h2><p>{lead.phone} · {lead.email}</p></div></div><div className="drawer-status"><StatusPill status={lead.qualification_status || "pending"} /><StatusPill status={lead.outcome ? lead.outcome.status : "not transferred"} /></div><section><span className="kicker">ATTRIBUTION</span><div className="stat-matrix"><SmallStat label="Source" value={lead.source || "—"} /><SmallStat label="Campaign" value={lead.campaign || "—"} /><SmallStat label="Submitted" value={shortDate(lead.submitted_at)} /><SmallStat label="Speed to lead" value={lead.speed_to_lead_minutes ? `${lead.speed_to_lead_minutes}m` : "—"} /></div></section><section><span className="kicker">QUALIFICATION</span><h3>{lead.is_qualified ? "Qualified opportunity" : statusText(lead.qualification_status || "Pending")}</h3><p>{lead.qualification_reason || lead.not_qualified_reason || "No qualification note is stored yet."}</p></section>{lead.outcome && <section><span className="kicker">TRANSFER OUTCOME</span><h3>{statusText(lead.outcome.status)}</h3><p>{lead.outcome.feedback_note || lead.outcome.lost_reason || "Awaiting client detail."}</p>{lead.outcome.status === "closed" && <div className="ticket">Collected ticket <strong>{money.format(lead.outcome.collected_revenue)}</strong></div>}</section>}<section><span className="kicker">GHL CONVERSATION</span><ActivityList items={communications} /></section></aside></div>; }

function CreativeDrawer({ entity, onClose }: { entity: AdEntity; onClose: () => void }) {
  const config = entity.config || {};
  const record = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const story = record(config.object_story_spec); const linkData = record(story.link_data); const videoData = record(story.video_data);
  const directCta = record(config.call_to_action); const linkCta = record(linkData.call_to_action); const videoCta = record(videoData.call_to_action);
  const cta = String(config.call_to_action_type || config.cta_type || directCta.type || linkCta.type || videoCta.type || "No CTA stored").replaceAll("_", " ");
  const ctaValue = record(directCta.value); const linkCtaValue = record(linkCta.value); const videoCtaValue = record(videoCta.value);
  const destination = String(config.destination_url || config.link_url || config.website_url || linkData.link || ctaValue.link || linkCtaValue.link || videoCtaValue.link || "");
  const safeDestination = /^https?:\/\//i.test(destination) ? destination : "";
  return <div className="drawer-backdrop" onClick={onClose}><aside className="drawer" onClick={(event) => event.stopPropagation()}><header><span className="kicker">AD DETAIL</span><button onClick={onClose}>×</button></header><h2>{entity.name}</h2><div className="drawer-status"><StatusPill status={entity.effective_status || entity.status || "unknown"} /></div><section><span className="kicker">CREATIVE</span>{typeof config.thumbnail_url === "string" ? <img className="creative-image" src={config.thumbnail_url} alt="Ad creative preview" /> : <div className="creative-placeholder">Creative preview will appear when Meta provides a thumbnail.</div>}</section><section><span className="kicker">PRIMARY TEXT</span><p>{String(config.primary_text || config.body || linkData.message || videoData.message || "No ad copy is stored yet.")}</p></section><section><span className="kicker">HEADLINE</span><h3>{String(config.headline || linkData.name || videoData.title || "No headline stored")}</h3></section><section><span className="kicker">CALL TO ACTION</span><div className="creative-cta"><strong>{cta}</strong>{safeDestination ? <a href={safeDestination} target="_blank" rel="noreferrer">Open destination ↗</a> : <small>No destination URL stored</small>}</div>{safeDestination && <p className="creative-destination">{safeDestination}</p>}</section><section><span className="kicker">META IDENTIFIER</span><p>{entity.external_id}</p></section></aside></div>;
}
