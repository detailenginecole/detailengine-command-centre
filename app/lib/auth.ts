import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "./supabase/server";

export type DetailEngineUser = {
  id: string;
  email: string;
  name: string;
};

export function isAuthEnabled() {
  return process.env.DETAILENGINE_GOOGLE_AUTH_ENABLED !== "false";
}

export async function getDetailEngineUser(): Promise<DetailEngineUser | null> {
  if (!isAuthEnabled()) return null;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase();
  const domain = (
    process.env.DETAILENGINE_ALLOWED_EMAIL_DOMAIN || "getdetailengine.com"
  ).toLowerCase();

  if (!user || !email || !email.endsWith(`@${domain}`)) return null;

  return {
    id: user.id,
    email,
    name: String(
      user.user_metadata?.full_name || user.user_metadata?.name || email,
    ),
  };
}

export async function requireDetailEngineUser(returnTo: string) {
  if (!isAuthEnabled()) return null;
  const user = await getDetailEngineUser();
  if (!user) redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  return user;
}
