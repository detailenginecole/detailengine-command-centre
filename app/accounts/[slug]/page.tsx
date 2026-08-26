import { CommandCentre } from "../../components/CommandCentre";
import { dataUrl, loadCommandCentre } from "../../lib/data";
import { requireDetailEngineUser } from "../../lib/auth";

export default async function AccountPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireDetailEngineUser(`/accounts/${slug}`);
  const data = await loadCommandCentre(slug);
  data.workspace.current_user = user;
  return <CommandCentre initialData={data} dataUrl={dataUrl(slug)} screen="account" />;
}
