import { useRef, useState } from "react";
import { CalendarDays, List, Play, Plus, Square, ChevronLeft, ChevronRight, Pencil, Trash2, FileText, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ValuePicker } from "./ValuePicker";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { api, post, requestId } from "./api";
import { ActionStatus, PendingIcon, useActionFeedback } from "./ActionFeedback";
import { ScheduleDateTime } from "./ScheduleDateTime";
import { scheduleDateTime, resolveOptionalScheduleStart, type ScheduleDateTimeDraft } from "./scheduleTime";
import type { StateView } from "./bindings/StateView";
import type { ActionItem } from "./bindings/ActionItem";
import "./ActionBoard.css";

const columns = ["Project / group", "PIC", "Action", "Planned start", "Status", "Controls"];
const initialWidths = [170, 130, 230, 180, 120, 170];
const collator = new Intl.Collator(undefined, {numeric:true, sensitivity:"base"});
const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;

export function ActionBoard({ data, groupId, onRefresh, onOpenRun }: {
  data: StateView; groupId?: string; onRefresh: () => Promise<void>; onOpenRun: (groupId: string, runId: string) => void;
}) {
  const [view,setView] = useState<"table"|"calendar">("table");
  const [filter,setFilter] = useState(groupId ?? "");
  const [pic,setPic] = useState("");
  const [month,setMonth] = useState(() => new Date(new Date().getFullYear(),new Date().getMonth(),1));
  const [draft,setDraft] = useState<ActionItem|null>(null);
  const [startDraft,setStartDraft] = useState<ScheduleDateTimeDraft>({ date: "", time: "" });
  const [dateError,setDateError] = useState("");
  const [deleting,setDeleting] = useState<ActionItem|null>(null);
  const [sort,setSort] = useState({column:0, descending:false});
  const [widths,setWidths] = useState(initialWidths);
  const resizing = useRef<{column:number; x:number; width:number}|null>(null);
  const resize = (column:number, width:number) => setWidths(values=>values.map((value,i)=>i===column?Math.max(column===5?150:100,Math.min(800,width)):value));
  const feedback = useActionFeedback("action-board", groupId ?? "organization");
  const [refreshNeeded, setRefreshNeeded] = useState(false);
  const busy = feedback.pending !== null;
  const blocked = busy || refreshNeeded;
  const groups = data.groups.filter(g => !g.archived_at && !g.deleted_at);
  const items = (data.actions??[]).filter(a => data.groups.some(g=>g.id===a.group_id&&!g.deleted_at) && (!groupId && !filter || a.group_id === (groupId || filter)) && (!pic || a.assignee_id === pic));
  const value = (a:ActionItem) => [data.groups.find(g=>g.id===a.group_id)?.name??"Unavailable group",data.agents.find(p=>p.id===a.assignee_id)?.name??"Deleted agent",a.title,a.planned_start??"",a.status][sort.column];
  const sorted = [...items].sort((a,b) => {
    const left=value(a), right=value(b);
    if(sort.column===3 && (!left||!right)) return left ? -1 : right ? 1 : a.id.localeCompare(b.id);
    const order=sort.column===3 ? Date.parse(left)-Date.parse(right) : collator.compare(left,right);
    return (sort.descending?-order:order) || a.id.localeCompare(b.id);
  });
  const editingGroup = groups.find(g=>g.id===draft?.group_id);
  const allowed = data.group_access[draft?.group_id??""]?.delegate_ids ?? [];
  const people = data.agents.filter(a=>allowed.includes(a.id) && a.enabled);
  const running = (a: ActionItem) => ["queued","running"].includes(a.status);
  async function refreshed(message: string) {
    try {
      await onRefresh();
      setRefreshNeeded(false);
      return { kind: "success" as const, message };
    } catch {
      setRefreshNeeded(true);
      return { kind: "warning" as const, message: `${message} The action list could not refresh. Refresh it before another change.` };
    }
  }
  async function invoke(item: ActionItem) {
    await feedback.run(`invoke:${item.id}`, async () => {
      const result = await post<ActionItem>(`/actions/${item.id}/invoke`);
      return refreshed(`“${item.title}” ${result.status === "running" ? "is running" : "queued"}. Open its evidence to follow the run.`);
    }, { errorMessage: "Action launch not confirmed. Refresh its status before explicitly retrying; the task is not confirmed complete." });
  }
  async function cancel(item: ActionItem) {
    await feedback.run(`cancel:${item.id}`, async () => {
      const result = await post<ActionItem>(`/actions/${item.id}/cancel`);
      return refreshed(result.status === "cancelled" ? `“${item.title}” cancelled.` : `Cancellation requested for “${item.title}”. Its run has not been confirmed stopped.`);
    }, { errorMessage: "Cancellation was not confirmed. Refresh the action and inspect its run before retrying." });
  }
  async function save(item: ActionItem, now: boolean, plannedStart: string | null) {
    let closed = false;
    await feedback.run(`${now ? "save-run" : "save"}:${item.id}`, async () => {
      const saved = await post<ActionItem>("/actions", {id:item.id,revision:item.revision,group_id:item.group_id,title:item.title,body:item.body,assignee_id:item.assignee_id,planned_start:plannedStart});
      setDraft(saved);
      setStartDraft(saved.planned_start ? scheduleDateTime(saved.planned_start) : { date: "", time: "" });
      if (now) {
        try {
          await post<ActionItem>(`/actions/${saved.id}/invoke`);
        } catch {
          setRefreshNeeded(true);
          return { kind: "warning", message: `“${saved.title}” saved at revision ${saved.revision}, but its launch was not confirmed. Refresh the action list before retrying. Your saved action is retained.` };
        }
      }
      setDraft(null);
      closed = true;
      return refreshed(now ? `“${saved.title}” saved and queued. This confirms the request, not task completion.` : saved.planned_start ? `“${saved.title}” scheduled. It has not run yet.` : `“${saved.title}” saved to backlog.`);
    }, { toast: () => closed, errorMessage: "Action save not confirmed. Your input is retained; refresh the action list before retrying." });
  }
  function openDraft(item: ActionItem) {
    feedback.clear();
    setDateError("");
    setStartDraft(item.planned_start ? scheduleDateTime(item.planned_start) : { date: "", time: "" });
    setDraft(item);
  }
  function create(date?: Date) {
    feedback.clear();
    setDateError("");
    const selected = groupId || filter || groups[0]?.id || "";
    const instant = date ? date.toISOString() : null;
    setStartDraft(instant ? scheduleDateTime(instant) : { date: "", time: "" });
    setDraft({id:requestId(),revision:0,group_id:selected,title:"",body:"",assignee_id:"",planned_start:instant,status:"backlog",created_by:"owner",created_at:"",updated_at:"",run_id:null,error:null});
  }
  function card(a: ActionItem) {
    return <button className={`action-calendar-item status-${a.status}`} key={a.id} disabled={blocked} onClick={()=>openDraft(a)} title={`${a.title} · ${data.agents.find(p=>p.id===a.assignee_id)?.name}`}>
      <strong>{a.title}</strong><small>{data.agents.find(p=>p.id===a.assignee_id)?.name} · {a.status}</small>
    </button>;
  }
  function refreshControl() {
    return refreshNeeded && <Button type="button" variant="outline" disabled={busy} aria-busy={feedback.isPending("refresh")} onClick={()=>void feedback.run("refresh",async()=>{
      await onRefresh();
      setRefreshNeeded(false);
      setDraft(null);
      setDateError("");
      return {kind:"success",message:"Action list refreshed. Reopen an action to inspect its current revision and run status."};
    },{errorMessage:"The action list could not refresh. No action was saved or invoked again."})}>
      {feedback.isPending("refresh") && <PendingIcon pending size={16}/>} {feedback.isPending("refresh")?"Refreshing actions…":"Refresh action list"}
    </Button>;
  }
  const days = Array.from({length:42},(_,i)=>new Date(month.getFullYear(),month.getMonth(),1-month.getDay()+i));
  return <section className="action-board" aria-label="Action board">
    <header className="action-board-heading"><div><h1>Action board</h1><p>Organization → project or group → person in charge. Without a planned start, work stays in Backlog.</p></div>
      <Button onClick={()=>create()} disabled={blocked||!groups.length||!!groupId&&!groups.some(g=>g.id===groupId)}><Plus size={16}/> New action</Button></header>
    {!draft && !deleting && <ActionStatus feedback={feedback} />}
    {!draft && !deleting && refreshControl()}
    <div className="action-toolbar">
      <div role="group" aria-label="Board view"><Button variant={view==="table"?"default":"outline"} onClick={()=>setView("table")}><List size={15}/>Table</Button><Button variant={view==="calendar"?"default":"outline"} onClick={()=>setView("calendar")}><CalendarDays size={15}/>Calendar</Button></div>
      {!groupId && <ValuePicker searchable aria-label="Filter project or group" value={filter} onValueChange={setFilter} options={[{ value: "", label: "All projects and groups" }, ...data.groups.filter(g=>!g.deleted_at).map(g=>({ value: g.id, label: `${g.project?"Project: ":"Group: "}${g.name}` }))]} />}
      <ValuePicker searchable aria-label="Filter PIC" value={pic} onValueChange={setPic} options={[{ value: "", label: "All people in charge" }, ...data.agents.map(a=>({ value: a.id, label: a.name }))]} />
    </div>
    {view==="table" ? <div className="action-table-scroll"><table className="action-table" style={{width:widths.reduce((a,b)=>a+b,0)}}><colgroup>{widths.map((width,i)=><col key={i} style={{width}}/>)}</colgroup><thead><tr>{columns.map((label,i)=><th key={label} aria-sort={i===5?undefined:sort.column===i?(sort.descending?"descending":"ascending"):"none"}>
      {i===5 ? label : <button className="action-sort" onClick={()=>setSort({column:i,descending:sort.column===i?!sort.descending:false})}>{label}{sort.column===i?(sort.descending?<ArrowDown size={14}/>:<ArrowUp size={14}/>):<ArrowUpDown size={14}/>}</button>}
      <span className="action-resizer" role="separator" tabIndex={0} aria-orientation="vertical" aria-label={`Resize ${label} column`} aria-valuemin={i===5?150:100} aria-valuemax={800} aria-valuenow={widths[i]}
        onPointerDown={e=>{e.preventDefault();resizing.current={column:i,x:e.clientX,width:widths[i]};e.currentTarget.setPointerCapture(e.pointerId);}}
        onPointerMove={e=>{const drag=resizing.current;if(drag?.column===i)resize(i,drag.width+e.clientX-drag.x);}}
        onPointerUp={()=>{resizing.current=null;}} onPointerCancel={()=>{resizing.current=null;}} onLostPointerCapture={()=>{resizing.current=null;}}
        onKeyDown={e=>{if(["ArrowLeft","ArrowRight","Home"].includes(e.key)){e.preventDefault();resize(i,e.key==="Home"?initialWidths[i]:widths[i]+(e.key==="ArrowRight"?16:-16));}}}/>
    </th>)}</tr></thead><tbody>
      {sorted.map(a=><tr key={a.id}><td data-label="Project / group">{data.groups.find(g=>g.id===a.group_id)?.name??"Unavailable group"}</td><td data-label="PIC">{data.agents.find(p=>p.id===a.assignee_id)?.name??"Deleted agent"}</td><td data-label="Action"><button disabled={blocked} onClick={()=>openDraft(a)}>{a.title}</button>{a.error && <small className="error">{a.error}</small>}</td><td data-label="Planned start">{a.planned_start?new Date(a.planned_start).toLocaleString():"Unscheduled"}</td><td data-label="Status"><span className={`action-status status-${a.status}`}>{a.status}</span></td><td data-label="Controls"><div className="action-controls">
        <Button variant="ghost" size="icon" aria-label={`Edit ${a.title}`} title="Edit action" disabled={blocked||running(a)} onClick={()=>openDraft(a)}><Pencil size={16}/></Button>
        {(running(a) && !feedback.isPending(`invoke:${a.id}`) || feedback.isPending(`cancel:${a.id}`))?<Button variant="ghost" size="icon" aria-label={feedback.isPending(`cancel:${a.id}`)?`Requesting cancellation for ${a.title}`:`Stop ${a.title}`} title="Stop action" disabled={blocked} aria-busy={feedback.isPending(`cancel:${a.id}`)} onClick={()=>void cancel(a)}>{feedback.isPending(`cancel:${a.id}`)?<PendingIcon pending size={16}/>:<Square size={16}/>}</Button>:<Button variant="ghost" size="icon" className="action-play" aria-label={feedback.isPending(`invoke:${a.id}`)?`Queuing ${a.title}`:`Run ${a.title}`} title="Run now" disabled={blocked||a.status==="completed"||!groups.some(g=>g.id===a.group_id)} aria-busy={feedback.isPending(`invoke:${a.id}`)} onClick={()=>void invoke(a)}>{feedback.isPending(`invoke:${a.id}`)?<PendingIcon pending size={16}/>:<Play size={16}/>}</Button>}
        <Button variant="ghost" size="icon" className="action-delete" aria-label={`Delete ${a.title}`} title={running(a)?"Stop the action before deleting":"Delete action"} disabled={blocked||running(a)} onClick={()=>{feedback.clear();setDeleting(a);}}><Trash2 size={16}/></Button>
        {a.run_id&&<Button variant="ghost" size="icon" aria-label={`Evidence for ${a.title}`} title="View evidence" onClick={()=>onOpenRun(a.group_id,a.run_id!)}><FileText size={16}/></Button>}
      </div></td></tr>)}
    </tbody></table>{!items.length&&<p className="empty-state">No actions here yet.</p>}</div> : <>
      <div className="calendar-heading"><Button variant="ghost" aria-label="Previous month" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))}><ChevronLeft/></Button><strong>{month.toLocaleDateString(undefined,{month:"long",year:"numeric"})}</strong><Button variant="ghost" aria-label="Next month" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))}><ChevronRight/></Button></div>
      <div className="action-calendar">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d=><strong className="calendar-weekday" key={d}>{d}</strong>)}{days.map(day=><div key={localDate(day)} className={`calendar-day ${day.getMonth()!==month.getMonth()?"outside":""}`}><button className="calendar-day-number" disabled={blocked} aria-label={`Add action on ${localDate(day)}`} onClick={()=>{const start=new Date(day);start.setHours(9);create(start);}}>{day.getDate()}</button>{items.filter(a=>a.planned_start&&localDate(new Date(a.planned_start))===localDate(day)).map(card)}</div>)}</div>
      <h2 className="backlog-heading">Unscheduled backlog</h2><div className="action-backlog">{items.filter(a=>!a.planned_start&&!["completed","cancelled"].includes(a.status)).map(card)}{!items.some(a=>!a.planned_start&&!["completed","cancelled"].includes(a.status))&&<p>No unscheduled actions.</p>}</div>
    </>}
    {deleting&&<Dialog open onOpenChange={open=>{if(!open&&!busy)setDeleting(null);}}><DialogContent><DialogHeader><DialogTitle>Delete action?</DialogTitle><DialogDescription>Remove “{deleting.title}” from the board. Existing run history and evidence are retained.</DialogDescription></DialogHeader><ActionStatus feedback={feedback}/>{refreshControl()}<div className="action-controls"><Button variant="outline" disabled={busy} onClick={()=>setDeleting(null)}>Keep action</Button><Button variant="destructive" disabled={blocked} aria-busy={feedback.isPending(`delete:${deleting.id}`)} onClick={()=>{let closed=false;void feedback.run(`delete:${deleting.id}`,async()=>{await api(`/actions/${deleting.id}`,{method:"DELETE"});setDeleting(null);closed=true;return refreshed(`“${deleting.title}” deleted. Run history and evidence are retained.`);},{toast:()=>closed,errorMessage:"Action deletion not confirmed. Refresh the board before retrying."});}}>{feedback.isPending(`delete:${deleting.id}`)&&<PendingIcon pending size={16}/>} {feedback.isPending(`delete:${deleting.id}`)?"Deleting action…":"Delete action"}</Button></div></DialogContent></Dialog>}
    {draft&&<Dialog open onOpenChange={open=>{if(!open&&!busy){setDraft(null);setDateError("");}}}><DialogContent className="action-dialog"><DialogHeader><DialogTitle>{draft.revision?"Edit action":"New action"}</DialogTitle><DialogDescription>Assign a PIC, then save for later, schedule, or run now.</DialogDescription></DialogHeader>
      <form className="form-stack" onSubmit={e=>{
        e.preventDefault();
        if (blocked || running(draft)) return;
        const now = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "now";
        if (now) {
          setDateError("");
          void save(draft, true, null);
        } else {
          const resolved = resolveOptionalScheduleStart(startDraft);
          if (!resolved.ok) {
            setDateError(resolved.error);
            return;
          }
          setDateError("");
          void save(draft, false, resolved.instant);
        }
      }}>
        <Label htmlFor="action-group">Project or group</Label><ValuePicker id="action-group" searchable value={draft.group_id} required disabled={blocked||running(draft)} onValueChange={value=>setDraft({...draft,group_id:value,assignee_id:""})} options={[{ value: "", label: "Select a workspace", disabled: true }, ...groups.map(g=>({ value: g.id, label: `${g.project?"Project: ":"Group: "}${g.name}` }))]} />
        {editingGroup?.project&&<p className="hint">Runs in {editingGroup.project.workdir.ssh_host?`${editingGroup.project.workdir.ssh_host}: `:""}{editingGroup.project.workdir.path}</p>}
        <Label htmlFor="action-title">Title</Label><Input id="action-title" value={draft.title} required maxLength={160} disabled={blocked||running(draft)} onChange={e=>setDraft({...draft,title:e.target.value})}/>
        <Label htmlFor="action-body">Task / instructions</Label><Textarea id="action-body" value={draft.body} required disabled={blocked||running(draft)} onChange={e=>setDraft({...draft,body:e.target.value})}/>
        <Label htmlFor="action-pic">Person in charge (PIC)</Label><ValuePicker id="action-pic" searchable value={draft.assignee_id} required disabled={blocked||running(draft)} onValueChange={value=>setDraft({...draft,assignee_id:value})} options={[{ value: "", label: "Choose an agent", disabled: true }, ...people.map(a=>({ value: a.id, label: `${a.name} · ${a.position}` }))]} />
        <ScheduleDateTime
          idPrefix="action"
          labelDate="Planned start"
          labelTime="Planned time"
          notePrefix="Planned start"
          optional
          value={startDraft}
          disabled={blocked||running(draft)}
          invalid={!!dateError}
          onChange={val=>{
            setStartDraft(val);
            setDateError("");
          }}
          onClear={()=>{
            setStartDraft({ date: "", time: "", original: undefined });
            setDateError("");
          }}
        />
        <p className="hint">Leave blank to keep it unscheduled. Saving a future start schedules one invocation.</p>
        {dateError && <p className="schedule-error" role="alert">{dateError}</p>}
        <ActionStatus feedback={feedback}/>{refreshControl()}
        <div className="action-controls"><Button type="submit" value="save" aria-busy={feedback.isPending(`save:${draft.id}`)} disabled={blocked||running(draft)}>{feedback.isPending(`save:${draft.id}`)&&<PendingIcon pending size={16}/>} {feedback.isPending(`save:${draft.id}`)?(startDraft.date||startDraft.time)?"Scheduling action…":"Saving action…":(startDraft.date||startDraft.time)?"Schedule action":"Save to backlog"}</Button><Button type="submit" value="now" variant="outline" aria-busy={feedback.isPending(`save-run:${draft.id}`)} disabled={blocked||running(draft)}>{feedback.isPending(`save-run:${draft.id}`)?<PendingIcon pending size={14}/>:<Play size={14}/>} {feedback.isPending(`save-run:${draft.id}`)?"Saving and queuing…":"Run now"}</Button></div>
      </form></DialogContent></Dialog>}
  </section>;
}
