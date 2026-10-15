import { Label } from "@/components/ui/label";
import type { Workstation } from "./bindings/Workstation";
import { applicationEnvironmentHelp, applicationEnvironmentLabel, workstationLocationLabels } from "./workstationLabels";

export function WorkstationSelect({ id, value, workstations, disabled, onChange }: {
  id: string; value: string; workstations: Workstation[]; disabled?: boolean; onChange: (id: string) => void;
}) {
  const historicalAlias = value && !workstations.some(host => host.id === value) ? value : "";
  return <>
    <Label htmlFor={id}>Workstation</Label>
    <select id={id} value={value} disabled={disabled} aria-describedby={`${id}-help`} onChange={e => onChange(e.target.value)}>
      <option value="">{applicationEnvironmentLabel}</option>
      {(["local_host", "remote", "unspecified"] as const).map(location => {
        const hosts = workstations.filter(host => (host.location ?? "unspecified") === location);
        if (!hosts.length && !(location === "unspecified" && historicalAlias)) return null;
        return <optgroup key={location} label={workstationLocationLabels[location]}>
          {hosts.map(host => <option key={host.id} value={host.id}>{host.name} · SSH</option>)}
          {location === "unspecified" && historicalAlias && <option value={historicalAlias}>{historicalAlias} · Existing SSH alias</option>}
        </optgroup>;
      })}
    </select>
    <p id={`${id}-help`} className="hint">{applicationEnvironmentHelp} Local means the host instance running personal-agentic. <a href="/settings/workstations">Manage workstations in user settings</a></p>
  </>;
}
