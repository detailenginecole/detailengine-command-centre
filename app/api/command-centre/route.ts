import { NextResponse } from "next/server";
import { getDetailEngineUser, isAuthEnabled } from "../../lib/auth";
import { createSupabaseServerClient } from "../../lib/supabase/server";

const endpoint = process.env.VERCEL_ENV === "production"
  ? "https://pcegpghnijnesltfbbaa.supabase.co/functions/v1/command-centre-production"
  : "https://pcegpghnijnesltfbbaa.supabase.co/functions/v1/command-centre-staging";

async function accessToken() {
  if (!isAuthEnabled()) return null;
  if (!await getDetailEngineUser()) return undefined;
  const supabase = await createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token;
}

export async function GET(request: Request) {
  const token = await accessToken();
  if (token === undefined) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const source = new URL(request.url);
  const target = new URL(endpoint);
  for (const key of ["slug", "from", "to", "month"]) {
    const value = source.searchParams.get(key);
    if (value) target.searchParams.set(key, value);
  }
  const secret = process.env.DETAILENGINE_SYNC_SECRET;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const response = await fetch(target, {
    cache: "no-store",
    headers: {
      ...(secret ? { "x-detailengine-secret": secret } : {}),
      ...(publishableKey ? { apikey: publishableKey } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  return new NextResponse(response.body, {
    status: response.status,
    headers: { "Content-Type": response.headers.get("Content-Type") || "application/json" },
  });
}
