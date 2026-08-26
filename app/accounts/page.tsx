import { CommandCentre } from "../components/CommandCentre";
import { dataUrl, loadCommandCentre } from "../lib/data";
import { requireDetailEngineUser } from "../lib/auth";

export default async function AccountsPage() {
  const user = await requireDetailEngineUser("/accounts");
  const data = await loadCommandCentre();
  data.workspace.current_user = user;
  return <CommandCentre initialData={data} dataUrl={dataUrl()} screen="accounts" />;
}
