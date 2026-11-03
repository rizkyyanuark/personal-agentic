import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Tabs } from "@base-ui/react/tabs";
import { Field } from "@base-ui/react/field";
import { FileText, Image, MessageSquare, Search, X } from "lucide-react";
import { api, ApiFailure } from "./api";
import { PendingIcon, useActionFeedback } from "./ActionFeedback";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./components/ui/dialog";
import type { Message } from "./bindings/Message";
import { normalizeSearchQuery, searchEmptyMessage, type SearchMode } from "./group-search";

type Mode = SearchMode;
type SearchResult = { messages?: Message[]; artifacts?: { id: string; name: string; snippet: string; distance: number }[]; indexed_artifact_count?: number };
type Outcome = { kind: "idle" } | { kind: "loading" } | { kind: "failed" } | { kind: "results"; data: SearchResult; query: string };
const modes = [{ value: "messages", label: "Messages", icon: MessageSquare }, { value: "documents", label: "Documents", icon: FileText }, { value: "images", label: "Images", icon: Image }] as const;

export function GroupSearch({ open, onOpenChange, groupId, groupName, inputRef, returnFocus }: {
  open: boolean; onOpenChange: (open: boolean) => void; groupId: string; groupName: string;
  inputRef: RefObject<HTMLInputElement | null>; returnFocus: () => HTMLElement | null;
}) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<Mode>("messages");
  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });
  const [attempted, setAttempted] = useState(false);
  const request = useRef<{ generation: number; controller: AbortController } | null>(null);
  const generation = useRef(0);
  const feedback = useActionFeedback(`group-search:${groupId}`);
  const invalidate = () => { generation.current += 1; request.current?.controller.abort(); request.current = null; };
  useLayoutEffect(() => invalidate, [open]);
  const normalizedQuery = normalizeSearchQuery(query);
  const validation = !normalizedQuery ? "Enter a search query."
    : new TextEncoder().encode(normalizedQuery).length > 1000 ? "Use a shorter query (up to 1,000 UTF-8 bytes)." : null;
  const pending = outcome.kind === "loading";
  const label = modes.find(item => item.value === mode)!.label;
  const resultCount = outcome.kind === "results" ? (outcome.data.messages?.length ?? 0) + (outcome.data.artifacts?.length ?? 0) : 0;
  const reset = () => { invalidate(); setOutcome({ kind: "idle" }); setAttempted(false); };
  async function submit() {
    if (request.current) return;
    setAttempted(true);
    if (!open || validation) return;
    const controller = new AbortController();
    const id = ++generation.current;
    request.current = { generation: id, controller };
    setOutcome({ kind: "loading" });
    const current = () => generation.current === id && !controller.signal.aborted;
    const params = new URLSearchParams({ group_id: groupId, q: normalizedQuery, semantic: String(mode !== "messages"), media: mode === "images" ? "images" : "documents" });
    try {
      const result = await api<SearchResult>(`/search?${params}`, { signal: controller.signal });
      if (current()) setOutcome({ kind: "results", data: result, query: normalizedQuery });
    } catch (error) {
      if (!current()) return;
      setOutcome({ kind: "failed" });
      const message = error instanceof ApiFailure && error.status === 401 ? "Your session has expired. Sign in again to search."
        : error instanceof ApiFailure && error.status === 403 ? "You do not have access to search this group."
        : "Search could not be completed. Your query is kept; try Search again.";
      await feedback.run("search-failed", async () => current() ? { kind: "error", message } : undefined);
    } finally {
      if (current()) request.current = null;
    }
  }
  return <Dialog open={open} onOpenChange={next => { if (!next) reset(); onOpenChange(next); }}>
    <DialogContent className="search-dialog group-search-dialog" initialFocus={inputRef} finalFocus={returnFocus}>
      <DialogHeader><DialogTitle>Search #{groupName}</DialogTitle><DialogDescription>Messages and indexed Knowledge files in this project or group. Workdir files and chat links are not indexed automatically.</DialogDescription></DialogHeader>
      <Tabs.Root value={mode} onValueChange={value => { reset(); setMode(value as Mode); }} className="group-search-modes">
        <Tabs.List aria-label="Search content" className="group-search-tabs">{modes.map(({ value, label, icon: Icon }) => <Tabs.Tab key={value} value={value} type="button"><Icon size={16} aria-hidden="true" />{label}</Tabs.Tab>)}</Tabs.List>
        <Tabs.Panel value={mode}>
          <form noValidate onSubmit={e => { e.preventDefault(); void submit(); }} className="group-search-form">
            <Field.Root invalid={attempted && !!validation} className="group-search-field"><Field.Label htmlFor={`group-search-${mode}`} className="sr-only">Search query</Field.Label>
              <div className="group-search-query"><Search size={18} aria-hidden="true" /><Input ref={inputRef} id={`group-search-${mode}`} aria-label="Search query" value={query}
                aria-invalid={attempted && !!validation} aria-describedby={attempted && validation ? "search-query-error" : undefined}
                onChange={e => { reset(); setQuery(e.target.value); }} placeholder={`Search ${label.toLowerCase()}…`} onKeyDown={e => { if (e.nativeEvent.isComposing && e.key === "Enter") e.preventDefault(); }} />
                {query && <Button type="button" variant="ghost" size="icon-sm" aria-label="Clear search query" onClick={() => { reset(); setQuery(""); inputRef.current?.focus(); }}><X /></Button>}
              </div>
              {attempted && validation && <p id="search-query-error" className="field-error">{validation}</p>}
            </Field.Root>
            <Button type="submit" disabled={pending}><PendingIcon pending={pending} />{pending ? "Searching…" : "Search"}</Button>
          </form>
          <div className="search-results" aria-busy={pending} aria-label={`${label} search results`}>
            <p className="group-search-state" role="status">{outcome.kind === "loading" ? `Searching ${label.toLowerCase()}…` : outcome.kind === "idle" ? "Enter a query, then press Enter or Search."
              : outcome.kind === "failed" ? "Ready when you want to try again."
              : `${resultCount} ${resultCount === 1 ? "result" : "results"} for “${outcome.query}”`}</p>
            {outcome.kind === "results" && <>
              {outcome.data.messages?.map(message => <article key={message.id}><small><MessageSquare size={14} aria-hidden="true" /><time dateTime={message.created_at}>{new Date(message.created_at).toLocaleString()}</time></small><p>{message.body}</p></article>)}
              {outcome.data.artifacts?.map(artifact => <a key={artifact.id} href={`/api/artifacts/${encodeURIComponent(artifact.id)}`} target="_blank" rel="noreferrer"><strong><FileText size={16} aria-hidden="true" />{artifact.name}</strong><p>{artifact.snippet}</p><small>Open source file · new tab</small></a>)}
              {!outcome.data.messages?.length && !outcome.data.artifacts?.length && <p>{searchEmptyMessage(mode, outcome.data.indexed_artifact_count)}</p>}
            </>}
          </div>
        </Tabs.Panel>
      </Tabs.Root>
    </DialogContent>
  </Dialog>;
}
