import { isClientId } from "./client-identity";
import type { CommandCentreData } from "../components/CommandCentre";
import { isAuthEnabled } from "./auth";
import { createSupabaseServerClient } from "./supabase/server";

export const DATA_URL = process.env.VERCEL_ENV === "production"
  ? "https://pcegpghnijnesltfbbaa.supabase.co/functions/v1/command-centre-production"
  : "https://pcegpghnijnesltfbbaa.supabase.co/functions/v1/command-centre-staging";

export async function loadCommandCentre(idOrLegacySlug?: string): Promise<CommandCentreData> {
  const url = new URL(DATA_URL);
  if (idOrLegacySlug !== undefined) url.searchParams.set(isClientId(idOrLegacySlug) ? "client_id" : "slug", idOrLegacySlug);
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
  const data = await response.json() as CommandCentreData;
  if (isClientId(idOrLegacySlug) && data.client.id !== idOrLegacySlug.toLowerCase()) throw new Error("Account identity mismatch");
  return data;
}

export function dataUrl(clientId?: string) {
  return clientId ? `/api/command-centre?client_id=${encodeURIComponent(clientId)}` : "/api/command-centre";
}
