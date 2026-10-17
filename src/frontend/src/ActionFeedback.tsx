import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Toast } from "@base-ui/react/toast";
import { Check, CircleAlert, Info, LoaderCircle, X } from "lucide-react";
import "./action-feedback.css";

export type ActionResult = { kind: "success" | "warning" | "error"; message: string };
type Result = ActionResult & { id: string; scope: string; viewKey: string };
type ToastData = { kind: ActionResult["kind"] };
class FeedbackStore {
  active = true;
  pending = new Map<string, string>();
  listeners = new Set<() => void>();
  toast = Toast.createToastManager<ToastData>();
  activate() { this.active = true; }
  deactivate() { this.active = false; this.toast.close(); this.pending.clear(); }
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
  return <Toast.Portal><Toast.Viewport className="action-toast-viewport" aria-label="Action notifications"
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
    {toasts.map(toast => <Toast.Root key={toast.id} toast={toast} className="action-toast" swipeDirection={["right", "up"]}>
      <Toast.Content className="action-toast-content">
        <ResultIcon kind={toast.data?.kind ?? "success"} />
        <Toast.Title className="action-toast-title" />
        <Toast.Close className="action-toast-close" aria-label="Dismiss notification"><X size={16} aria-hidden="true" /></Toast.Close>
      </Toast.Content>
    </Toast.Root>)}
  </Toast.Viewport></Toast.Portal>;
}

export function useActionFeedback(scope: string, viewKey = scope) {
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
    if (!store.active || store.pending.has(scope)) return;
    const startedView = owner.current.viewKey;
    const id = crypto.randomUUID?.() ?? `${scope}:${Date.now()}:${Math.random()}`;
    store.pending.set(scope, action);
    store.listeners.forEach(listener => listener());
    setResult(null);
    let outcome: ActionResult | void;
    try { outcome = await work(); }
    catch { outcome = { kind: "error", message: options.errorMessage ?? "The action could not be confirmed. Review its current state before trying again." }; }
    finally {
      store.pending.delete(scope);
      store.listeners.forEach(listener => listener());
    }
    if (!outcome || !store.active) return;
    const showToast = typeof options.toast === "function" ? options.toast(outcome) : options.toast;
    if (showToast || !owner.current.mounted || owner.current.viewKey !== startedView) {
      store.toast.add({ id, title: outcome.message, type: outcome.kind, data: { kind: outcome.kind }, timeout: outcome.kind === "success" ? 5000 : 0, priority: "low" });
    } else setResult({ ...outcome, id, scope, viewKey: startedView });
  }, [store, scope]);
  return { pending, result, clear, run, isPending: (action: string) => pending === action };
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
  return <div className="action-status-area">
    <div role={feedback.result?.kind === "error" ? "alert" : "status"} aria-atomic="true">
      {feedback.result && <p key={feedback.result.id} className={`action-result ${feedback.result.kind}`}><ResultIcon kind={feedback.result.kind} /><span>{feedback.result.message}</span></p>}
    </div>
    {feedback.result && children}
  </div>;
}
