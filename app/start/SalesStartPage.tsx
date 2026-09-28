import { requireDetailEngineUser } from "../lib/auth";
import { SalesStartClient } from "./SalesStartClient";

export async function SalesStartPage({ returnTo = "/start" }: { returnTo?: string }) {
  const user = await requireDetailEngineUser(returnTo);

  return (
    <SalesStartClient
      staffName={user?.name || "DetailEngine team"}
      staffEmail={user?.email || ""}
    />
  );
}
