import { NextResponse } from "next/server";
import { getDetailEngineUser } from "../../lib/auth";
import { createSupabaseServerClient } from "../../lib/supabase/server";

const endpoint = process.env.VERCEL_ENV === "production"
  ? "https://pcegpghnijnesltfbbaa.supabase.co/functions/v1/command-centre-report"
  : "https://pcegpghnijnesltfbbaa.supabase.co/functions/v1/command-centre-report-staging";

export async function GET(request: Request) {
  if (!await getDetailEngineUser()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = await createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const source = new URL(request.url);
  const target = new URL(endpoint);
  for (const key of ["client_id", "slug", "from", "to", "type"]) {
    const value = source.searchParams.get(key);
    if (value !== null) target.searchParams.set(key, value);
  }
  const response = await fetch(target, { cache: "no-store", headers: {
    Authorization: `Bearer ${session.access_token}`,
    apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "",
  } });
  const headers = new Headers();
  headers.set("Content-Type", response.headers.get("Content-Type") || "application/pdf");
  const disposition = response.headers.get("Content-Disposition");
  if (disposition) headers.set("Content-Disposition", disposition);
  return new NextResponse(response.body, { status: response.status, headers });
}
