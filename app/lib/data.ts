import type { CommandCentreData } from "../components/CommandCentre";
import { isAuthEnabled } from "./auth";
import { createSupabaseServerClient } from "./supabase/server";

export const DATA_URL = process.env.VERCEL_ENV === "production"
  ? "https://pcegpghnijnesltfbbaa.supabase.co/functions/v1/command-centre-production"
  : "https://pcegpghnijnesltfbbaa.supabase.co/functions/v1/command-centre-staging";

export async function loadCommandCentre(slug?: string): Promise<CommandCentreData> {
  const url = new URL(DATA_URL);
  if (slug) url.searchParams.set("slug", slug);
  const secret = process.env.DETAILENGINE_SYNC_SECRET;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const token = isAuthEnabled()
    ? (await (await createSupabaseServerClient()).auth.getSession()).data.session?.access_token
    : null;
  const response = await fetch(url.toString(), {
    cache: "no-store",
    headers: {
      ...(secret ? { "x-detailengine-secret": secret } : {}),
      ...(publishableKey ? { apikey: publishableKey } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) {
    const body = await response.text();
    console.error("[command-centre] upstream request failed", {
      status: response.status,
      errorCode: response.headers.get("sb-error-code"),
      body: body.slice(0, 500),
    });
    throw new Error("Could not load the DetailEngine command centre");
  }
  return response.json() as Promise<CommandCentreData>;
}

export function dataUrl(slug?: string) {
  return slug ? `/api/command-centre?slug=${encodeURIComponent(slug)}` : "/api/command-centre";
}
