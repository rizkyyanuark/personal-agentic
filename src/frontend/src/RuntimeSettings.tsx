import { useEffect, useState } from "react";
import { Button } from "./components/ui/button";
import { Textarea } from "./components/ui/textarea";
import type { Agent } from "./bindings/Agent";
import { availableHarnesses, harnessNames, type RegisteredRuntime } from "./runtimeCatalog";
import { Input } from "./components/ui/input";
import { Server, Plus, Copy, Check, KeyRound, RefreshCw } from "lucide-react";
import { api, post, put } from "./api";
import { ActionStatus, PendingIcon, useActionFeedback } from "./ActionFeedback";
import { ValuePicker } from "./ValuePicker";
export function RuntimeSelect({value,onChange,onLoaded,disabled=false,required=false,allowController=false}: {
  value:string; onChange:(id:string)=>void; onLoaded?:(runtimes:RegisteredRuntime[])=>void;
  disabled?:boolean; required?:boolean; allowController?:boolean;
}) {
  const [runtimes,setRuntimes]=useState<RegisteredRuntime[]>([]);
  const [error,setError]=useState("");
  useEffect(()=>{
    let cancelled=false;
    const refresh=()=>void api<RegisteredRuntime[]>("/runtimes").then(values=>{if(!cancelled){setError("");setRuntimes(values);onLoaded?.(values);}},e=>{if(!cancelled)setError(String(e));});
    refresh();window.addEventListener("focus",refresh);
    return()=>{cancelled=true;window.removeEventListener("focus",refresh);};
  },[onLoaded,value]);
  return <label className="runtime-select">Registered runtime <ValuePicker searchable aria-label="Registered runtime" value={value} disabled={disabled} required={required} onValueChange={onChange}
    options={[
      { value: "", label: allowController ? "Controller / SSH" : "Choose a runtime", disabled: !allowController },
      ...runtimes.filter(r=>!r.revoked||r.id===value).map(r=>({ value: r.id, label: r.name, disabled: r.revoked })),
      ...(value&&!runtimes.some(r=>r.id===value) ? [{ value, label: error?"Runtime unavailable":"Loading runtime…", disabled: true }] : []),
    ]} />{error&&<span role="alert">{error}</span>}</label>;
}
export function HarnessSelect({id,value,onChange,runtimeId,runtimes,allowController=false}: {
  id:string; value:Agent["harness"]|""; onChange:(harness:Agent["harness"])=>void;
  runtimeId:string; runtimes:RegisteredRuntime[]; allowController?:boolean;
}) {
  const runtime=runtimes.find(r=>r.id===runtimeId);
  const options=runtimeId?availableHarnesses(runtime):allowController?(Object.keys(harnessNames) as Agent["harness"][]):[];
  return <><label htmlFor={id}>Harness</label><ValuePicker id={id} value={value} disabled={!options.length||Boolean(runtimeId&&(!runtime?.online||runtime.revoked))} required onValueChange={next=>onChange(next as Agent["harness"])}
    options={[
      ...(!value ? [{ value: "", label: "Choose a harness", disabled: true }] : []),
      ...(value&&!options.includes(value) ? [{ value, label: `${harnessNames[value]} (unavailable)`, disabled: true }] : []),
      ...options.map(harness=>({ value: harness, label: harnessNames[harness] })),
    ]} />{runtimeId&&(!runtime?.online||runtime.revoked)?<p className="hint">Connect this runtime to choose an available harness.</p>:runtimeId&&!options.length?<p className="hint">No harness catalog reported. Install and sign in to a harness on this machine, then refresh.</p>:null}</>;
}
export function RuntimeSettings({enrollmentToken,onEnrollmentTokenChange}:{enrollmentToken:string;onEnrollmentTokenChange:(token:string)=>void}){
  const [runtimes,setRuntimes]=useState<RegisteredRuntime[]>([]);
  const [name,setName]=useState("");
  const [controllerUrl,setControllerUrl]=useState(location.origin);
  const [installerPlatform,setInstallerPlatform]=useState("windows-x64");
  let controllerOrigin = "";
  let loopbackController = false;
  try {
    const parsed = new URL(controllerUrl);
    if (["http:","https:"].includes(parsed.protocol) && /^(?:[A-Za-z0-9.-]+|\[[0-9A-Fa-f:]+\])$/.test(parsed.hostname) && !parsed.username && !parsed.password && parsed.pathname === "/" && !parsed.search && !parsed.hash) {
      loopbackController = ["localhost","127.0.0.1","[::1]"].includes(parsed.hostname);
      if (parsed.protocol === "https:" || loopbackController) controllerOrigin = parsed.origin;
    }
  } catch { /* The URL field displays validation below. */ }
  const installerCommand = !controllerOrigin ? "" : installerPlatform === "windows-x64"
    ? `pwsh -NoProfile -File ./setup-worker.ps1 -Controller '${controllerOrigin}'`
    : `AE_CONTROLLER_URL='${controllerOrigin}' bash ./setup-worker.sh`;
  const token=enrollmentToken;
  const setToken=onEnrollmentTokenChange;
  const [error,setError]=useState("");
  const feedback=useActionFeedback("runtimes");
  const busy=feedback.pending!==null;
  const [loading,setLoading]=useState(true);
  const [copied,setCopied]=useState(false);
  const [revoking,setRevoking]=useState("");
  const [editing,setEditing]=useState("");
  async function refresh(){setRuntimes(await api<RegisteredRuntime[]>("/runtimes"));}
  useEffect(()=>{void api<RegisteredRuntime[]>("/runtimes").then(setRuntimes).catch(e=>setError(e instanceof Error?e.message:String(e))).finally(()=>setLoading(false));const t=setInterval(()=>void refresh().catch(e=>setError(e instanceof Error?e.message:String(e))),5000);return()=>clearInterval(t);},[]);
  async function act(action:string, work:()=>Promise<void>, message:string){
    setError("");
    await feedback.run(action,async()=>{
      await work();
      try{await refresh();}catch{
        if(action==="refresh")return {kind:"error",message:"Runtime list could not refresh. Retry refresh; existing registrations are unchanged by this read."};
        return {kind:"warning",message:`${message} The runtime list could not refresh. Refresh the list without repeating the change.`};
      }
      return {kind:"success",message};
    },{errorMessage:action==="refresh"?"Runtime list could not refresh. Retry refresh.":"The runtime change could not be confirmed. Refresh the list before trying again."});
  }
  const active=runtimes.filter(r=>!r.revoked);
  return <div className="runtime-settings">
    {error&&<p className="banner error" role="alert">{error}</p>}
    <ActionStatus feedback={feedback}/>
    <section className="settings-card">
      <div className="settings-section-title"><Server size={20}/><h2>Agent runtimes</h2><span className="settings-badge">{active.length} registered</span><Button variant="ghost" aria-label={feedback.isPending("refresh")?"Refreshing runtimes":"Refresh runtimes"} aria-busy={feedback.isPending("refresh")} disabled={busy} onClick={()=>void act("refresh",async()=>{},"Runtime list refreshed.")}><PendingIcon pending={feedback.isPending("refresh")} size={16}/>{!feedback.isPending("refresh")&&<RefreshCw size={16}/>}</Button></div>
      {loading?<p className="settings-description" role="status">Loading runtimes…</p>:active.length===0?<div className="runtime-empty"><span className="runtime-empty-icon"><Server size={28}/></span><h3>Connect your first machine</h3><p>Run agents on your computer, a server, or a Docker container. Register it below, then connect the worker.</p></div>:<div className="runtime-list">{active.map(r=><article className="runtime-row" key={r.id}>
        <span className="runtime-device"><Server size={20}/></span><div className="runtime-info"><strong>{r.name}</strong><span>{r.os||"Waiting for worker to connect"}</span>{r.root&&<code title={r.root}>{r.root}</code>}{r.description&&<span>{r.description}</span>}<span>{availableHarnesses(r).map(h=>harnessNames[h]).join(" · ")||"No harness catalog reported"}</span></div>
        <span className={`runtime-status ${r.online?"online":"offline"}`}><i/>{r.online?"Online":r.os?"Offline":"Not connected"}</span>
        <Button variant="ghost" aria-label={`Edit ${r.name}`} disabled={busy} onClick={()=>{feedback.clear();setEditing(editing===r.id?"":r.id);}}>Edit</Button>
        {editing===r.id&&<form className="runtime-edit form-stack" onSubmit={event=>{
          event.preventDefault();const fields=new FormData(event.currentTarget);
          const metadata={name:String(fields.get("name")),description:String(fields.get("description"))};
          void act(`edit:${r.id}`,async()=>{await put(`/runtimes/${r.id}`,metadata);setRuntimes(values=>values.map(value=>value.id===r.id?{...value,...metadata}:value));setEditing("");},`${metadata.name} runtime settings saved.`);
        }} onChangeCapture={()=>{feedback.clear();}}><label>Runtime name<Input name="name" defaultValue={r.name} disabled={busy} required maxLength={80}/></label><label>Description<Textarea name="description" defaultValue={r.description??""} disabled={busy} maxLength={2000}/></label>
          <p className="hint">Root folder, operating system and available harnesses are reported by the worker. Change those on its machine.</p>
          <div className="action-controls"><Button type="submit" disabled={busy} aria-busy={feedback.isPending(`edit:${r.id}`)}><PendingIcon pending={feedback.isPending(`edit:${r.id}`)} size={16}/>{feedback.isPending(`edit:${r.id}`)?"Saving runtime…":"Save runtime"}</Button><Button type="button" variant="outline" disabled={busy} onClick={()=>setEditing("")}>Cancel</Button></div>
        </form>}
        {revoking===r.id?<div className="runtime-confirm"><p>Disconnect this runtime? Its saved registration will stop working.</p><Button variant="destructive" disabled={busy} aria-busy={feedback.isPending(`revoke:${r.id}`)} onClick={()=>void act(`revoke:${r.id}`,async()=>{await api(`/runtimes/${r.id}`,{method:"DELETE"});setRuntimes(values=>values.map(value=>value.id===r.id?{...value,revoked:true}:value));setRevoking("");},`${r.name} registration revoked. This does not confirm that native processes have stopped.`)}><PendingIcon pending={feedback.isPending(`revoke:${r.id}`)} size={16}/>{feedback.isPending(`revoke:${r.id}`)?"Revoking…":"Confirm revoke"}</Button><Button variant="ghost" disabled={busy} onClick={()=>setRevoking("")}>Cancel</Button></div>:<Button variant="ghost" disabled={busy} onClick={()=>{feedback.clear();setRevoking(r.id);}}>Revoke</Button>}
      </article>)}</div>}
    </section>
    <section className="settings-card">
      <div className="settings-section-title"><Plus size={20}/><h2>Register a runtime</h2></div><p className="settings-description">Give the machine a recognizable name. You’ll get a temporary key to connect its worker.</p>
      <form className="settings-inline-form" onSubmit={e=>{e.preventDefault();void act("register",async()=>{const r=await post<{enrollment_token:string}>("/runtimes",{name:name.trim()});setToken(r.enrollment_token);setCopied(false);setName("");},`${name.trim()} registered. Its temporary key is available in Runtime to connect its worker.`);}}><label htmlFor="runtime-name">Runtime name<Input id="runtime-name" required maxLength={80} disabled={busy} placeholder="e.g. MacBook or build server" value={name} onChange={e=>{feedback.clear();setName(e.target.value);}}/></label><Button type="submit" disabled={busy||!name.trim()} aria-busy={feedback.isPending("register")}><PendingIcon pending={feedback.isPending("register")} size={16}/>{feedback.isPending("register")?"Registering runtime…":"Register runtime"}</Button></form>
    </section>
    {token&&<section className="settings-card runtime-enrollment" aria-label="Connect your worker"><div className="settings-section-title"><KeyRound size={20}/><h2>Connect your worker</h2></div><p className="settings-description">This key can be used once and expires in 15 minutes.</p><div className="runtime-token"><Input aria-label="Enrollment token" readOnly type="password" value={token}/><Button variant="outline" onClick={()=>{void feedback.run("copy",async()=>{try{await navigator.clipboard.writeText(token);setCopied(true);return {kind:"success",message:"Enrollment token copied to clipboard."};}catch{return {kind:"error",message:"Could not copy the enrollment token. Select the token field and copy it manually."};}});}}>{copied?<Check size={16}/>:<Copy size={16}/>} {copied?"Copied":"Copy token"}</Button></div>
      <div className="runtime-instructions form-stack">
        <label htmlFor="runtime-controller-url">Reachable controller URL</label>
        <Input id="runtime-controller-url" value={controllerUrl} aria-invalid={!controllerOrigin} onChange={e=>setControllerUrl(e.target.value)}/>
        {!controllerOrigin&&<p className="hint" role="alert">Enter an HTTPS origin with a valid hostname and no path, query, or credentials. HTTP is supported only for localhost.</p>}
        {loopbackController&&<p className="hint">Localhost only works on this machine. For another device, enter the controller's reachable private HTTPS address first.</p>}
        <label htmlFor="worker-install-platform">Worker device</label>
        <ValuePicker id="worker-install-platform" value={installerPlatform} onValueChange={setInstallerPlatform} options={[{value:"windows-x64",label:"Windows x64"},{value:"linux-arm64",label:"Linux ARM64"}]}/>
        <p>Download the installer here, transfer it to the worker device, and run it in that device's terminal. It asks for this token privately and your project folder, downloads a verified binary, and starts a persistent worker. No source build is needed for these platforms.</p>
        <a href={`/api/worker-installers/${installerPlatform}`} download={installerPlatform==="windows-x64"?"setup-worker.ps1":"setup-worker.sh"}>Download {installerPlatform==="windows-x64"?"PowerShell":"Linux"} worker installer</a>
        {installerCommand&&<><pre>{installerCommand}</pre><Button variant="outline" type="button" onClick={()=>void feedback.run("copy-instructions",async()=>{
          try { await navigator.clipboard.writeText(installerCommand); return {kind:"success",message:"Worker setup command copied. Enter the token only at the hidden prompt."}; }
          catch { return {kind:"error",message:"Could not copy the command. Select it and copy manually."}; }
        })}>Copy setup command</Button></>}
        <p>Enrolled means the identity is saved. Online means the worker is connected. Missing harness catalogs need separate CLI installation/login. After Online, select this runtime and a folder inside its root in the agent or project settings.</p>
        <details><summary>Direct-run, source and Docker alternatives</summary><p>An already installed worker can run with <code>--worker --controller URL --worker-state STATE --worker-root FOLDER</code>; provide the token through its environment, never a copied command. Direct-run stops with the terminal. Linux x64 and macOS currently use explicit source installation. Docker source setup builds the worker, mounts the chosen host folder at <code>/workdir</code>, and must persist <code>/data</code> for registration. See the deployment guide for prerequisites and service startup limitations.</p></details>
      </div><Button variant="ghost" onClick={()=>{setToken("");setCopied(false);}}>Hide token</Button></section>}
    {runtimes.some(r=>r.revoked)&&<details className="runtime-history"><summary>Revoked runtimes ({runtimes.filter(r=>r.revoked).length})</summary>{runtimes.filter(r=>r.revoked).map(r=><div className="settings-person" key={r.id}><strong>{r.name}</strong><span className="settings-badge">Revoked</span></div>)}</details>}
  </div>;
}
