import { useEffect, useRef, useState } from "react";
import { api, post, requestId } from "./api";
import { ActionFeedbackProvider, PendingIcon, useActionFeedback } from "./ActionFeedback";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";

type Invitation = { id: string; status: string; created: number; expires: number; username: string | null };
type Inventory = { ready: boolean; guidance: string; invitations: Invitation[] };

export function MatrixInvitations({ tenant }: { tenant: string }) {
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [link, setLink] = useState("");
  const [expires, setExpires] = useState<number | null>(null);
  const active = useRef(true);
  const feedback = useActionFeedback(`matrix-invitations:${tenant}`, tenant);
  const busy = feedback.pending !== null;
  const load = async () => {
    const next = await api<Inventory>(`/tenants/${tenant}/invitations`);
    if (active.current) { setInventory(next); setLoadError(false); }
  };
  useEffect(() => {
    active.current = true;
    void load().catch(() => { if (active.current) setLoadError(true); });
    return () => { active.current = false; };
  }, [tenant]); // eslint-disable-line react-hooks/exhaustive-deps
  return <section aria-labelledby="new-member-heading" className="matrix-invitations">
    <h3 id="new-member-heading">Invite a new teammate</h3>
    <p>Create a local Matrix account through a private, one-use link. Your teammate chooses their own password and joins as a Member. Room and project access are managed separately.</p>
    {inventory ? <p>{inventory.guidance}</p> : <p>{loadError ? "Invitation availability could not be loaded. Existing Matrix invitations remain available below." : "Checking invitation availability…"}</p>}
    <div className="matrix-invite-actions">
      <Button type="button" disabled={busy || !inventory?.ready} onClick={() => void feedback.run("create", async () => {
        const created = await post<{ link: string; expires: number }>(`/tenants/${tenant}/invitations`);
        if (active.current) { setLink(created.link); setExpires(created.expires); }
        try { await load(); } catch { return { kind: "warning", message: "Invitation created. Keep its link; the invitation list could not refresh." }; }
        return { kind: "success", message: "Invitation created. Copy and share its link privately." };
      })}><PendingIcon pending={feedback.isPending("create")} />Create invitation</Button>
      <Button type="button" variant="outline" disabled={busy} onClick={() => void feedback.run("refresh", async () => { await load(); })}><PendingIcon pending={feedback.isPending("refresh")} />Refresh invitations</Button>
    </div>
    {link && <div className="matrix-invite-link">
      <label htmlFor="new-member-link">Invitation link — shown only now<Input id="new-member-link" readOnly value={link} autoComplete="off" onFocus={e => e.target.select()} /></label>
      <p>Expires {expires ? new Date(expires * 1000).toLocaleString() : "in 24 hours"}. Anyone with this link can choose a new account. It is not email identity verification.</p>
      <Button type="button" variant="outline" disabled={busy} onClick={() => void feedback.run("copy", async () => {
        try { await navigator.clipboard.writeText(link); return { kind: "success", message: "Invitation link copied. Share it privately." }; }
        catch { return { kind: "warning", message: "Copy was blocked. Select the invitation link and copy it manually." }; }
      })}>Copy invitation link</Button>
      <Button type="button" variant="ghost" disabled={busy} onClick={() => { setLink(""); setExpires(null); }}>Hide link</Button>
    </div>}
    {!!inventory?.invitations.length && <ul className="matrix-invite-list" aria-label="New-member invitations">
      {inventory.invitations.map(item => <li key={item.id}>
        <div><strong>{item.username ?? "Unclaimed invitation"}</strong><span>{item.status.replaceAll("_", " ")} · expires {new Date(item.expires * 1000).toLocaleString()}</span></div>
        {!["accepted", "revoked", "expired"].includes(item.status) && <Button variant="outline" type="button" disabled={busy} onClick={() => void feedback.run(`revoke:${item.id}`, async () => {
          await api(`/tenants/${tenant}/invitations/${item.id}`, { method: "DELETE" });
          if (active.current) setLink("");
          try { await load(); } catch { return { kind: "warning", message: "Invitation revoked, but the list could not refresh. Refresh the list; do not revoke again." }; }
          return { kind: "success", message: "Invitation revoked. Any previously created Matrix account remains." };
        })}><PendingIcon pending={feedback.isPending(`revoke:${item.id}`)} />Revoke invitation</Button>}
      </li>)}
    </ul>}
  </section>;
}

