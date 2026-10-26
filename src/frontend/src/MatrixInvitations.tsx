import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Tabs } from "@base-ui/react/tabs";
import { Field } from "@base-ui/react/field";
import { Check, Copy, Link, UserPlus } from "lucide-react";
import { api, post, requestId, ApiFailure } from "./api";
import { ActionFeedbackProvider, PendingIcon, useActionFeedback } from "./ActionFeedback";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Badge } from "./components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./components/ui/dialog";
import "./invitation.css";

type Invitation = { id: string; status: string; created: number; expires: number; username: string | null };
type Inventory = { ready: boolean; guidance: string; invitations: Invitation[] };
type GeneratedLink = { id: string; link: string; expires: number };
const statusLabels: Record<string, string> = {
  pending: "Pending", claiming: "Creating account", account_confirmed: "Account confirmed",
  membership_pending: "Joining workspace", accepted: "Accepted", revoked: "Revoked",
  expired: "Expired", unresolved: "Needs attention",
};
const terminalStatuses = new Set(["accepted", "revoked", "expired"]);
const dateLabel = (value: number) => new Date(value * 1000).toLocaleString();

export function MatrixInvitations({ tenant, workspaceName, existingAccountForm }: {
  tenant: string; workspaceName: string; existingAccountForm: ReactNode;
}) {
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generated, setGenerated] = useState<GeneratedLink | null>(null);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<string | number | null>("create");
  const generation = useRef(0);
  const feedback = useActionFeedback(`matrix-invitations:${tenant}`, tenant);
  const busy = feedback.pending !== null;
  useLayoutEffect(() => {
    generation.current += 1;
    return () => { generation.current += 1; };
  }, [tenant]);
  const load = async (epoch: number) => {
    const next = await api<Inventory>(`/tenants/${tenant}/invitations`);
    if (generation.current === epoch) { setInventory(next); setLoadError(false); }
  };
  useEffect(() => {
    const epoch = generation.current;
    void load(epoch).catch(() => {
      if (generation.current === epoch) setLoadError(true);
    }).finally(() => {
      if (generation.current === epoch) setLoading(false);
    });
  }, [tenant]); // eslint-disable-line react-hooks/exhaustive-deps
  const refresh = () => void feedback.run("refresh", async () => {
    const epoch = generation.current;
    setLoading(true);
    try { await load(epoch); }
    catch (error) {
      if (generation.current === epoch) setLoadError(true);
      throw error;
    } finally { if (generation.current === epoch) setLoading(false); }
  });
  const readiness = <div className="invite-readiness">
    {loading ? <p role="status">Checking invitation availability…</p> : loadError ?
      <p>Invitation availability could not be checked. Try refreshing, or invite an existing Matrix account.</p> :
      !inventory?.ready && <><p>New-account invitations are not available yet. You can still invite an existing Matrix account.</p>
        {inventory?.guidance && <details><summary>Setup details</summary><p>{inventory.guidance}</p></details>}</>}
    {(loadError || !inventory?.ready) && <Button type="button" variant="outline" size="sm" disabled={busy || loading} onClick={refresh}>Check availability</Button>}
  </div>;
  return <section aria-labelledby="new-member-heading" className="matrix-invitations">
    <div className="invite-section-header">
      <div><h3 id="new-member-heading">Invitations</h3><p className="settings-description">Give a teammate access to {workspaceName}.</p></div>
      <Dialog open={open} onOpenChange={value => { setOpen(value); if (value) setTab("create"); }}>
        <DialogTrigger render={<Button type="button" />}><UserPlus data-icon="inline-start" />Invite teammate</DialogTrigger>
        <DialogContent className="workspace-invite-dialog">
          <DialogHeader><DialogTitle>Invite teammate</DialogTitle><DialogDescription>Choose how to invite someone to {workspaceName}.</DialogDescription></DialogHeader>
          <Tabs.Root value={tab} onValueChange={setTab} className="invite-tabs">
            <Tabs.List activateOnFocus aria-label="Invitation method" className="invite-tabs-list">
              <Tabs.Tab value="create">Create invite link</Tabs.Tab>
              <Tabs.Tab value="existing">Existing Matrix account</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="create" className="invite-tab-panel">
              <p>Your teammate creates their account and joins as a <strong>Member</strong>.</p>
              {readiness}
              {generated ? <div className="matrix-invite-link">
                <Field.Root><Field.Label htmlFor="new-member-link">Invitation link — shown only now</Field.Label>
                  <Input id="new-member-link" readOnly value={generated.link} autoComplete="off" onFocus={e => e.target.select()} />
                  <Field.Description>Expires {dateLabel(generated.expires)}. Share this link privately.</Field.Description>
                </Field.Root>
                <div className="matrix-invite-actions"><Button type="button" variant="outline" disabled={busy} onClick={() => void feedback.run("copy", async () => {
                  const epoch = generation.current;
                  try {
                    await navigator.clipboard.writeText(generated.link);
                    if (generation.current === epoch) setCopied(true);
                    return { kind: "success", message: "Invitation link copied. Share it privately." };
                  } catch {
                    if (generation.current === epoch) setCopied(false);
                    return { kind: "warning", message: "Copy was blocked. Select the invitation link and copy it manually." };
                  }
                })}>{copied ? <Check className="invite-copy-icon" data-icon="inline-start" /> : <Copy className="invite-copy-icon" data-icon="inline-start" />}Copy invitation link</Button>
                  <Button type="button" variant="ghost" disabled={busy} onClick={() => { setGenerated(null); setCopied(false); }}>Hide link</Button></div>
                <details><summary>About this link</summary><p>One person can use this link. Anyone holding it can create an account; it does not verify an email address. Keep a private copy before leaving this page. Room and project access are managed separately.</p></details>
              </div> : <Button type="button" disabled={busy || loading || loadError || !inventory?.ready} onClick={() => void feedback.run("create", async () => {
                const epoch = generation.current;
                const created = await post<GeneratedLink>(`/tenants/${tenant}/invitations`);
                if (generation.current !== epoch) return;
                setGenerated(created); setCopied(false);
                try { await load(epoch); }
                catch { return { kind: "warning", message: "Invitation created. Keep its link; the invitation list could not refresh." }; }
                return { kind: "success", message: "Invitation created. Copy and share its link privately." };
              })}><PendingIcon pending={feedback.isPending("create")} /><Link data-icon="inline-start" />Create invitation</Button>}
            </Tabs.Panel>
            <Tabs.Panel value="existing" className="invite-tab-panel">
              <p>Add someone who already has a Matrix account. This does not create an account or change their password.</p>
              {existingAccountForm}
            </Tabs.Panel>
          </Tabs.Root>
        </DialogContent>
      </Dialog>
    </div>
    <div className="invite-inventory-header"><span>{inventory ? `${inventory.invitations.length} listed` : "Invitation history"}</span>
      <Button type="button" variant="ghost" size="sm" disabled={busy || loading} onClick={refresh}><PendingIcon pending={feedback.isPending("refresh")} />Refresh invitations</Button></div>
    {loading && !inventory ? <p role="status">Loading invitations…</p> : loadError ?
      <p className="settings-description">The invitation list could not refresh. Use Refresh invitations to try again.</p> :
      inventory?.invitations.length === 0 && <p className="invite-empty-state">No invitations yet. Invite a teammate when you are ready.</p>}
    {!!inventory?.invitations.length && <ul className="matrix-invite-list" aria-label="New-member invitations">
      {inventory.invitations.map(item => <li key={item.id}>
        <div className="invite-row-content"><strong>{item.username ?? "Unclaimed invitation"}</strong>
          <span>Expires <time dateTime={new Date(item.expires * 1000).toISOString()}>{dateLabel(item.expires)}</time></span></div>
        <Badge variant={item.status === "accepted" ? "secondary" : "outline"}>{Object.hasOwn(statusLabels, item.status) ? statusLabels[item.status] : "Unknown status"}</Badge>
        {!terminalStatuses.has(item.status) && <Button variant="outline" size="sm" type="button" disabled={busy} onClick={() => void feedback.run(`revoke:${item.id}`, async () => {
          const epoch = generation.current;
          await api(`/tenants/${tenant}/invitations/${item.id}`, { method: "DELETE" });
          if (generation.current !== epoch) return;
          setGenerated(current => current?.id === item.id ? null : current);
          try { await load(epoch); }
          catch { return { kind: "warning", message: "Invitation revoked, but the list could not refresh. Refresh the list; do not revoke again." }; }
          return { kind: "success", message: "Invitation revoked. Any previously created Matrix account remains." };
        })}><PendingIcon pending={feedback.isPending(`revoke:${item.id}`)} />Revoke invitation</Button>}
      </li>)}
    </ul>}
  </section>;
}

