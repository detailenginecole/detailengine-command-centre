import { NextResponse } from "next/server";
import { getDetailEngineUser, isAuthEnabled } from "../../lib/auth";

const endpoint = "https://pcegpghnijnesltfbbaa.supabase.co/functions/v1/command-centre-demo";

async function allowed() {
  return !isAuthEnabled() || Boolean(await getDetailEngineUser());
}

export async function GET(request: Request) {
  if (!await allowed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const source = new URL(request.url);
  const target = new URL(endpoint);
  for (const key of ["slug", "from", "to", "month"]) {
    const value = source.searchParams.get(key);
    if (value) target.searchParams.set(key, value);
  }
  const secret = process.env.DETAILENGINE_SYNC_SECRET;
  const response = await fetch(target, {
    cache: "no-store",
    headers: secret ? { "x-detailengine-secret": secret } : undefined,
  });
  return new NextResponse(response.body, {
    status: response.status,
    headers: { "Content-Type": response.headers.get("Content-Type") || "application/json" },
  });
}
