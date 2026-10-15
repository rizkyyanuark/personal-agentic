import type { Workstation } from "./bindings/Workstation";

export const applicationEnvironmentLabel = "Application environment";
export const applicationEnvironmentHelp = "Runs within the service: the application container on Docker, or the application's native environment.";

export const workstationLocationLabels = {
  local_host: "Local",
  remote: "Remote",
  unspecified: "Saved SSH",
} satisfies Record<Workstation["location"], string>;

export function workstationLocationLabel(host: Workstation): string {
  return workstationLocationLabels[host.location ?? "unspecified"];
}

export function workstationLabel(host: Workstation): string {
  return `${workstationLocationLabel(host)} · ${host.name} · SSH`;
}

export function sshWorkstationLabel(id: string, workstations: Workstation[]): string {
  const host = workstations.find(workstation => workstation.id === id);
  return host ? workstationLabel(host) : `Saved SSH · ${id}`;
}