// Intake precedes StrictMode mounts; invitation credentials live only in this document.
const joinToken = location.pathname === "/join" ? new URLSearchParams(location.hash.slice(1)).get("invite") ?? "" : "";
if (location.pathname === "/join") history.replaceState(null, "", "/join");
type JoinInfo = { workspace: string; status: string; username: string | null; server_name: string };
type JoinPhase = "checking" | "ready" | "missing" | "unavailable" | "temporary" | "rejected" | "success";
function failurePhase(error: unknown): JoinPhase {
  if (error instanceof ApiFailure) {
    if (error.status === 410) return "unavailable";
    if (error.status !== 429 && error.status < 500) return "rejected";
  }
  return "temporary";
}
export function JoinInvitation() {
  const [intake, setIntake] = useState({ token: joinToken, version: 0 });
  useEffect(() => {
    const receiveLink = () => {
      const token = new URLSearchParams(location.hash.slice(1)).get("invite");
      if (!token) return;
      history.replaceState(null, "", "/join");
      setIntake(current => ({ token, version: current.version + 1 }));
    };
    window.addEventListener("hashchange", receiveLink);
    return () => window.removeEventListener("hashchange", receiveLink);
  }, []);
  return <ActionFeedbackProvider><JoinForm key={intake.version} token={intake.token} /></ActionFeedbackProvider>;
}
function JoinForm({ token }: { token: string }) {
  const [claim] = useState(() => requestId() + requestId());
  const [phase, setPhase] = useState<JoinPhase>(token ? "checking" : "missing");
  const [info, setInfo] = useState<JoinInfo | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [complete, setComplete] = useState("");
  const [recovering, setRecovering] = useState(false);
  const generation = useRef(0);
  const feedback = useActionFeedback("join-invitation");
  const busy = feedback.pending !== null;
  useLayoutEffect(() => {
    generation.current += 1;
    return () => { generation.current += 1; };
  }, []);
  const applyInfo = (next: JoinInfo, epoch: number) => {
    if (generation.current !== epoch) return;
    setInfo(next); setPhase("ready");
    if (next.username) setUsername(next.username);
    setRecovering(next.status !== "pending");
  };
  useEffect(() => {
    if (!token) return;
    const epoch = generation.current;
    void post<JoinInfo>("/invitations/inspect", { token: token }).then(next => applyInfo(next, epoch), error => {
      if (generation.current === epoch) setPhase(failurePhase(error));
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const retryInspection = () => void feedback.run("inspect", async () => {
    const epoch = generation.current;
    setPhase("checking");
    try { applyInfo(await post<JoinInfo>("/invitations/inspect", { token: token }), epoch); }
    catch (error) {
      if (generation.current === epoch) setPhase(failurePhase(error));
      throw error;
    }
  });
  const usernameValid = /^[a-z][a-z0-9._-]{2,31}$/.test(username);
  const passwordBytes = new TextEncoder().encode(password).length;
  const passwordValid = password.length >= 12 && passwordBytes <= 256;
  const usernameError = username && !usernameValid ? "Use 3–32 lowercase letters, numbers, dots, dashes or underscores; start with a letter." : "";
  const passwordError = password && !passwordValid ? passwordBytes > 256 ? "Use a password of no more than 256 bytes." : "Use at least 12 characters." : "";
  const signIn = <a className="join-signin" href="/">Sign in</a>;
  return <main className="login-page"><section className="login-card join-card" aria-labelledby="join-title" data-phase={phase}>
    <div className="login-brand"><img src="/agentic-enterprise-logo.png" alt="" width={36} height={36} /><span>Agentic Enterprise</span></div>
    <h1 id="join-title">{phase === "success" ? "Account created" : phase === "ready" && info ? `Join ${info.workspace}` : phase === "unavailable" ? "Invitation unavailable" : phase === "temporary" ? "Unable to check invitation" : phase === "rejected" ? "Invitation could not be checked" : "Join your workspace"}</h1>
    {phase === "checking" ? <p role="status">Checking invitation…</p> : phase === "success" ? <div className="join-state-content">
      <p>Sign in to access your workspace.</p>{signIn}
      <details><summary>Account details</summary><p>{complete}</p><p>Joining does not replace an account already signed in to this browser. Use a separate browser profile if needed. Room and project access are managed separately.</p></details>
    </div> : phase !== "ready" ? <div className="join-state-content">
      <p>{phase === "missing" ? "Open your original invitation link, or sign in if you already created an account." : phase === "unavailable" ? "Already created your account? Sign in. Otherwise, ask the workspace owner for a new invitation." : phase === "temporary" ? "We could not check this link right now. Keep this page open and try again." : "Open the invitation on the workspace's original address. If it still cannot be checked, contact the workspace owner."}</p>
      {(phase === "temporary" || phase === "rejected") && token && <Button type="button" variant="outline" disabled={busy} onClick={retryInspection}><PendingIcon pending={busy} />Check invitation again</Button>}
      {signIn}
    </div> : info && <>
      <p className="join-introduction">Create your account to access this workspace.</p>
      {recovering && <div className="join-recovery" role="note"><strong>Finish joining your workspace</strong><p>Keep this page open. Enter the same username and password to confirm your account and finish joining. This does not reset your password.</p></div>}
      <form aria-label="Accept invitation" onSubmit={e => {
        e.preventDefault();
        if (!usernameValid || !passwordValid || password !== confirmation || busy) return;
        void feedback.run("accept", async () => {
          const epoch = generation.current;
          try {
            const result = await post<{ status: string; user: string }>("/invitations/accept", { token: token, claim, username, password });
            if (generation.current !== epoch) return;
            if (result.status !== "accepted" || !result.user) throw new Error("Account completion could not be confirmed. Keep this page open and retry the same credentials.");
            setComplete(result.user); setPhase("success");
            return { kind: "success", message: "Account created and workspace membership confirmed. You can now sign in." };
          } catch (error) {
            try { applyInfo(await post<JoinInfo>("/invitations/inspect", { token: token }), epoch); }
            catch {
              if (generation.current === epoch) setRecovering(true);
            }
            throw error;
          } finally {
            if (generation.current === epoch) { setPassword(""); setConfirmation(""); }
          }
        }, { errorMessage: "Account acceptance could not be confirmed. Keep this page open and retry the same username and password to recover safely." });
      }}>
        <fieldset disabled={busy} className="join-fields">
          <Field.Root className="login-field" invalid={!!usernameError}>
            <Field.Label htmlFor="join-username">Username</Field.Label><Input id="join-username" readOnly={info.username !== null} autoComplete="username" autoCapitalize="none" spellCheck={false} required minLength={3} maxLength={32} value={username} onChange={e => setUsername(e.target.value)} aria-describedby="join-username-help" aria-invalid={!!usernameError} />
            <Field.Description id="join-username-help" className="login-hint">{usernameError || "3–32 characters. Start with a lowercase letter."}</Field.Description>
          </Field.Root>
          <Field.Root className="login-field" invalid={!!passwordError}>
            <Field.Label htmlFor="join-password">Choose password</Field.Label><Input id="join-password" type="password" autoComplete="new-password" required minLength={12} maxLength={256} value={password} onChange={e => setPassword(e.target.value)} aria-describedby="join-password-help" aria-invalid={!!passwordError} />
            <Field.Description id="join-password-help" className="login-hint">{passwordError || "At least 12 characters."}</Field.Description>
          </Field.Root>
          <Field.Root className="login-field" invalid={!!confirmation && confirmation !== password}>
            <Field.Label htmlFor="join-confirm">Confirm password</Field.Label><Input id="join-confirm" type="password" autoComplete="new-password" required value={confirmation} onChange={e => setConfirmation(e.target.value)} aria-invalid={!!confirmation && confirmation !== password} aria-describedby={confirmation && confirmation !== password ? "join-confirm-help" : undefined} />
            {confirmation && confirmation !== password && <Field.Description id="join-confirm-help" className="login-hint">Passwords must match.</Field.Description>}
          </Field.Root>
          <details className="join-account-details"><summary>Username rules and account details</summary><p>Use lowercase letters, numbers, dots, dashes or underscores, starting with a letter. Platform and bot names are reserved. Passwords must contain at least 12 characters and no more than 256 bytes.</p><p>Your account is created on {info.server_name}. Only you choose its password. The invitation grants Member access; room and project access are managed separately.</p><p>Already have an account? Ask the workspace owner to use Existing Matrix account.</p></details>
          <Button type="submit" disabled={busy || !usernameValid || !passwordValid || password !== confirmation}><PendingIcon pending={busy} />{busy ? "Confirming account and access…" : "Create account and join"}</Button>
        </fieldset>
      </form>
    </>}
  </section></main>;
}
