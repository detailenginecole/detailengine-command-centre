import { parseContractTerms } from "../../lib/contract-terms";
import { NextResponse } from "next/server";
import { getDetailEngineUser } from "../../lib/auth";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { supabasePublishableKey, supabaseUrl } from "../../lib/supabase/config";

const checkoutEndpoint = `${supabaseUrl}/functions/v1/client-setup-payment`;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function validEmail(value: string) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: Request) {
  const user = await getDetailEngineUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return NextResponse.json(
      { error: "Authenticated session required" },
      { status: 401 },
    );
  }

  let source: Record<string, unknown>;
  try {
    source = await request.json();
  } catch {
    return NextResponse.json({ error: "Valid JSON is required" }, { status: 400 });
  }

  const checkoutMode = clean(source.checkout_mode);
  const setupAmountMinor = Number(source.setup_amount_minor ?? 100000);
  if (
    !Number.isInteger(setupAmountMinor) ||
    setupAmountMinor < 100 ||
    setupAmountMinor > 10000000
  ) {
    return NextResponse.json(
      { error: "Enter a setup fee between $1 and $100,000 USD." },
      { status: 400 },
    );
  }

  if (!["embedded", "hosted"].includes(checkoutMode)) {
    return NextResponse.json(
      { error: "Choose an on-screen payment or a secure payment link." },
      { status: 400 },
    );
  }

  let contractTerms;
  try { contractTerms = parseContractTerms(source.contract_terms, setupAmountMinor); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid contract details." }, { status: 400 }); }

  const payload = {
    contract_terms: contractTerms,
    business_name: clean(source.business_name),
    full_name: clean(source.full_name),
    email: clean(source.email).toLowerCase(),
    niche: clean(source.niche) || "Auto detailing",
    general_location: clean(source.general_location),
    timezone: clean(source.timezone) || "America/New_York",
    checkout_mode: checkoutMode,
    setup_amount_minor: setupAmountMinor,
  };

  if (
    !payload.business_name ||
    payload.business_name.length > 160 ||
    !payload.full_name ||
    payload.full_name.length > 120 ||
    !validEmail(payload.email) ||
    !payload.general_location ||
    payload.general_location.length > 160 ||
    payload.niche.length > 120 ||
    payload.timezone.length > 80
  ) {
    return NextResponse.json(
      { error: "Complete the business, client, email, and market fields." },
      { status: 400 },
    );
  }

  if (process.env.DETAILENGINE_CONTRACT_CAPTURE_ENABLED !== "true") {
    return NextResponse.json({ error: "Contract setup is not ready for payments yet." }, { status: 503 });
  }
  const response = await fetch(checkoutEndpoint, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      apikey: supabasePublishableKey,
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => ({
    error: "The payment service returned an invalid response.",
  }));

  return NextResponse.json(result, {
    status: response.status,
    headers: { "Cache-Control": "no-store" },
  });
}
