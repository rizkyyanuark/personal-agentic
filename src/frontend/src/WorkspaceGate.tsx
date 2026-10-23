import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { api, post, put, ApiFailure } from "./api";
import App from "./App";
import { ActionFeedbackProvider, PendingIcon, useActionFeedback } from "./ActionFeedback";
import { navigate, useRoute } from "./navigation";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { ValuePicker } from "./ValuePicker";
import { ArrowRight, Eye, EyeOff, LoaderCircle, Settings2, Plus, Users, Building2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./components/ui/dialog";
import "./platform-settings.css";
import { MatrixInvitations } from "./MatrixInvitations";
type Tenant = { id: string; name: string; deleted: boolean; role: string };
type Person = { user: string; role: string };
export function WorkspaceGate() {
  return <ActionFeedbackProvider><WorkspaceEntry /></ActionFeedbackProvider>;
}

function WorkspaceEntry() {
  const [user, setUser] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selected, setSelected] = useState(() => document.cookie.split(";").map(s => s.trim()).find(s => s.startsWith("ae_workspace="))?.split("=")[1] ?? "default");
  const selectedRef = useRef(selected);
  const [generation, setGeneration] = useState(0);
  const activeGenRef = useRef(0);
  useLayoutEffect(() => { selectedRef.current = selected; }, [selected]);
  const isCurrentSelected = useCallback((id: string, gen?: number) =>
    selectedRef.current === id && (gen === undefined || activeGenRef.current === gen), []);
  const entryFeedback = useActionFeedback("entrypoint", `${user ?? "signed-out"}:${selected}`);
  const setNotificationScope = entryFeedback.setScope;
  useLayoutEffect(() => setNotificationScope(`${user ?? "signed-out"}:${selected}:${generation}`), [user, selected, generation, setNotificationScope]);
  const [ready, setReady] = useState(false);
  const [matrix, setMatrix] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [owner, setOwner] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const manage = useRoute().view === "Workspace settings";
  const setManage = (open: boolean) => navigate(open ? "/settings/workspace" : "/groups/general/chat");
  const [busy, setBusy] = useState(false);
  const workspace = tenants.find(t => t.id === selected && !t.deleted);
  function choose(id: string) {
    activeGenRef.current += 1;
    const nextGen = activeGenRef.current;
    setGeneration(nextGen);
    document.cookie = `ae_workspace=${id}; Path=/; SameSite=Strict`;
    setSelected(id);
    if (!manage) setManage(false);
  }
  const userRef = useRef<string | null>(user);
  useLayoutEffect(() => { userRef.current = user; }, [user]);
  const refresh = useCallback(async (expectedId?: string, expectedGen?: number, expectedUser?: string | null) => {
    const callGen = expectedGen !== undefined ? expectedGen : activeGenRef.current;
    const callUser = expectedUser !== undefined ? expectedUser : userRef.current;
    const isStillCurrent = () => {
      if (expectedGen !== undefined && activeGenRef.current !== expectedGen) return false;
      if (expectedId !== undefined && selectedRef.current !== expectedId) return false;
      if (expectedGen === undefined && activeGenRef.current !== callGen) return false;
      if (callUser !== null && userRef.current !== null && userRef.current !== callUser) return false;
      return true;
    };
    const me = await api<{ user: string; matrix: boolean; display_name?: string | null }>("/me");
    if (!isStillCurrent()) return;
    setUser(me.user); setMatrix(me.matrix); setDisplayName(me.display_name ?? null);
    const values = await api<Tenant[]>("/tenants");
    if (!isStillCurrent()) return;
    setTenants(values);
    const currentSelected = selectedRef.current;
    if (values.some(t => t.id === currentSelected && !t.deleted)) return;
    const next = values.find(t => !t.deleted);
    if (next) choose(next.id);
  }, []);
  async function act(fn: () => Promise<void>) {
    await entryFeedback.run("action", async () => { setBusy(true);  try { await fn(); } finally { setBusy(false); } });
  }
  useEffect(() => { void (async () => { try {
    const config = await api<{matrix:boolean}>("/auth"); setMatrix(config.matrix);
    const token = new URLSearchParams(location.hash.slice(1)).get("key");
    if(token){history.replaceState(null,"",location.pathname+location.search);await post("/login",{token});}
    await refresh();
  } catch(e) { if (!(e instanceof ApiFailure && e.status === 401)) void entryFeedback.run("startup-error", async () => { throw e; }); } finally {setReady(true);} })(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if(!ready) return <main className="login-page"><p className="login-loading" role="status"><LoaderCircle className="animate-spin" aria-hidden="true" size={20}/>Connecting to your workspace…</p></main>;
  if(!user) return <main className="login-page"><section className="login-card" aria-labelledby="login-title">
    <div className="login-brand"><img src="/agentic-enterprise-logo.png" alt="" width={36} height={36}/><span>Agentic Enterprise</span></div>
    <h1 id="login-title">{owner||!matrix ? "Administrator sign in" : "Welcome back"}</h1>
    <p>{owner||!matrix ? "Use your owner key to manage this platform." : "Sign in to your workspace. Your team and agents are here."}</p>
    <form aria-label="Sign in" aria-busy={busy} onSubmit={e=>{e.preventDefault();void act(async()=>{
      try { await post("/login", matrix&&!owner ? {username:username.trim(),password}:{token:password.trim()}); }
      catch(e) {
        if(e instanceof ApiFailure && e.status===401) throw new Error(matrix&&!owner ? "The username or password is incorrect. Please try again." : "That owner key is not valid. Check your key and try again.");
        throw e;
      }
      setPassword("");setShowPassword(false);await refresh();
    });}}>
      <fieldset disabled={busy}>
        {matrix&&!owner&&<div className="login-field"><label htmlFor="login-username">Username</label><Input id="login-username" name="username" required autoComplete="username" autoCapitalize="none" spellCheck={false} aria-describedby="login-account-help" value={username} onChange={e=>setUsername(e.target.value)}/><p id="login-account-help" className="login-hint">Use the Matrix account provided by your workspace administrator.</p></div>}
        <div className="login-field"><label htmlFor="login-password">{matrix&&!owner?"Password":"Owner key"}</label><div className="login-secret"><Input id="login-password" name="password" required type={showPassword?"text":"password"} autoComplete={matrix&&!owner?"current-password":"off"} value={password} onChange={e=>setPassword(e.target.value)}/><Button type="button" variant="ghost" className="login-reveal" aria-label={showPassword?"Hide password":"Show password"} aria-pressed={showPassword} onClick={()=>setShowPassword(v=>!v)}>{showPassword?<EyeOff aria-hidden="true"/>:<Eye aria-hidden="true"/>}</Button></div></div>

        <Button type="submit" className="login-submit" disabled={busy}>{busy?<><LoaderCircle className="animate-spin" aria-hidden="true"/>Signing in…</>:<>Sign in<ArrowRight aria-hidden="true"/></>}</Button>
      </fieldset>
    </form>
    <p className="login-help">{owner||!matrix ? "Your deployment administrator can provide the owner key." : "Need access or help signing in? Contact your workspace administrator."}</p>
    {matrix&&<div className="login-alternate"><Button type="button" variant="link" disabled={busy} onClick={()=>{setOwner(v=>!v);setPassword("");setShowPassword(false);}}>{owner?"Back to account sign in":"Administrator sign in"}</Button></div>}
  </section></main>;

  return <div className="platform-shell">
    <header className="workspace-bar">
      <Building2 size={18} aria-hidden="true"/>
      <label className="workspace-switcher"><span>Workspace</span><ValuePicker searchable aria-label="Workspace" value={workspace?.id??""} onValueChange={choose} options={[{ value: "", label: "Select workspace", disabled: true }, ...tenants.filter(t=>!t.deleted).map(t=>({ value: t.id, label: t.name }))]} /></label>
      {workspace&&<span className="settings-badge">{workspace.role === "owner" ? "Owner" : "Member"}</span>}
      <Button variant="ghost" className="workspace-manage" aria-label="Manage workspaces" onClick={()=>setManage(true)}><Settings2 size={16}/><span>Manage workspaces</span></Button>
    </header>

    <Dialog open={!workspace} onOpenChange={setManage}>
      <DialogContent className="workspace-dialog">
        <DialogHeader><DialogTitle>Workspaces</DialogTitle><DialogDescription>Each workspace has its own people, agents, and conversations.</DialogDescription></DialogHeader>

        <section className="settings-card">
          <div className="settings-section-title"><Plus size={18} /><h2>Create a workspace</h2></div>
          <form className="settings-inline-form" onSubmit={e => {
            e.preventDefault();
            void act(async () => {
              const t = await post<Tenant>("/tenants", { name: name.trim() });
              setName("");
              await refresh();
              choose(t.id);
            });
          }}>
            <label htmlFor="new-workspace">New workspace<Input id="new-workspace" required maxLength={80} placeholder="e.g. Engineering" value={name} onChange={e => setName(e.target.value)} disabled={busy} /></label>
            <Button type="submit" disabled={busy || !name.trim()}>{busy ? "Creating…" : "Create workspace"}</Button>
          </form>
        </section>
        {tenants.filter(t => t.deleted).length > 0 && (
          <section className="settings-card">
            <h2>Deleted workspaces</h2>
            {tenants.filter(t => t.deleted).map(t => (
              <div className="settings-person" key={t.id}>
                <strong>{t.name}</strong>
                {t.role === "owner" && (
                  <Button variant="outline" disabled={busy} onClick={() => void act(async () => {
                    await put(`/tenants/${t.id}`, { deleted: false });
                    await refresh();
                  })}>Restore</Button>
                )}
              </div>
            ))}
          </section>
        )}
        <Button variant="ghost" onClick={() => void act(async () => {
          await post("/logout");
          location.reload();
        })}>Sign out</Button>
      </DialogContent>
    </Dialog>
    {workspace && (
      <div className="platform-content">
        <>
          <App
            key={workspace.id}
            workspaceSettings={
              <SelectedWorkspaceSettings
                key={selected}
                workspace={workspace}
                selected={selected}
                generation={generation}
                user={user}
                tenants={tenants}
                refresh={refresh}
                choose={choose}
                isCurrentSelected={isCurrentSelected}
              />
            }
            user={user}
            displayName={displayName}
            onDisplayNameChange={setDisplayName}
            workspaceName={workspace.name}
            workspaceId={workspace.id}
            role={workspace.role}
            controllerAccess={user === "owner" && selected === "default"}
          />
        </>
      </div>
    )}
  </div>;
}

type SelectedWorkspaceSettingsProps = {
  workspace: Tenant;
  selected: string;
  generation: number;
  user: string | null;
  tenants: Tenant[];
  refresh: (expectedId?: string, expectedGen?: number) => Promise<void>;
  choose: (id: string) => void;
  isCurrentSelected: (id: string, gen?: number) => boolean;
};

function SelectedWorkspaceSettings({
  workspace,
  selected,
  generation,
  user,
  tenants,
  refresh,
  choose,
  isCurrentSelected,
}: SelectedWorkspaceSettingsProps) {
  const mountGen = useRef(generation);
  const feedback = useActionFeedback(`workspace-settings:${selected}`, selected);
  const busy = feedback.pending !== null;
  const [people, setPeople] = useState<Person[]>([]);
  const [name, setName] = useState("");
  const [invite, setInvite] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [peopleError, setPeopleError] = useState("");
  const [loadingPeople, setLoadingPeople] = useState(false);
  const [deletedId, setDeletedId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const callGen = mountGen.current;
    if (workspace.role === "owner") {
      void api<Person[]>(`/tenants/${selected}/members`).then(
        list => { if (active && isCurrentSelected(selected, callGen)) { setPeople(list); setPeopleError(""); } },
        err => { if (active && isCurrentSelected(selected, callGen)) { setPeopleError(err instanceof Error ? err.message : String(err)); } }
      );
    }
    return () => { active = false; };
  }, [workspace.role, selected, isCurrentSelected]);

  const retryLoadMembers = async () => {
    setLoadingPeople(true);
    const origin = selected;
    const callGen = mountGen.current;
    try {
      const list = await api<Person[]>(`/tenants/${selected}/members`);
      if (isCurrentSelected(origin, callGen)) {
        setPeople(list);
        setPeopleError("");
      }
    } catch (err) {
      if (isCurrentSelected(origin, callGen)) {
        setPeopleError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (isCurrentSelected(origin, callGen)) {
        setLoadingPeople(false);
      }
    }
  };

  return <>
    <section className="settings-card">
      <div className="settings-section-title"><Plus size={18}/><h2>Create a workspace</h2></div>
      <form className="settings-inline-form" onSubmit={e => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed || busy) return;
        void feedback.run("create", async () => {
          const origin = selected;
          const callGen = mountGen.current;
          let t: Tenant;
          try {
            t = await post<Tenant>("/tenants", { name: trimmed });
          } catch (err) {
            return { kind: "error", message: err instanceof Error ? err.message : "Could not create workspace." };
          }
          if (isCurrentSelected(origin, callGen)) {
            setName("");
          }
          try {
            await refresh(origin, callGen);
          } catch {
            return { kind: "warning", message: `${t.name}: workspace created, but the workspace list could not refresh.` };
          }
          if (isCurrentSelected(origin, callGen)) {
            choose(t.id);
          }
          return { kind: "success", message: `${t.name}: workspace created.` };
        }, { errorMessage: "Workspace creation could not be confirmed." });
      }}>
        <label htmlFor="new-workspace">New workspace<Input id="new-workspace" required maxLength={80} placeholder="e.g. Engineering" value={name} onChange={e => setName(e.target.value)} disabled={busy} /></label>
        <Button type="submit" disabled={busy || !name.trim()} aria-busy={feedback.isPending("create")}><PendingIcon pending={feedback.isPending("create")} size={16} />{feedback.isPending("create") ? "Creating…" : "Create workspace"}</Button>
      </form>
    </section>
    <section className="settings-card">
      <div className="settings-section-title"><Building2 size={18}/><h2>{workspace.name}</h2><span className="settings-badge">{workspace.role}</span></div>
      {workspace.role === "owner" ? <>
        <form className="settings-inline-form" onSubmit={e => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          const nextName = String(form.get("name") ?? "").trim();
          if (!nextName || busy) return;
          void feedback.run("rename", async () => {
            const origin = selected;
            const callGen = mountGen.current;
            try {
              await put(`/tenants/${selected}`, { name: nextName });
            } catch (err) {
              return { kind: "error", message: err instanceof Error ? err.message : "Could not rename workspace." };
            }
            try {
              await refresh(origin, callGen);
            } catch {
              return { kind: "warning", message: `${nextName}: workspace renamed, but the view could not refresh.` };
            }
            return { kind: "success", message: `${nextName}: workspace renamed.` };
          }, { errorMessage: "Workspace rename could not be confirmed." });
        }}>
          <label htmlFor="workspace-name">Name<Input id="workspace-name" name="name" defaultValue={workspace.name} key={workspace.id + workspace.name} required maxLength={80} disabled={busy} /></label>
          <Button type="submit" variant="outline" disabled={busy} aria-busy={feedback.isPending("rename")}><PendingIcon pending={feedback.isPending("rename")} size={16} />{feedback.isPending("rename") ? "Renaming…" : "Rename"}</Button>
        </form>
        <div className="settings-section-title"><Users size={18}/><h3>People</h3></div>
        {peopleError && (
          <div className="settings-people-error">
            <p role="alert" className="error">{peopleError}</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy || loadingPeople}
              onClick={() => void retryLoadMembers()}
            >
              <PendingIcon pending={loadingPeople} size={14} />
              Retry loading members
            </Button>
          </div>
        )}
        <div className="settings-people">{people.map(p => <div className="settings-person" key={p.user}><span className="settings-avatar" aria-hidden="true">{p.user.replace(/^@/, "").slice(0, 1).toUpperCase()}</span><strong>{p.user}</strong><ValuePicker aria-label={`Role for ${p.user}`} value={p.role} disabled={busy || p.user === user || p.user === "owner"} onValueChange={value => {
          void feedback.run(`role:${p.user}`, async () => {
            const origin = selected;
            const callGen = mountGen.current;
            let nextPeople: Person[];
            try {
              nextPeople = await put<Person[]>(`/tenants/${selected}/members`, { user: p.user, role: value });
            } catch (err) {
              return { kind: "error", message: err instanceof Error ? err.message : `Could not change role for ${p.user}.` };
            }
            if (isCurrentSelected(origin, callGen)) {
              setPeople(nextPeople);
            }
            try {
              await refresh(origin, callGen);
            } catch {
              return { kind: "warning", message: `${p.user}: role updated, but the view could not refresh.` };
            }
            return { kind: "success", message: `${p.user} is now ${value}.` };
          }, { errorMessage: `Role change for ${p.user} could not be confirmed.` });
        }} options={[{ value: "member", label: "Member" }, { value: "owner", label: "Owner" }]} />{p.role === "member" && <Button variant="ghost" disabled={busy} aria-busy={feedback.isPending(`remove:${p.user}`)} onClick={() => {
          void feedback.run(`remove:${p.user}`, async () => {
            const origin = selected;
            const callGen = mountGen.current;
            let nextPeople: Person[];
            try {
              nextPeople = await api<Person[]>(`/tenants/${selected}/members`, { method: "DELETE", body: JSON.stringify({ user: p.user }) });
            } catch (err) {
              return { kind: "error", message: err instanceof Error ? err.message : `Could not remove ${p.user}.` };
            }
            if (isCurrentSelected(origin, callGen)) {
              setPeople(nextPeople);
            }
            return { kind: "success", message: `Removed ${p.user} from ${workspace.name}.` };
          }, { errorMessage: `Removal of ${p.user} could not be confirmed.` });
        }}>{feedback.isPending(`remove:${p.user}`) ? "Removing…" : "Remove"}</Button>}</div>)}</div>
        <MatrixInvitations key={selected} tenant={selected} />
        <form className="settings-inline-form" onSubmit={e => {
          e.preventDefault();
          const trimmed = invite.trim();
          if (!trimmed || busy) return;
          void feedback.run("invite", async () => {
            const origin = selected;
            const callGen = mountGen.current;
            let nextPeople: Person[];
            try {
              nextPeople = await post<Person[]>(`/tenants/${selected}/members`, { user: trimmed, role: inviteRole });
            } catch (err) {
              return { kind: "error", message: err instanceof Error ? err.message : `Could not invite ${trimmed}.` };
            }
            if (isCurrentSelected(origin, callGen)) {
              setPeople(nextPeople);
              setInvite("");
            }
            return { kind: "success", message: `Invited ${trimmed} to ${workspace.name}.` };
          }, { errorMessage: `Invitation for ${trimmed} could not be confirmed.` });
        }}>
          <label htmlFor="workspace-invite">Invite Matrix user<Input id="workspace-invite" value={invite} onChange={e => setInvite(e.target.value)} placeholder="@person:server" required disabled={busy} /></label>
          <label htmlFor="invite-role">Role<ValuePicker id="invite-role" value={inviteRole} onValueChange={setInviteRole} options={[{ value: "member", label: "Member" }, { value: "owner", label: "Owner" }]} disabled={busy} /></label>
          <Button type="submit" variant="outline" disabled={busy || !invite.trim()} aria-busy={feedback.isPending("invite")}><PendingIcon pending={feedback.isPending("invite")} size={16} />{feedback.isPending("invite") ? "Inviting…" : "Invite"}</Button>
        </form>
        <details className="workspace-danger"><summary>Delete workspace</summary><p>History is retained. You can restore this workspace later.</p>
          {deletedId === workspace.id ? (
            <Button
              variant="outline"
              disabled={busy}
              aria-busy={feedback.isPending("refresh")}
              onClick={() => void feedback.run("refresh", async () => {
                const origin = selected;
                const callGen = mountGen.current;
                await refresh(origin, callGen);
                return { kind: "success", message: `${workspace.name} deleted.` };
              }, { errorMessage: "The view could not refresh. The workspace remains deleted." })}
            >
              <PendingIcon pending={feedback.isPending("refresh")} size={16} />
              Retry refresh
            </Button>
          ) : (
            <Button variant="destructive" disabled={busy} aria-busy={feedback.isPending("delete")} onClick={() => {
              if (!confirm(`Delete ${workspace.name}? History will be retained for restoration.`)) return;
              void feedback.run("delete", async () => {
                const origin = selected;
                const callGen = mountGen.current;
                try {
                  await api(`/tenants/${selected}`, { method: "DELETE", body: "{}" });
                  if (isCurrentSelected(origin, callGen)) {
                    setDeletedId(origin);
                  }
                } catch (err) {
                  return { kind: "error", message: err instanceof Error ? err.message : `Could not delete ${workspace.name}.` };
                }
                try {
                  await refresh(origin, callGen);
                } catch {
                  return { kind: "warning", message: `${workspace.name} deleted, but the workspace list could not refresh.` };
                }
                return { kind: "success", message: `${workspace.name} deleted. History is retained for restoration.` };
              }, { errorMessage: `Deletion of ${workspace.name} could not be confirmed.` });
            }}><PendingIcon pending={feedback.isPending("delete")} size={16} />{feedback.isPending("delete") ? "Deleting…" : "Delete workspace"}</Button>
          )}
        </details>
      </> : <p className="settings-description">You are a member of this workspace. Its owner manages invitations, agents, and connected machines.</p>}
    </section>
    {tenants.filter(t => t.deleted).length > 0 && <section className="settings-card"><h2>Deleted workspaces</h2>{tenants.filter(t => t.deleted).map(t => <div className="settings-person" key={t.id}><strong>{t.name}</strong>{t.role === "owner" && <Button variant="outline" disabled={busy} aria-busy={feedback.isPending(`restore:${t.id}`)} onClick={() => {
      void feedback.run(`restore:${t.id}`, async () => {
        const origin = selected;
        const callGen = mountGen.current;
        try {
          await put(`/tenants/${t.id}`, { deleted: false });
        } catch (err) {
          return { kind: "error", message: err instanceof Error ? err.message : `Could not restore ${t.name}.` };
        }
        try {
          await refresh(origin, callGen);
        } catch {
          return { kind: "warning", message: `${t.name}: workspace restored, but the view could not refresh.` };
        }
        return { kind: "success", message: `${t.name}: workspace restored.` };
      }, { errorMessage: `Restoration of ${t.name} could not be confirmed.` });
    }}><PendingIcon pending={feedback.isPending(`restore:${t.id}`)} size={16} />{feedback.isPending(`restore:${t.id}`) ? "Restoring…" : "Restore"}</Button>}</div>)}</section>}
  </>;
}
