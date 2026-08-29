// These are public browser credentials, not secret or service-role credentials.
// Keep the checked-in fallback so Vercel middleware can start even when the
// project-level runtime variables have not been copied into an environment.
export const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://pcegpghnijnesltfbbaa.supabase.co";

export const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable_8khZ04vuagoanM10RIUarg_oQ28s8Mh";
