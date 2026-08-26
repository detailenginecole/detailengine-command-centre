import { NextRequest, NextResponse } from "next/server";
import { getDetailEngineUser, isAuthEnabled } from "../../lib/auth";

const workflowUrl = "https://pcegpghnijnesltfbbaa.supabase.co/functions/v1/feedback-workflow";

export async function POST(request: NextRequest) {
  if (isAuthEnabled() && !await getDetailEngineUser()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const secret = process.env.DETAILENGINE_SYNC_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Feedback actions are built but the hosting secret still needs to be connected." },
      { status: 503 },
    );
  }

  const body = await request.json();
  const response = await fetch(workflowUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-detailengine-sync-secret": secret,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const payload = await response.json();
  return NextResponse.json(payload, { status: response.status });
}
