import { headers } from "next/headers";
import { CommandCentre } from "./components/CommandCentre";
import { dataUrl, loadCommandCentre } from "./lib/data";
import { requireDetailEngineUser } from "./lib/auth";
import { SalesStartPage } from "./start/SalesStartPage";

export default async function Home() {
  const incoming = await headers();
  const host = (
    incoming.get("x-forwarded-host") ||
    incoming.get("host") ||
    ""
  ).split(":")[0].toLowerCase();

  if (host === "start.getdetailengine.com") {
    return <SalesStartPage returnTo="/" />;
  }

  const user = await requireDetailEngineUser("/");
  const data = await loadCommandCentre();
  data.workspace.current_user = user;
  return <CommandCentre initialData={data} dataUrl={dataUrl()} screen="overview" />;
}