// Intake occurs once before StrictMode mounts; credentials stay only in this document's memory.
const joinToken = location.pathname === "/join" ? new URLSearchParams(location.hash.slice(1)).get("invite") ?? "" : "";
if (location.pathname === "/join") history.replaceState(null, "", "/join");
type JoinInfo = { workspace: string; status: string; username: string | null; server_name: string };
export function JoinInvitation() { return <ActionFeedbackProvider><JoinForm /></ActionFeedbackProvider>; }
function JoinForm() {
  const [claim] = useState(() => requestId() + requestId());
  const [info, setInfo] = useState<JoinInfo | null>(null);
  const [loading, setLoading] = useState(!!joinToken);
  const [unavailable, setUnavailable] = useState(!joinToken);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [complete, setComplete] = useState<string | null>(null);
  const feedback = useActionFeedback("join-invitation");
  const busy = feedback.pending !== null;
  const inspect = async () => {
    const next = await post<JoinInfo>("/invitations/inspect", { token: joinToken });
    setInfo(next); setUnavailable(false);
    if (next.username) setUsername(next.username);
  };
  useEffect(() => {
    if (!joinToken) return;
    let active = true;
    void post<JoinInfo>("/invitations/inspect", { token: joinToken }).then(next => {
      if (active) { setInfo(next); if (next.username) setUsername(next.username); }
    }).catch(() => { if (active) setUnavailable(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const usernameValid = /^[a-z][a-z0-9._-]{2,31}$/.test(username);
  const passwordValid = password.length >= 12 && new TextEncoder().encode(password).length <= 256;
  return <main className="login-page"><section className="login-card" aria-labelledby="join-title">
    <div className="login-brand"><img src="/agentic-enterprise-logo.png" alt="" width={36} height={36} /><span>Agentic Enterprise</span></div>
    <h1 id="join-title">{complete ? "Your account is ready" : "Join your workspace"}</h1>
    {loading ? <p role="status">Checking invitation…</p> : complete ? <>
      <p><strong>{complete}</strong> can now sign in as a Member. Room and project access still require their own permissions.</p>
      <a href="/">Go to sign in</a><p>If this browser is already signed in, its session is unchanged. Use a separate browser profile for your account.</p>
    </> : unavailable ? <>
      <p>This invitation is missing, unavailable, expired, revoked or already used. Open the original private link or ask the owner for a new one. No account has been created by opening this page.</p>
      {joinToken && <Button type="button" variant="outline" disabled={busy} onClick={() => void feedback.run("inspect", async () => { await inspect(); })}>Check invitation again</Button>}
      <a href="/">Back to sign in</a>
    </> : info && <>
      <p>Join <strong>{info.workspace}</strong> with an account on {info.server_name}. Anyone holding this private link can choose a new local account.</p>
      <p>Keep this page open until completion. If an account was already created, retry uses these same credentials to prove ownership; it never resets a password.</p>
      {info.status !== "pending" && <p>Account recovery: {info.status.replaceAll("_", " ")}. Verify the same credentials to finish safely. If this page was reloaded during acceptance, ask the owner to check membership or invite your existing Matrix ID.</p>}
      <form aria-label="Accept invitation" onSubmit={e => {
        e.preventDefault();
        if (!usernameValid || !passwordValid || password !== confirmation || busy) return;
        void feedback.run("accept", async () => {
          try {
            const result = await post<{ status: string; user: string }>("/invitations/accept", { token: joinToken, claim, username, password });
            setComplete(result.user); setPassword(""); setConfirmation("");
            return { kind: "success", message: "Account created and workspace membership confirmed. You can now sign in." };
          } catch (error) {
            try { await inspect(); } catch { /* The action error remains authoritative if status inspection also fails. */ }
            throw error;
          } finally { setPassword(""); setConfirmation(""); }
        }, { errorMessage: "Account acceptance could not be confirmed. Keep this page open and retry the same username and password to recover safely." });
      }}>
        <fieldset disabled={busy}>
          <div className="login-field"><label htmlFor="join-username">Username</label><Input id="join-username" readOnly={info.username !== null} autoComplete="username" autoCapitalize="none" spellCheck={false} required minLength={3} maxLength={32} value={username} onChange={e => setUsername(e.target.value)} aria-describedby="join-username-help" aria-invalid={!!username && !usernameValid} /><p id="join-username-help" className="login-hint">3–32 lowercase letters, digits, dots, dashes or underscores; start with a letter. Platform names are reserved.</p></div>
          <div className="login-field"><label htmlFor="join-password">Choose password</label><Input id="join-password" type="password" autoComplete="new-password" required minLength={12} maxLength={256} value={password} onChange={e => setPassword(e.target.value)} aria-describedby="join-password-help" aria-invalid={!!password && !passwordValid} /><p id="join-password-help" className="login-hint">At least 12 characters. Only you choose this password; the workspace owner cannot see it.</p></div>
          <div className="login-field"><label htmlFor="join-confirm">Confirm password</label><Input id="join-confirm" type="password" autoComplete="new-password" required value={confirmation} onChange={e => setConfirmation(e.target.value)} aria-invalid={!!confirmation && confirmation !== password} aria-describedby="join-confirm-help" />{confirmation && confirmation !== password && <p id="join-confirm-help">Passwords must match.</p>}</div>
          <Button type="submit" disabled={busy || !usernameValid || !passwordValid || password !== confirmation}><PendingIcon pending={busy} />{busy ? "Confirming account and access…" : "Create account and join"}</Button>
        </fieldset>
      </form>
      <p>Already have a Matrix account? Ask the owner to use Invite Matrix user instead; this page cannot change an existing password.</p>
    </>}
  </section></main>;
}
