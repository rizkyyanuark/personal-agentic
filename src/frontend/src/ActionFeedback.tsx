import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { Toast } from "@base-ui/react/toast";
import { Check, CircleAlert, Info, LoaderCircle } from "lucide-react";
import { Toast as ResultToast, ToastClose, ToastContent, ToastPortal, ToastText, ToastTitle, ToastViewport } from "./components/ui/toast";
import "./action-feedback.css";
import { safeActionError } from "./actionErrors";


export type ActionResult = { kind: "success" | "warning" | "error"; message: string };
type Result = ActionResult & { id: string; scope: string; viewKey: string; announcedByToast: boolean };
type ToastData = { kind: ActionResult["kind"] };
class FeedbackStore {
  active = true;
  epoch = 0;
  scopeKey = "";
  watchedRequests = new Set<string>();
  pending = new Map<string, string>();
  listeners = new Set<() => void>();
  toast = Toast.createToastManager<ToastData>();
  activate() { this.active = true; }
  setScope(key: string) { if (this.scopeKey !== key) { this.scopeKey = key; this.reset(); } }
  reset() { this.epoch += 1; this.watchedRequests.clear(); this.toast.close(); this.pending.clear(); this.listeners.forEach(listener => listener()); }
  deactivate() { this.active = false; this.reset(); }
}
const FeedbackContext = createContext<FeedbackStore | null>(null);

export function ActionFeedbackProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => new FeedbackStore());
  useLayoutEffect(() => {
    store.activate();
    return () => store.deactivate();
  }, [store]);
  return <FeedbackContext.Provider value={store}>
    <Toast.Provider toastManager={store.toast} limit={3} timeout={5000}>
      {children}
      <FeedbackToasts />
    </Toast.Provider>
  </FeedbackContext.Provider>;
}

function FeedbackToasts() {
  const { toasts } = Toast.useToastManager<ToastData>();
  const visibleCount = Math.max(1, toasts.filter(toast => !toast.limited && toast.transitionStatus !== "ending").length);
  return <ToastPortal><ToastViewport aria-label="Action notifications" style={{ "--toast-visible-count": visibleCount } as CSSProperties}
    render={(props) => <div {...props} onMouseLeave={(e) => {
      if (e.currentTarget.contains(document.activeElement)) return;
      props.onMouseLeave?.(e);
    }} onBlur={(e) => {
      props.onBlur?.(e);
      if (!e.currentTarget.contains(e.relatedTarget)) {
        props.onMouseLeave?.(e as unknown as React.MouseEvent<HTMLDivElement>);
      }
    }} />}
  >
    {toasts.map(toast => <ResultToast key={toast.id} toast={toast}>
      <ToastContent>
        <ResultIcon kind={toast.data?.kind ?? "success"} />
        <ToastText><ToastTitle /></ToastText>
        <ToastClose />
      </ToastContent>
    </ResultToast>)}
  </ToastViewport></ToastPortal>;
}

export function useActionFeedback(scope: string, viewKey = scope, presentation: "toast" | "contextual" = "toast") {
  const store = useContext(FeedbackContext);
  if (!store) throw new Error("Action feedback requires the workspace provider");
  const owner = useRef({ mounted: true, viewKey });
  useLayoutEffect(() => { owner.current.viewKey = viewKey; }, [viewKey]);
  useLayoutEffect(() => { const current = owner.current; current.mounted = true; return () => { current.mounted = false; }; }, []);
  const subscribe = useCallback((listener: () => void) => {
    store.listeners.add(listener);
    return () => { store.listeners.delete(listener); };
  }, [store]);
  const snapshot = useCallback(() => store.pending.get(scope) ?? null, [store, scope]);
  const pending = useSyncExternalStore(subscribe, snapshot, snapshot);
  const [storedResult, setResult] = useState<Result | null>(null);
  const result = storedResult?.scope === scope && storedResult.viewKey === viewKey ? storedResult : null;
  const clear = useCallback(() => setResult(null), []);
  const run = useCallback(async (action: string, work: () => Promise<ActionResult | void>, options: { toast?: boolean | ((result: ActionResult) => boolean); errorMessage?: string } = {}) => {
    if (!store.active || !owner.current.mounted || store.pending.has(scope)) return;
    const startedView = owner.current.viewKey;
    const epoch = store.epoch;
    const id = crypto.randomUUID?.() ?? `${scope}:${Date.now()}:${Math.random()}`;
    store.pending.set(scope, action);
    store.listeners.forEach(listener => listener());
    setResult(null);
    let outcome: ActionResult | void;
    try { outcome = await work(); }
    catch (error) { outcome = { kind: "error", message: safeActionError(error, options.errorMessage) }; }
    finally {
      if (store.epoch === epoch) {
        store.pending.delete(scope);
        store.listeners.forEach(listener => listener());
      }
    }
    if (!outcome || !store.active || store.epoch !== epoch) return;
    outcome.message = safeActionError(new Error(outcome.message));
    const sameView = owner.current.mounted && owner.current.viewKey === startedView;
    const showToast = outcome.kind !== "success" || (options.toast !== false && (presentation === "toast" || !sameView || (typeof options.toast === "function" ? options.toast(outcome) : options.toast === true)));
    if (sameView) setResult({ ...outcome, id, scope, viewKey: startedView, announcedByToast: showToast });
    if (showToast) {
      store.toast.add({ id, title: outcome.message, type: outcome.kind, data: { kind: outcome.kind }, timeout: outcome.kind === "success" ? 5000 : 0, priority: "low" });
    }
  }, [store, scope, presentation]);
  const setScope = useCallback((key: string) => store.setScope(key), [store]);
  const watchRequest = useCallback((id: string) => {
    if (store.watchedRequests.size >= 100) store.watchedRequests.delete(store.watchedRequests.values().next().value!);
    store.watchedRequests.add(id);
  }, [store]);
  const consumeRequest = useCallback((id: string | null | undefined) => id ? store.watchedRequests.delete(id) : false, [store]);
  return { pending, result, clear, run, setScope, watchRequest, consumeRequest, isPending: (action: string) => pending === action };
}

export type ActionFeedback = ReturnType<typeof useActionFeedback>;

export function PendingIcon({ pending, size = 16 }: { pending: boolean; size?: number }) {
  return pending ? <LoaderCircle className="action-pending-icon" size={size} aria-hidden="true" /> : null;
}

function ResultIcon({ kind }: { kind: ActionResult["kind"] }) {
  const Icon = kind === "success" ? Check : kind === "error" ? CircleAlert : Info;
  return <Icon className="action-result-icon" size={17} aria-hidden="true" />;
}

export function ActionStatus({ feedback, children }: { feedback: ActionFeedback; children?: ReactNode }) {
  const result = feedback.result;
  const inlineResult = result && !result.announcedByToast ? result : null;
  return <div className="action-status-area">
    <div role={result?.announcedByToast ? undefined : result?.kind === "error" ? "alert" : "status"} aria-atomic="true">
      {inlineResult && <p key={inlineResult.id} className={`action-result ${inlineResult.kind}`}><ResultIcon kind={inlineResult.kind} /><span>{inlineResult.message}</span></p>}
    </div>
    {children}
  </div>;
}
