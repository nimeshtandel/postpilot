import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { SettingsForm } from "@/components/SettingsForm";

export default async function SettingsPage() {
  const user = await requireUser();
  const zones = Intl.supportedValuesOf("timeZone");
  return (
    <>
      <PageHeader title="Settings" />
      <SettingsForm name={user.name ?? ""} email={user.email} timezone={user.timezone} zones={zones} />
    </>
  );
}
