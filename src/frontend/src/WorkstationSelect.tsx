import { Label } from "@/components/ui/label";
import { ValuePicker, type ValueOption } from "./ValuePicker";
import type { Workstation } from "./bindings/Workstation";
import { applicationEnvironmentHelp, applicationEnvironmentLabel, workstationLocationLabels } from "./workstationLabels";

export function WorkstationSelect({ id, value, workstations, disabled, onChange }: {
  id: string; value: string; workstations: Workstation[]; disabled?: boolean; onChange: (id: string) => void;
}) {
  const historicalAlias = value && !workstations.some(host => host.id === value) ? value : "";
  return <>
    <Label htmlFor={id}>Workstation</Label>
    <ValuePicker id={id} value={value} disabled={disabled} searchable aria-describedby={`${id}-help`} onValueChange={onChange}
      options={[{ value: "", label: applicationEnvironmentLabel }, ...(["local_host", "remote", "unspecified"] as const).flatMap<ValueOption>(location => {
        const hosts = workstations.filter(host => (host.location ?? "unspecified") === location);
        return [
          ...hosts.map(host => ({ value: host.id, label: `${host.name} · SSH`, group: workstationLocationLabels[location] })),
          ...(location === "unspecified" && historicalAlias ? [{ value: historicalAlias, label: `${historicalAlias} · Existing SSH alias`, group: workstationLocationLabels[location] }] : []),
        ];
      })]} />
    <p id={`${id}-help`} className="hint">{applicationEnvironmentHelp} Local means the host instance running personal-agentic. <a href="/settings/workstations">Manage workstations in user settings</a></p>
  </>;
}
