"use client";

import { useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "../lib/supabase/client";

export function LoginClient({ enabled, returnTo, error }: { enabled: boolean; returnTo: string; error?: string }) {
  const [busy, setBusy] = useState(false);
  async function signIn() {
    setBusy(true);
    const supabase = createSupabaseBrowserClient();
    const safeReturnTo =
      returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";
    document.cookie = `de_auth_return_to=${encodeURIComponent(safeReturnTo)}; Path=/; Max-Age=600; SameSite=Lax; Secure`;
    const callback = new URL("/auth/callback", window.location.origin);
    const { error: authError } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: callback.toString() } });
    if (authError) setBusy(false);
  }
  return <main className="login-screen"><section><div className="login-brand">DetailEngine</div><h1>Sign in</h1><p>Use your DetailEngine Google account to continue.</p>{error === "not_allowed" && <div className="login-error">This Google account is not approved.</div>}{enabled ? <button className="google-button" onClick={signIn} disabled={busy}><b>G</b>{busy ? "Opening Google…" : "Continue with Google"}</button> : <><div className="preview-notice">Google authentication is prepared but intentionally disabled in preview.</div><Link className="primary-button" href="/">Open preview</Link></>}</section></main>;
}
