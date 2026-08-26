import { NextResponse } from "next/server";
import { getDetailEngineUser, isAuthEnabled } from "../../lib/auth";

const endpoint = "https://pcegpghnijnesltfbbaa.supabase.co/functions/v1/command-centre-admin";

export async function POST(request: Request) {
  let actor: { id?: string; name?: string } = {};
  if (isAuthEnabled()) {
    const user = await getDetailEngineUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    actor = { id: user.id, name: user.name };
  }
  const secret = process.env.DETAILENGINE_SYNC_SECRET;
  if (!secret) return NextResponse.json({ error: "Admin setup is incomplete" }, { status: 503 });
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-detailengine-secret": secret },
    body: JSON.stringify({ ...(await request.json()), actor_user_id: actor.id || null, actor_name: actor.name || "DetailEngine team" }),
  });
  const payload = await response.json();
  return NextResponse.json(payload, { status: response.status });
}
