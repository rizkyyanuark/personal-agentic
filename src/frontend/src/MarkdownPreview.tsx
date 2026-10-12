import { useEffect, useRef, useState } from "react";
import { Check, Download, FileText, LibraryBig, PanelRightClose } from "lucide-react";
import { MessageMarkdown, type MarkdownFile } from "./MessageMarkdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Artifact } from "./bindings/Artifact";
import type { DocumentStatus } from "./bindings/DocumentStatus";
import { api, post } from "./api";

const MAX_PREVIEW_BYTES = 1024 * 1024;

export function MarkdownPreview({ file, onClose, onPreview, onAddToKnowledge, onRefresh, artifacts, groupName, readOnly, readOnlyReason, maintenance = false }: {
  file: MarkdownFile;
  onClose: () => void;
  onPreview: (file: MarkdownFile) => void;
  onAddToKnowledge: (file: MarkdownFile, source: Blob) => Promise<Artifact>;
  onRefresh: () => Promise<void>;
  artifacts: Artifact[];
  groupName: string;
  readOnly: boolean;
  maintenance?: boolean;
  readOnlyReason: string;
}) {
  const [loadedResult, setLoadedResult] = useState<{ url: string; text: string; source: Blob } | null>(null);
  const [loadFailure, setLoadFailure] = useState<{ url: string; error: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [documentResult, setDocumentResult] = useState<{ url: string; value: DocumentStatus } | null>(null);
  const [documentFailure, setDocumentFailure] = useState<{ url: string; error: string } | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [recoveryError, setRecoveryError] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportPath, setExportPath] = useState(`reports/${file.name}`);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [exportedPath, setExportedPath] = useState("");
  const attachment = artifacts.find((artifact) => artifact.status !== "deleted" && file.url === `/api/artifacts/${artifact.id}`);
  const runId = file.runId ?? attachment?.source?.run_id ?? null;
  const sourcePath = file.path ?? attachment?.source?.source_path;
  const documentUrl = runId && sourcePath ? `/runs/${encodeURIComponent(runId)}/document?${new URLSearchParams({ path: sourcePath })}` : null;
  const document = documentResult?.url === documentUrl ? documentResult.value : null;
  const documentError = documentFailure?.url === documentUrl ? documentFailure.error : "";
  const snapshot = document?.artifact ?? (attachment?.source ? attachment : null);
  const origin = snapshot?.source;
  const contentUrl = snapshot ? `/api/artifacts/${snapshot.id}` : file.url;
  const loaded = loadedResult?.url === contentUrl ? loadedResult : null;
  const error = loadFailure?.url === contentUrl ? loadFailure.error : "";
  const saved = artifacts.find((artifact) => artifact.status !== "deleted" && artifact.id === savedId)
    ?? attachment ?? snapshot;
  const close = useRef<HTMLButtonElement>(null);
  const writesBlocked = readOnly || maintenance;
  const writeReason = maintenance ? "Deployment maintenance is active. Try again after maintenance finishes." : readOnlyReason;
  useEffect(() => {
    close.current?.focus();
  }, [file.url]);
  useEffect(() => {
    if (!documentUrl) return;
    const controller = new AbortController();
    void api<DocumentStatus>(documentUrl, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) setDocumentResult({ url: documentUrl, value: result }); })
      .catch((error: unknown) => { if (!controller.signal.aborted) setDocumentFailure({ url: documentUrl, error: error instanceof Error ? error.message : String(error) }); });
    return () => controller.abort();
  }, [documentUrl]);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(contentUrl, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) {
        const text = await response.text();
        let detail = text;
        try { detail = (JSON.parse(text) as { error?: string }).error ?? text; }
        catch { /* Preserve plain HTTP error messages. */ }
        throw new Error(detail || `Unable to open this report (${response.status}).`);
      }
      const tooLarge = "This report exceeds the 1 MiB preview limit. Download it to read the full file.";
      if (Number(response.headers.get("content-length")) > MAX_PREVIEW_BYTES) throw new Error(tooLarge);
      const source = await response.blob();
      if (source.size > MAX_PREVIEW_BYTES) throw new Error(tooLarge);
      const text = await source.text();
      if (!controller.signal.aborted) setLoadedResult({ url: contentUrl, text, source });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setLoadFailure({ url: contentUrl, error: error instanceof Error ? error.message : String(error) });
    });
    return () => controller.abort();
  }, [contentUrl]);

  async function recoverDocument() {
    if (!runId || !sourcePath || !documentUrl || !document?.can_import || recovering || writesBlocked) return;
    setRecovering(true);
    setRecoveryError("");
    try {
      const artifact = await post<Artifact>(`/runs/${encodeURIComponent(runId)}/artifacts`, { path: sourcePath });
      setDocumentResult({ url: documentUrl, value: { ...document, artifact, can_import: false } });
      const status = await api<DocumentStatus>(documentUrl);
      setDocumentResult({ url: documentUrl, value: status });
      await onRefresh();
    } catch (error: unknown) { setRecoveryError(error instanceof Error ? error.message : String(error)); }
    finally { setRecovering(false); }
  }

  async function exportDocument() {
    if (!snapshot || !document?.can_export || exporting || writesBlocked) return;
    setExporting(true);
    setExportError("");
    setExportedPath("");
    try {
      const result = await post<{ path: string }>(`/artifacts/${encodeURIComponent(snapshot.id)}/export`, { path: exportPath });
      setExportedPath(result.path);
      await onRefresh();
    } catch (error: unknown) { setExportError(error instanceof Error ? error.message : String(error)); }
    finally { setExporting(false); }
  }

  async function addToKnowledge() {
    if (!loaded || adding || writesBlocked) return;
    setAdding(true);
    setAddError("");
    try { setSavedId((await onAddToKnowledge(file, loaded.source)).id); }
    catch (error: unknown) { setAddError(error instanceof Error ? error.message : String(error)); }
    finally { setAdding(false); }
  }

  return <aside className="inspector markdown-preview" aria-label="Markdown preview"
    onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
    <div className="inspector-heading">
      <FileText size={18} aria-hidden="true" />
      <strong title={file.name}>{file.name}</strong>
      <a href={contentUrl} download={file.name} aria-label="Download Markdown report" title="Download report"><Download size={18} /></a>
      <button ref={close} aria-label="Close Markdown preview" title="Close preview (Esc)" onClick={onClose}><PanelRightClose size={18} /></button>
    </div>
    <div className="markdown-preview-actions">
      <Button variant="outline" size="sm" disabled={writesBlocked || !loaded || adding || saved?.status === "indexing" || saved?.status === "indexed"}
        onClick={() => void addToKnowledge()}>
        {saved?.status === "indexed" ? <Check size={15} /> : <LibraryBig size={15} />}
        {adding ? "Adding…" : saved?.status === "indexing" ? "Preparing knowledge…" : saved?.status === "indexed" ? "Added to knowledge" : saved?.status === "failed" ? "Retry indexing" : "Add to knowledge"}
      </Button>
      <span className="hint" role="status">{writesBlocked ? writeReason : saved?.status === "indexed" ? `Searchable in ${groupName}.` : `Save to ${groupName}`}</span>
      {(addError || saved?.status === "failed") && <p role="alert" className="error">{addError || `Saved, but indexing failed: ${saved?.error ?? "Please retry."}`}</p>}
    </div>
    {(runId && sourcePath) && <div className="markdown-preview-storage">
      {origin ? <>
        <p role="status">{origin.capture_kind === "historical_import" ? "Current version saved at import" : "Saved when this run completed"} · <time dateTime={origin.captured_at}>{new Date(origin.captured_at).toLocaleString()}</time></p>
        {origin.capture_kind === "historical_import" && <p className="hint">This copy may differ from the document when the original run finished.</p>}
        <p className="hint">Referenced images and local files are not included in this saved copy.</p>
        <Button variant="outline" size="sm" disabled={writesBlocked || !document?.can_export || exporting}
          aria-expanded={exportOpen} onClick={() => { setExportOpen(!exportOpen); setExportError(""); }}>Export to workdir</Button>
        {writesBlocked ? <p className="hint">Export is unavailable. {writeReason}</p>
          : document && !document.can_export && <p className="hint">Export is unavailable for this run’s workdir or permissions.</p>}
        {exportOpen && <form className="markdown-export-form" onSubmit={(event) => { event.preventDefault(); void exportDocument(); }}>
          <Label htmlFor="report-export-path">Destination in workdir</Label>
          <div><Input id="report-export-path" value={exportPath} onChange={(event) => { setExportPath(event.target.value); setExportedPath(""); }}
            placeholder="reports/report.md" required disabled={writesBlocked || exporting} aria-describedby="report-export-help" />
            <Button type="submit" variant="outline" size="sm" disabled={writesBlocked || exporting || !exportPath.trim()}>{exporting ? "Exporting…" : "Export copy"}</Button></div>
          <p id="report-export-help" className="hint">Use a relative path. Existing files will not be overwritten.</p>
        </form>}
        {exportedPath && <p role="status" className="hint">Exported to {exportedPath}</p>}
        {exportError && <p role="alert" className="error">{exportError}</p>}
      </> : document?.can_import ? <>
        <p className="hint">This document has no saved copy. Recover its current version from the workstation.</p>
        <Button variant="outline" size="sm" disabled={writesBlocked || recovering} onClick={() => void recoverDocument()}>{recovering ? "Saving current version…" : "Recover document"}</Button>
        {writesBlocked && <p className="hint">Recovery is unavailable. {writeReason}</p>}
      </> : !document && !documentError ? <p className="hint" role="status">Checking for a saved copy…</p> : null}
      {document?.error && (!loaded || !!origin) && <p className="hint">{document.error}</p>}
      {documentError && <p role="alert" className="error">Unable to check the saved copy: {documentError}</p>}
      {recoveryError && <p role="alert" className="error">{recoveryError}</p>}
    </div>}
    <div className="inspector-body" aria-busy={loaded === null && !error}>
      {error ? <p role="alert" className="error">{error}</p>
        : loaded === null ? <p role="status">Opening report…</p>
        : <div className="markdown"><MessageMarkdown runId={origin ? null : file.runId} basePath={origin ? undefined : file.path} localFilesUnavailable={!!origin} onPreview={onPreview}>{loaded.text}</MessageMarkdown></div>}
    </div>
  </aside>;
}
