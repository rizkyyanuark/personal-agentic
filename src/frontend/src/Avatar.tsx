import { Bot } from "lucide-react";
import type { Agent } from "./bindings/Agent";

export function Avatar({
  agent,
  owner = false,
  name,
}: {
  agent?: Agent;
  owner?: boolean;
  name?: string;
}) {
  const initials = agent
    ? agent.name.slice(0, 2).toUpperCase()
    : name && name.trim().length > 0
    ? Array.from(name.trim()).slice(0, 2).join("").toUpperCase()
    : owner
    ? "U"
    : <Bot size={16} />;

  return (
    <span
      className={`avatar ${owner || name ? "owner-avatar" : ""}`}
      style={agent ? { backgroundColor: agent.color } : undefined}
      aria-hidden="true"
    >
      <span className="avatar-initials">
        {initials}
      </span>
    </span>
  );
}
