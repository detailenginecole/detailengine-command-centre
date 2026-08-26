import { CommandCentre } from "../components/CommandCentre";
import { dataUrl, loadCommandCentre } from "../lib/data";
import { requireDetailEngineUser } from "../lib/auth";

export default async function ManagePage() {
  const user = await requireDetailEngineUser("/manage");
  const data = await loadCommandCentre();
  data.workspace.current_user = user;
  return <CommandCentre initialData={data} dataUrl={dataUrl()} screen="manage" />;
}
