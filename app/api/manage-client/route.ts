import { NextResponse } from "next/server";
import { getDetailEngineUser, isAuthEnabled } from "../../lib/auth";
import { createSupabaseServerClient } from "../../lib/supabase/server";

const endpoint = "https://pcegpghnijnesltfbbaa.supabase.co/functions/v1/command-centre-admin";

export async function POST(request: Request) {
  let token: string | null = null;
  if (isAuthEnabled()) {
    const user = await getDetailEngineUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    token = (await (await createSupabaseServerClient()).auth.getSession()).data.session?.access_token || null;
  }
  if (!token) return NextResponse.json({ error: "Authenticated session required" }, { status: 401 });
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(publishableKey ? { apikey: publishableKey } : {}) },
    body: JSON.stringify(await request.json()),
  });
  const payload = await response.json();
  return NextResponse.json(payload, { status: response.status });
}
