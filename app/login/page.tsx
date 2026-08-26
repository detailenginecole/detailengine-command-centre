import { LoginClient } from "./LoginClient";
import { isAuthEnabled } from "../lib/auth";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ returnTo?: string; error?: string }> }) {
  const params = await searchParams;
  return <LoginClient enabled={isAuthEnabled()} returnTo={params.returnTo || "/"} error={params.error} />;
}
