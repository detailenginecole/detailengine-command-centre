import {isClientId} from "../../../app/lib/client-identity.ts";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const syncSecret = Deno.env.get("DETAILENGINE_SYNC_SECRET") ?? "";

const orange = rgb(1, 0.396, 0);
const ink = rgb(0.067, 0.067, 0.059);
const muted = rgb(0.43, 0.41, 0.37);
const paper = rgb(0.965, 0.949, 0.914);
const green = rgb(0.035, 0.66, 0.27);
const white = rgb(1, 1, 1);

function money(value: unknown) {
  return `$${Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function number(value: unknown) {
  return Number(value || 0).toLocaleString("en-US");
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    .format(new Date(value));
}

function isoDate(value: string | null) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || "") ? value! : null;
}

function monthEnd(value: string) {
  const date = new Date(`${value.slice(0, 7)}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCDate(0);
  return date.toISOString().slice(0, 10);
}

function rangeLabel(from: string, to: string) {
  const formatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return `${formatter.format(new Date(`${from}T00:00:00Z`))} - ${formatter.format(new Date(`${to}T00:00:00Z`))}`;
}

function clean(value: unknown) {
  return String(value ?? "").replaceAll("—", "-").replaceAll("→", ">").replaceAll("·", "|");
}

function wrap(text: string, maxChars: number) {
  const words = clean(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (`${line} ${word}`.trim().length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = `${line} ${word}`.trim();
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

Deno.serve(async (request) => {
  if (request.method !== "GET") return new Response("GET required", { status: 405 });
  const url = new URL(request.url);
  const clientId = url.searchParams.get("client_id");
  const hasWorkspaceAccess = Boolean(syncSecret) && request.headers.get("x-detailengine-secret") === syncSecret;
  if (!hasWorkspaceAccess) return new Response("Unauthorized", {status:401});
  if (!isClientId(clientId)) return new Response("Valid client_id required", {status:400});
  const type = url.searchParams.get("type") === "ads" ? "ads" : "leads";
  const month = /^\d{4}-\d{2}$/.test(url.searchParams.get("month") || "")
    ? url.searchParams.get("month")!
    : "2026-08";
  const from = isoDate(url.searchParams.get("from")) || `${month}-01`;
  const to = isoDate(url.searchParams.get("to")) || monthEnd(from);
  if (from > to) return new Response("Invalid date range", { status: 400 });

  const dataResponse = await fetch(
    `${supabaseUrl}/functions/v1/command-centre-data-production?client_id=${encodeURIComponent(clientId)}&from=${from}&to=${to}`,
    { headers: hasWorkspaceAccess ? { "x-detailengine-secret": syncSecret } : undefined },
  );
  if (!dataResponse.ok) return new Response("Could not load report data", { status: dataResponse.status });
  const data = await dataResponse.json();
  if (data.client?.id !== clientId.toLowerCase()) return new Response("Account identity mismatch", {status:502});
  const slug = data.client.slug;

  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const width = 612;
  const height = 792;
  const margin = 42;
  let page = pdf.addPage([width, height]);
  let y = height - 46;

  function header(reportTitle: string) {
    page.drawRectangle({ x: 0, y: height - 72, width, height: 72, color: paper });
    page.drawRectangle({ x: margin, y: height - 55, width: 28, height: 28, color: orange });
    page.drawText("DE", { x: margin + 7, y: height - 46, size: 9, font: bold, color: white });
    page.drawText("DETAILENGINE", { x: margin + 38, y: height - 40, size: 11, font: bold, color: ink });
    page.drawText(reportTitle.toUpperCase(), { x: margin + 38, y: height - 53, size: 7, font: regular, color: muted });
    page.drawText(rangeLabel(from, to), { x: width - margin - 150, y: height - 45, size: 8, font: bold, color: ink });
    y = height - 98;
  }

  function footer() {
    const pageNumber = pdf.getPageCount();
    page.drawLine({ start: { x: margin, y: 27 }, end: { x: width - margin, y: 27 }, thickness: 0.6, color: rgb(0.82, 0.79, 0.73) });
    page.drawText("DetailEngine | Actual results from Supabase", { x: margin, y: 15, size: 6.5, font: regular, color: muted });
    page.drawText(String(pageNumber), { x: width - margin - 4, y: 15, size: 6.5, font: regular, color: muted });
  }

  function newPage(reportTitle: string) {
    footer();
    page = pdf.addPage([width, height]);
    header(reportTitle);
  }

  function ensureSpace(space: number, title: string) {
    if (y - space < 42) newPage(title);
  }

  function title(text: string, subtitle?: string) {
    page.drawText(clean(text), { x: margin, y, size: 24, font: bold, color: ink });
    y -= 21;
    if (subtitle) {
      page.drawText(clean(subtitle), { x: margin, y, size: 8.5, font: regular, color: muted });
      y -= 22;
    }
  }

  function section(text: string) {
    ensureSpace(34, type === "ads" ? "Ad performance report" : "Lead report");
    page.drawText(clean(text).toUpperCase(), { x: margin, y, size: 8, font: bold, color: orange });
    page.drawLine({ start: { x: margin + 105, y: y + 2 }, end: { x: width - margin, y: y + 2 }, thickness: 0.8, color: rgb(0.82, 0.79, 0.73) });
    y -= 18;
  }

  function cards(items: Array<{ label: string; value: string }>) {
    const gap = 7;
    const cardWidth = (width - margin * 2 - gap * (items.length - 1)) / items.length;
    items.forEach((item, index) => {
      const x = margin + index * (cardWidth + gap);
      page.drawRectangle({ x, y: y - 54, width: cardWidth, height: 54, color: white, borderColor: ink, borderWidth: 0.8 });
      page.drawText(clean(item.label).toUpperCase(), { x: x + 8, y: y - 15, size: 6.2, font: bold, color: muted });
      page.drawText(clean(item.value), { x: x + 8, y: y - 39, size: item.value.length > 17 ? 11 : 15, font: bold, color: index === 0 ? orange : ink });
    });
    y -= 69;
  }

  const performance = data.performance;
  const reportTitle = type === "ads" ? "Ad performance report" : "Lead report";
  header(reportTitle);
  title(data.client.display_name.replace(" - TEST", "").replace(" — TEST", ""), rangeLabel(from, to));

  if (type === "leads") {
    cards([
      { label: "All leads", value: number(performance.total_leads) },
      { label: "Qualified", value: number(performance.qualified_leads) },
      { label: "Warm transfers", value: number(performance.warm_transfers) },
      { label: "Collected", value: money(performance.collected_revenue) },
    ]);
    section("Transfer outcomes");
    cards([
      { label: "Closed", value: number(performance.closed_transfers) },
      { label: "Sales process", value: number(performance.in_sales_process) },
      { label: "Pending payment", value: number(performance.pending_payment) },
      { label: "Lost", value: number(performance.lost_transfers) },
      { label: "Awaiting", value: number(performance.awaiting_feedback) },
    ]);
    section("Lead detail");

    for (const lead of data.leads) {
      ensureSpace(46, reportTitle);
      const outcome = lead.outcome;
      page.drawRectangle({ x: margin, y: y - 40, width: width - margin * 2, height: 40, color: white, borderColor: rgb(0.83, 0.80, 0.74), borderWidth: 0.6 });
      page.drawText(clean(lead.full_name), { x: margin + 8, y: y - 14, size: 9, font: bold, color: ink });
      page.drawText(`${shortDate(lead.submitted_at)} | ${clean(lead.source || "Unknown")}`, { x: margin + 8, y: y - 29, size: 6.8, font: regular, color: muted });
      page.drawText(clean(lead.qualification_status || "Not reviewed"), { x: 235, y: y - 14, size: 7.5, font: bold, color: lead.is_qualified ? green : ink });
      page.drawText(clean(outcome?.status?.replaceAll("_", " ") || "Not transferred"), { x: 340, y: y - 14, size: 7.5, font: bold, color: outcome ? orange : muted });
      page.drawText(outcome?.status === "closed" ? money(outcome.collected_revenue) : "-", { x: 492, y: y - 14, size: 8, font: bold, color: outcome?.status === "closed" ? green : ink });
      const note = outcome?.lost_reason || outcome?.feedback_note || lead.qualification_reason || "";
      page.drawText(clean(note).slice(0, 82), { x: 235, y: y - 29, size: 6.4, font: regular, color: muted });
      y -= 44;
    }
  } else {
    cards([
      { label: "Actual spend", value: money(performance.actual_ad_spend) },
      { label: "Impressions", value: number(performance.impressions) },
      { label: "Clicks", value: number(performance.clicks) },
      { label: "CTR", value: `${Number(performance.ctr_percent || 0).toFixed(2)}%` },
    ]);
    section("Layer 1 business results");
    cards([
      { label: "All leads", value: number(performance.total_leads) },
      { label: "Qualified", value: number(performance.qualified_leads) },
      { label: "Unqualified", value: number(performance.unqualified_leads) },
      { label: "Transfers", value: number(performance.warm_transfers) },
    ]);
    cards([
      { label: "Cost / lead", value: money(performance.cost_per_lead) },
      { label: "Cost / transfer", value: money(performance.cost_per_transfer) },
      { label: "Collected", value: money(performance.collected_revenue) },
      { label: "ROI", value: `${money(performance.roi_dollars)} | ${Number(performance.roi_percent || 0).toFixed(1)}%` },
    ]);
    section("Daily Meta delivery");
    page.drawText("DATE", { x: margin + 7, y, size: 6.5, font: bold, color: muted });
    page.drawText("SPEND", { x: 145, y, size: 6.5, font: bold, color: muted });
    page.drawText("IMPRESSIONS", { x: 245, y, size: 6.5, font: bold, color: muted });
    page.drawText("CLICKS", { x: 365, y, size: 6.5, font: bold, color: muted });
    page.drawText("META LEADS", { x: 470, y, size: 6.5, font: bold, color: muted });
    y -= 12;
    for (const metric of data.ad_metrics) {
      ensureSpace(24, reportTitle);
      page.drawLine({ start: { x: margin, y: y - 5 }, end: { x: width - margin, y: y - 5 }, thickness: 0.4, color: rgb(0.86, 0.83, 0.78) });
      page.drawText(shortDate(metric.metric_date), { x: margin + 7, y, size: 7.5, font: regular, color: ink });
      page.drawText(money(metric.spend), { x: 145, y, size: 7.5, font: regular, color: ink });
      page.drawText(number(metric.impressions), { x: 245, y, size: 7.5, font: regular, color: ink });
      page.drawText(number(metric.clicks), { x: 365, y, size: 7.5, font: regular, color: ink });
      page.drawText(number(metric.leads), { x: 470, y, size: 7.5, font: regular, color: ink });
      y -= 19;
    }
    y -= 8;
    section("Recent Meta changelog");
    for (const day of data.ad_changelog) {
      const actionLines = day.actions.flatMap((action: Record<string, unknown>) => wrap(clean(action.summary), 72));
      ensureSpace(28 + actionLines.length * 10, reportTitle);
      page.drawText(shortDate(day.action_date), { x: margin, y, size: 8, font: bold, color: ink });
      page.drawText(`${day.total_actions} actions`, { x: margin, y: y - 12, size: 6.5, font: regular, color: muted });
      let lineY = y;
      for (const line of actionLines) {
        page.drawCircle({ x: 138, y: lineY + 3, size: 2.5, color: orange });
        page.drawText(line, { x: 147, y: lineY, size: 7.5, font: regular, color: ink });
        lineY -= 11;
      }
      y = Math.min(y - 27, lineY - 4);
    }
  }

  footer();
  const bytes = await pdf.save();
  const filename = `detailengine-${slug}-${from}-to-${to}-${type}-report.pdf`;
  return new Response(new Uint8Array(bytes).buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, max-age=60",
    },
  });
});
