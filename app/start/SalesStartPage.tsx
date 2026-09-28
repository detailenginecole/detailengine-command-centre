import { requireDetailEngineUser } from "../lib/auth";
import { SalesStartClient } from "./SalesStartClient";

export async function SalesStartPage({ returnTo = "/start" }: { returnTo?: string }) {
  const user = await requireDetailEngineUser(returnTo);

  return (
    <SalesStartClient
      staffName={user?.name || "DetailEngine team"}
      staffEmail={user?.email || ""}
      stripePublishableKey={process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ""}
    />
  );
}
