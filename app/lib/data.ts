import type { CommandCentreData } from "../components/CommandCentre";

export const DATA_URL = "https://pcegpghnijnesltfbbaa.supabase.co/functions/v1/command-centre-demo";

export async function loadCommandCentre(slug?: string): Promise<CommandCentreData> {
  const url = new URL(DATA_URL);
  if (slug) url.searchParams.set("slug", slug);
  const secret = process.env.DETAILENGINE_SYNC_SECRET;
  const response = await fetch(url.toString(), {
    cache: "no-store",
    headers: secret ? { "x-detailengine-secret": secret } : undefined,
  });
  if (!response.ok) throw new Error("Could not load the DetailEngine command centre");
  return response.json() as Promise<CommandCentreData>;
}

export function dataUrl(slug?: string) {
  return slug ? `/api/command-centre?slug=${encodeURIComponent(slug)}` : "/api/command-centre";
}
