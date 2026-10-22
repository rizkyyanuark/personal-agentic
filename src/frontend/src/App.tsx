import {
  type ReactNode,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  CalendarClock,
  FolderKanban,
  ListChecks,
  Slash,
  ArrowUp,
  ArrowLeft,
  Check,
  Circle,
  FolderOpen,
  Hash,
  Network,
  ChevronRight,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Search,
  Settings2,
  ShieldCheck,
  Square,
  Terminal,
  X,
  Archive,
  PanelLeftOpen,
  PanelLeftClose,
  FileText,
  RefreshCw,
  LogOut,
  PanelRightClose,
  Users,
  Server,
  UserRound,
  Building2,
  ChevronsUpDown,
} from "lucide-react";
import { Menu } from "@base-ui/react/menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ActionTooltip } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { CommandInput, UsageCard, type CommandInputHandle } from "./ChatCommands";
import { GroupList } from "./GroupList";
import { useGroupPreferences } from "./useGroupPreferences";
import { safeActionError } from "./actionErrors";
import { ArchivedGroups } from "./ArchivedGroups";
import { ChatActivity, MessageModelBadge } from "./ChatActivity";
import { ReplyQuote } from "./ReplyQuote";
import { isActiveRun } from "./runStatus";
import { ProjectTeam } from "./ProjectTeam";
import { RuntimeSelect, HarnessSelect } from "./RuntimeSettings";
import { availableHarnesses, harnessNames, type RegisteredRuntime } from "./runtimeCatalog";
import { NewAgentDialog } from "./NewAgentDialog";
import { ValuePicker } from "./ValuePicker";
import { WorkstationSelect } from "./WorkstationSelect";
import { applicationEnvironmentLabel, sshWorkstationLabel } from "./workstationLabels";
import { UserSettings } from "./UserSettings";
import type { Workstation } from "./bindings/Workstation";
import { GroupDialog } from "./GroupDialog";
import { MessageMarkdown, type MarkdownFile } from "./MessageMarkdown";
import { MarkdownPreview } from "./MarkdownPreview";
import { ActionBoard } from "./ActionBoard";
import { QuestionCard } from "./QuestionCard";
import type { QuestionRequest } from "./bindings/QuestionRequest";
import { ScheduledTasks } from "./ScheduledTasks";
import { api, post, put, requestId, ApiFailure } from "./api";
import { useActionFeedback, ActionStatus, PendingIcon, type ActionResult } from "./ActionFeedback";
import type { Agent } from "./bindings/Agent";
import type { Harness } from "./bindings/Harness";
import type { Group } from "./bindings/Group";
import type { Message } from "./bindings/Message";
import type { Run } from "./bindings/Run";
import type { Artifact } from "./bindings/Artifact";
import type { Workspace } from "./bindings/Workspace";
import type { StateView } from "./bindings/StateView";
import type { Connection } from "./bindings/Connection";
import { WorkstationStatus } from "./WorkstationStatus";
import type { Event } from "./bindings/Event";
import type { CodexSettings } from "./bindings/CodexSettings";
import type { OrganizationContext } from "./bindings/OrganizationContext";
import { KnowledgeExplorer } from "./KnowledgeExplorer";
import { Avatar } from "./Avatar";
import { Group as PanelGroup, Panel, Separator, type PanelImperativeHandle } from "react-resizable-panels";
import { FolderPicker } from "./FolderPicker";
import { AgentTerminal, AgentSkills } from "./AgentTools";
import {
  useRoute,
  parseRoute,
  navigate,
  routePath,
  sections,
  type Route,
  type Section,
} from "./navigation";
import "./workspace.css";
const OrganizationChart = lazy(() =>
  import("./OrganizationChart").then((module) => ({
    default: module.OrganizationChart,
  })),
);
const LivePreview = lazy(() => import("./LivePreview"));

type Session = {
  harness: Harness;
  id: string;
  native_id: string | null;
  agent_id: string;
  group_id: string;
  side_chat_id: string | null;
  workspace: string;
  active: boolean;
};
type FileView = {
  entries?: { name: string; directory: boolean }[];
  text?: string;
  base: string;
};
type SearchResult = {
  messages?: Message[];
  artifacts?: { id: string; name: string; snippet: string; distance: number }[];
};
const active = isActiveRun;
const time = (value: string) =>
  new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
const shortPath = (value: string) =>
  value.replace(/\\/g, "/").split("/").filter(Boolean).slice(-2).join("/");
function NavigationPanel({ defaultSize, panelRef, children }: {
  defaultSize: number;
  panelRef: (handle: PanelImperativeHandle | null) => void;
  children: ReactNode;
}) {
  // A server preference refresh must not reinitialize a panel during a drag.
  const [initialSize] = useState(defaultSize);
  return <Panel id="sidebar" panelRef={panelRef} collapsible collapsedSize={56}
    defaultSize={initialSize} minSize={180} maxSize={420}>{children}</Panel>;
}

function chatMessagesPath(groupId: string, side: string | null, before?: string) {
  const query = new URLSearchParams(side ? { side_chat_id: side } : { main: "true" });
  if (before) query.set("before", before);
  return `/groups/${groupId}/messages?${query}`;
}
export default function App({
  role = "owner",
  controllerAccess = true,
  user = "owner",
  displayName = null,
  onDisplayNameChange,
  workspaceName = "My workspace",
  workspaceId = "default",
  workspaceSettings,
}: {
  role?: string;
  controllerAccess?: boolean;
  user?: string;
  displayName?: string | null;
  onDisplayNameChange?: (name: string | null) => void;
  workspaceName?: string;
  workspaceId?: string;
  workspaceSettings?: ReactNode;
}) {
  const [data, setData] = useState<StateView | null>(null);
  const activeApp = useRef(true);
  useLayoutEffect(() => { activeApp.current = true; return () => { activeApp.current = false; }; }, []);
  const [mobile, setMobile] = useState(() => window.matchMedia("(max-width: 767px)").matches);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(`ae_sidebar_collapsed:v1:${user}:${workspaceId}`) === "true";
    } catch {
      return false;
    }
  });
  const setPersistedCollapsed = useCallback((val: boolean) => {
    setSidebarCollapsed(val);
    try {
      localStorage.setItem(`ae_sidebar_collapsed:v1:${user}:${workspaceId}`, String(val));
    } catch {
      // ignore
    }
  }, [user, workspaceId]);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const navigationPanel = useRef<PanelImperativeHandle | null>(null);
  const edgePointer = useRef<number | null>(null);
  const [displayNameDraft, setDisplayNameDraft] = useState(() => displayName ?? "");
  const prevUser = useRef(user);
  useEffect(() => {
    if (prevUser.current !== user) {
      prevUser.current = user;
      setDisplayNameDraft(displayName ?? "");
    }
  }, [user, displayName]);
  const accountProfileFeedback = useActionFeedback(`account-profile:${user}`, workspaceId);

  const getSavedExpandedWidth = useCallback(() => {
    const fromData = data?.panel_sizes.sidebar;
    if (typeof fromData === "number" && fromData >= 180 && fromData <= 420) {
      return fromData;
    }
    try {
      const fromLocal = Number(localStorage.getItem(`ae_sidebar_expanded_width:v1:${user}:${workspaceId}`));
      if (fromLocal >= 180 && fromLocal <= 420) return fromLocal;
    } catch {
      // ignore
    }
    return 258;
  }, [data?.panel_sizes.sidebar, user, workspaceId]);

  const expandSidebar = useCallback(() => {
    setPersistedCollapsed(false);
    const target = getSavedExpandedWidth();
    navigationPanel.current?.resize(target);
    navigationPanel.current?.expand();
  }, [getSavedExpandedWidth, setPersistedCollapsed]);

  const collapseSidebar = useCallback(() => {
    setPersistedCollapsed(true);
    navigationPanel.current?.collapse();
  }, [setPersistedCollapsed]);

  const separatorRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = separatorRef.current;
    if (!el) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (sidebarCollapsed) {
          expandSidebar();
        } else {
          collapseSidebar();
        }
      }
    };
    el.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => el.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [sidebarCollapsed, expandSidebar, collapseSidebar]);

  const onSidebarPanelRef = useCallback((handle: PanelImperativeHandle | null) => {
    navigationPanel.current = handle;
    if (handle && sidebarCollapsed) {
      handle.collapse();
    }
  }, [sidebarCollapsed]);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const resize = () => setMobile(media.matches);
    media.addEventListener("change", resize);
    return () => media.removeEventListener("change", resize);
  }, []);
  const route = useRoute();
  const groupId = route.groupId;
  const sideChatId = route.sideChatId;
  const selectedAgent = route.agentId;
  const selectedRun = data?.runs.find((run) => run.id === route.runId) ?? null;
  const routeError =
    !route.valid ||
    (data &&
      ((!["Organization", "Live Preview", "Action board", "User settings", "Profile", "Workspace settings"].includes(route.view) &&
        !data.groups.some((g) => g.id === groupId)) ||
        (selectedAgent && !data.agents.some((a) => a.id === selectedAgent)) ||
        (route.runId && !selectedRun)));
  const tab = routeError ? "NotFound" : route.view;
  function go(patch: Partial<Route>, replace = false) {
    if (!activeApp.current) return;
    setMobileNavigationOpen(false);
    setFilePreview(null);
    previewTrigger.current = null;
    const next = { ...route, ...patch, valid: true };
    if ((patch.groupId && patch.groupId !== groupId) || (patch.view && patch.view !== "Chat")) next.sideChatId = null;
    if (next.groupId !== groupId || next.sideChatId !== sideChatId) { setReply(null); setAttachments([]); }
    navigate(
      routePath(
        next,
        data?.groups.find((g) => g.id === next.groupId),
        data?.agents.find((a) => a.id === next.agentId),
      ),
      replace,
    );
  }
  const setSelectedRun = (run: Run | null) =>
    go({ runId: run?.id ?? null, agentId: null });
  const setSelectedAgent = (id: string | null) =>
    go({ view: "Organization", agentId: id, section: "Profile", runId: null });
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  useLayoutEffect(() => {
    if (authenticated && !mobile && navigationPanel.current) {
      if (sidebarCollapsed) {
        navigationPanel.current.collapse();
      }
    }
  }, [authenticated, mobile, sidebarCollapsed]);
  const [ownerKey, setOwnerKey] = useState("");
  const [loadedMessages, setMessages] = useState<Message[]>([]);
  const [messagesScope, setMessagesScope] = useState("");
  const messages = useMemo(() => messagesScope === `${groupId}:${sideChatId ?? "main"}` ? loadedMessages : [], [messagesScope, groupId, sideChatId, loadedMessages]);
  const latestMessageId = messages.at(-1)?.id;
  const [deletedAgentsOpen, setDeletedAgentsOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [enrollmentToken, setEnrollmentToken] = useState("");
  const [draft, setDraft] = useState("");
  const currentDraft = useRef(draft);
  useLayoutEffect(() => { currentDraft.current = draft; }, [draft]);
  const [attachments, setAttachments] = useState<string[]>([]);
  const [reply, setReply] = useState<Message | null>(null);
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  const loadedScope = useRef("");
  const [runEvents, setRunEvents] = useState<Event[]>([]);
  const [runEventsFailure, setRunEventsFailure] = useState<string | null>(null);
  const [filePreview, setFilePreview] = useState<{ file: MarkdownFile; scope: string } | null>(null);
  const previewTrigger = useRef<{ element: HTMLElement; messageId?: string; href: string | null } | null>(null);
  const preview = tab === "Chat" && filePreview?.scope === `${groupId}:${sideChatId ?? "main"}` ? filePreview.file : null;
  const openPreview = useCallback((file: MarkdownFile | null) => {
    if (!file) {
      const trigger = previewTrigger.current;
      previewTrigger.current = null;
      setFilePreview(null);
      requestAnimationFrame(() => {
        const target = trigger?.element.isConnected ? trigger.element
          : trigger?.messageId && trigger.href
            ? Array.from(document.getElementById(trigger.messageId)?.querySelectorAll<HTMLAnchorElement>("a[href]") ?? [])
              .find((link) => link.getAttribute("href") === trigger.href)
            : null;
        target?.focus();
      });
      return;
    }
    if (!previewTrigger.current?.element.isConnected) {
      const element = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      previewTrigger.current = element ? { element, messageId: element.closest("article[id]")?.id, href: element.getAttribute("href") } : null;
    }
    setFilePreview({ file, scope: `${groupId}:${sideChatId ?? "main"}` });
  }, [groupId, sideChatId]);
  const [newAgent, setNewAgent] = useState(false);
  const [newAgentProject, setNewAgentProject] = useState("");
  const [projectTeamOpen, setProjectTeamOpen] = useState(true);
  const [groupEditor, setGroupEditor] = useState<Group | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [semantic, setSemantic] = useState(false);
  const [searchMedia, setSearchMedia] = useState("documents");
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const sendFeedback = useActionFeedback(`chat-send:${groupId}:${sideChatId ?? "main"}`, `${tab}:${groupId}:${sideChatId}`);
  const uploadFeedback = useActionFeedback(`upload:${groupId}`, `${tab}:${groupId}:${sideChatId}`, tab === "Chat" ? "contextual" : "toast");
  const [connected, setConnected] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const cursor = useRef(0);
  const panelGroup = useRef<HTMLDivElement>(null);
  const pendingMessage = useRef<{ fingerprint: string; id: string } | null>(
    null,
  );
  const groupRef = useRef({ groupId, sideChatId, tab });
  const routeContextRef = useRef({ tab, groupId, newAgentProject });
  const navLifetimeRef = useRef(0);
  useEffect(() => {
    const onNav = () => { navLifetimeRef.current += 1; };
    window.addEventListener("popstate", onNav);
    window.addEventListener("ae:navigate", onNav);
    return () => {
      window.removeEventListener("popstate", onNav);
      window.removeEventListener("ae:navigate", onNav);
    };
  }, []);
  useLayoutEffect(() => {
    groupRef.current = { groupId, sideChatId, tab };
    routeContextRef.current = { tab, groupId, newAgentProject };
  }, [groupId, sideChatId, tab, newAgentProject]);

  const genericFeedback = useActionFeedback("workspace-actions");
  const notifyAction = genericFeedback.run;
  const perform = useCallback(
    (work: () => Promise<void>) => work().catch((e: unknown) => notifyAction("action-error", async () => { throw e; })),
    [notifyAction],
  );
  const refresh = useCallback(async () => {
    const response = await api<StateView>("/state");
    // Deleted groups remain recoverable in storage but are not exposed in platform navigation.
    const snapshot = { ...response, groups: response.groups.filter((g) => !g.deleted_at) };
    if (snapshot.cursor < cursor.current) return;
    setData(snapshot);
    cursor.current = snapshot.cursor;
    const { groupId: id, sideChatId: side } = groupRef.current;
    const next = snapshot.groups.some((g) => g.id === id)
      ? await api<Message[]>(chatMessagesPath(id, side))
      : [];
    if (id === groupRef.current.groupId && side === groupRef.current.sideChatId) {
      const scope = `${id}:${side ?? "main"}`;
      const sameScope = loadedScope.current === scope;
      loadedScope.current = scope;
      if (!sameScope) followLatest.current = true;
      // Keep paginated history mounted when live events refresh the newest page.
      setMessages(current => sameScope && next.length ? [...new Map([...current, ...next].map(message => [message.id, message])).values()] : next);
      setMessagesScope(scope);
    }
  }, [setMessages, setMessagesScope]);
  const sidebarPreferences = useGroupPreferences(
    data?.group_preferences ?? { pinned: [], order: [], sort: "custom", sections: [], collapsed: [] },
    async next => { await put("/preferences/groups", next); }, refresh,
  );
  useEffect(() => {
    void perform(async () => {
      const fragment = new URLSearchParams(location.hash.slice(1)).get("key");
      if (fragment) {
        history.replaceState(null, "", location.pathname + location.search);
        await post("/login", { token: fragment });
      }
      try {
        await refresh();
        setConnected(true);
        setAuthenticated(true);
      } catch (e) {
        if (e instanceof ApiFailure && e.status === 401)
          setAuthenticated(false);
        else throw e;
      }
    });
  }, [perform, refresh]);
  useEffect(() => {
    if (authenticated && data && !routeError) {
      // Back may change the URL before this render's normalization effect runs.
      if (routePath(parseRoute(location.href)) !== routePath(route)) return;
      navigate(
        routePath(
          route,
          data.groups.find((g) => g.id === groupId),
          data.agents.find((a) => a.id === selectedAgent),
        ),
        true,
      );
    }
  }, [authenticated, data, routeError, route, groupId, selectedAgent]);
  useEffect(() => {
    if (!authenticated) return;
    if (role !== "owner") { const poll = setInterval(() => {void refresh().then(()=>setConnected(true), ()=>setConnected(false));}, 2000); return () => clearInterval(poll); }
    let timer: ReturnType<typeof setTimeout> | null = null;
    const source = new EventSource(`/api/events?after=${cursor.current}`);
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = () => {
      if (!timer)
        timer = setTimeout(() => {
          timer = null;
          void refresh().then(() => setConnected(true), () => setConnected(false));
        }, 350);
    };
    return () => {
      source.close();
      if (timer) clearTimeout(timer);
    };
  }, [authenticated, perform, refresh, role]);
  useEffect(() => {
    if (authenticated) void perform(refresh);
  }, [groupId, sideChatId, authenticated, perform, refresh]);
  useEffect(() => {
    if (followLatest.current) bottom.current?.scrollIntoView({ behavior: "instant" });
  }, [latestMessageId]);
  useEffect(() => {
    if (!replyTarget) return;
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      if (replyTarget.group_id !== groupId || replyTarget.side_chat_id !== sideChatId) {
        setReplyTarget(null);
        return;
      }
      if (messagesScope !== `${groupId}:${sideChatId ?? "main"}` || !messages.length) return;
      const target = document.getElementById(`message-${replyTarget.id}`);
      if (target) {
        followLatest.current = false;
        target.scrollIntoView({ behavior: "instant", block: "center" });
        target.focus({ preventScroll: true });
        if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
          target.animate([{ backgroundColor: "#bed5ff" }, { backgroundColor: "transparent" }], { duration: 1800 });
        }
        setReplyTarget(null);
        return;
      }
      void api<Message[]>(`${chatMessagesPath(groupId, sideChatId, messages[0].id)}&limit=200`).then(older => {
        if (cancelled) return;
        if (!older.length) {
          void notifyAction("quote-error", async () => { throw new Error("Original message is no longer available in this conversation."); });
          setReplyTarget(null);
        } else {
          setMessages(current => [...new Map([...older, ...current].map(message => [message.id, message])).values()]);
        }
      }, (reason: unknown) => {
        if (!cancelled) {
          void notifyAction("quote-error", async () => { throw reason; });
          setReplyTarget(null);
        }
      });
    });
    return () => { cancelled = true; cancelAnimationFrame(frame); };
  }, [replyTarget, groupId, sideChatId, messagesScope, messages, notifyAction]);
  useEffect(() => {
    if (!selectedRun) return;
    const controller = new AbortController();
    void api<Event[]>(`/runs/${selectedRun.id}/events`, { signal: controller.signal }).then(events => {
      if (!controller.signal.aborted) { setRunEvents(events); setRunEventsFailure(null); }
    }, () => { if (!controller.signal.aborted) setRunEventsFailure(selectedRun.id); });
    return () => controller.abort();
  }, [selectedRun, data?.cursor]);


  const group = data?.groups.find((g) => g.id === groupId);
  const groupClosed = !!(group?.archived_at || group?.deleted_at);
  const organizationAgents = data?.agents ?? [];
  const allAgents = [...organizationAgents, ...(data?.deleted_agents ?? [])];
  const groupAccess = data?.group_access?.[groupId];
  const participants = organizationAgents.filter((agent) => !groupAccess || groupAccess.participant_ids.includes(agent.id));
  const composerInput = useRef<CommandInputHandle>(null);
  const mentionedAgents = /@all\b/i.test(draft)
    ? participants.filter((a) => a.enabled)
    : participants.filter((a) =>
        draft.toLowerCase().includes(`@${a.name.toLowerCase()}`) || draft.includes(`@${a.id}`),
      );
  const running =
    data?.runs.filter((r) => r.group_id === groupId && active(r)) ?? [];
  const chatRunning = running.filter((r) => (r.side_chat_id ?? null) === sideChatId);
  const pendingQuestions = (data?.questions ?? []).filter(q => q.status === "pending" && data?.groups.some(g => g.id === q.group_id));
  const chatQuestions = pendingQuestions.filter(q => q.group_id === groupId && q.side_chat_id === sideChatId);
  const agent = data?.agents.find((a) => a.id === selectedAgent);

  async function send() {
    if (!draft.trim() || busy || groupClosed) return;
    const submittedDraft = draft;
    await sendFeedback.run("send", async () => {
      setBusy(true);
      try {
      const content = {
        group_id: groupId,
        body: draft,
        side_chat_id: sideChatId,
        recipients: [], // The server resolves complete mentions and enforces room membership.
        reply_to: reply?.id ?? null,
        artifacts: attachments,
      };
      const fingerprint = JSON.stringify(content);
      if (pendingMessage.current?.fingerprint !== fingerprint)
        pendingMessage.current = { fingerprint, id: requestId() };
      if (content.body.trim() === "/usage") sendFeedback.watchRequest(pendingMessage.current.id);
      let sent: Message;
      try { sent = await post<Message>("/messages", { id: pendingMessage.current.id, ...content }); }
      catch (error) {
        if (error instanceof ApiFailure && error.status >= 400 && error.status < 500 && error.status !== 408) {
          const detail = safeActionError(error, "The server rejected this request.").slice(0, 350);
          throw new Error(`Message rejected: ${detail} Your draft is kept.`);
        }
        throw error;
      }
      const sameChat = groupRef.current.groupId === groupId && groupRef.current.sideChatId === sideChatId;
      if (sent.command === "btw" && sent.side_chat_id && sameChat && groupRef.current.tab === "Chat") go({ sideChatId: sent.side_chat_id, view: "Chat" });
      pendingMessage.current = null;
      followLatest.current = true;
      if (sameChat) {
        if (currentDraft.current === submittedDraft) setDraft("");
        setReply(current => current?.id === content.reply_to ? null : current);
        setAttachments(current => current.filter(id => !content.artifacts.includes(id)));
      }
      try { await refresh(); }
      catch { return { kind: "warning", message: "Message accepted, but the conversation could not refresh. Refresh the view without sending again." }; }
      } finally { setBusy(false); }
    }, { errorMessage: "Message acceptance could not be confirmed. Your draft is kept; retrying the same message uses its original request ID." });
  }
  async function upload(file: File) {
    await uploadFeedback.run("upload", async () => {
      const form = new FormData();
      form.append("group_id", groupId);
      form.append("file", file);
      const artifact = await api<Artifact>("/artifacts", {
        method: "POST",
        body: form,
      });
      if (tab === "Chat" && groupRef.current.groupId === groupId && groupRef.current.sideChatId === sideChatId) setAttachments((old) => [...old, artifact.id]);
      try { await refresh(); }
      catch { return { kind: "warning", message: "File stored, but the view could not refresh. Refresh before uploading it again." }; }
      return { kind: "success", message: tab === "Chat" ? "Attachment stored and ready to send." : "File stored. Index it to make it searchable." };
    }, { errorMessage: "Upload could not be confirmed. Check the files before uploading again." });
  }

  async function addReportToKnowledge(file: MarkdownFile, source: Blob): Promise<Artifact> {
    const snapshot = await api<StateView>("/state");
    const target = snapshot.groups.find((group) => group.id === groupId);
    if (!target || target.archived_at || target.deleted_at) throw new Error("Restore this group to add knowledge.");
    const bytes = new Uint8Array(await source.arrayBuffer());
    let artifact: Artifact | undefined;
    // ponytail: sequential adds reuse exact bytes; concurrent adds need server-side hash uniqueness.
    for (const candidate of snapshot.artifacts.filter((item) => item.group_id === groupId && item.status !== "deleted" && item.media_type.startsWith("text/") && item.name === file.name && item.size === source.size)) {
      const response = await fetch(`/api/artifacts/${candidate.id}`);
      if (!response.ok) throw new Error("Unable to check existing knowledge files. Please try again.");
      const saved = new Uint8Array(await response.arrayBuffer());
      if (saved.length === bytes.length && saved.every((byte, index) => byte === bytes[index])) { artifact = candidate; break; }
    }
    if (!artifact) {
      const form = new FormData();
      form.append("group_id", groupId);
      form.append("file", new Blob([source], { type: "text/markdown" }), file.name);
      artifact = await api<Artifact>("/artifacts", { method: "POST", body: form });
    }
    if (artifact.status === "stored" || artifact.status === "failed") artifact = await post<Artifact>(`/artifacts/${artifact.id}/index`);
    await refresh();
    return artifact;
  }

  if (authenticated !== true)
    return (
      <main className="login-page">
        <div className="login-card">
          <img className="brand-mark" src="/agentic-enterprise-logo.png" alt="Agentic Enterprise logo" width={44} height={44} />
          <p className="eyebrow">YOUR PERSONAL AGENT WORKSPACE</p>
          <h1>Agentic Enterprise</h1>
          <p>One place for your agents, codebases, and conversations.</p>
          {authenticated === null ? (
            <p>Connecting to your local workspace…</p>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void perform(async () => {
                  await post("/login", { token: ownerKey.trim() });
                  setOwnerKey("");
                  setAuthenticated(true);
                  await refresh();
                });
              }}
            >
              <Label htmlFor="owner-key">Owner key</Label>
              <Input
                id="owner-key"
                type="password"
                value={ownerKey}
                onChange={(e) => setOwnerKey(e.target.value)}
                autoComplete="current-password"
                required
              />
              <Button type="submit" className="w-full mt-4">
                Open workspace <ArrowUp size={16} />
              </Button>
              <p className="hint">
                Use the native Open script, or enter the key from
                org/.state/owner.key.
              </p>
            </form>
          )}
          <span className="local-label">
            <ShieldCheck size={14} /> Native on this machine
          </span>
        </div>
      </main>
    );

  const renderAccountMenu = (inRail: boolean) => (
    <Menu.Root>
      <ActionTooltip
        content={`Account: ${displayName || user} (${role === "owner" ? "Owner" : "Member"})`}
        side={inRail ? "right" : "top"}
        disabled={!inRail}
      >
        <Menu.Trigger
          className={inRail ? "rail-account-trigger" : "account-menu-trigger"}
          aria-label="Account menu"
          title={`Account: ${displayName || user} (${role === "owner" ? "Owner" : "Member"})`}
        >
          <Avatar owner={role === "owner"} name={displayName || user} />
          {!inRail && (
            <>
              <div className="account-menu-info">
                <strong className="account-menu-name">{displayName || user}</strong>
                <small className="account-menu-role">{role === "owner" ? "Owner" : "Member"}</small>
              </div>
              <ChevronsUpDown size={15} className="account-menu-chevron" aria-hidden="true" />
            </>
          )}
        </Menu.Trigger>
      </ActionTooltip>
      <Menu.Portal>
        <Menu.Positioner align="start" side="top" sideOffset={8} className="account-menu-positioner">
          <Menu.Popup className="account-menu">
            <div className="account-menu-header" role="none">
              <Avatar owner={role === "owner"} name={displayName || user} />
              <div className="account-menu-info">
                <strong className="account-menu-name">{displayName || user}</strong>
                <small className="account-menu-role">{role === "owner" ? "Platform administrator" : "Matrix member"}</small>
              </div>
            </div>
            <div className="account-menu-separator" role="separator" />
            <Menu.Item
              className="account-menu-item"
              onClick={() => {
                if (mobile) setMobileNavigationOpen(false);
                go({ view: "Profile", agentId: null, runId: null });
              }}
            >
              <UserRound size={16} aria-hidden="true" />
              <span>Profile</span>
            </Menu.Item>
            {controllerAccess && (
              <Menu.Item
                className="account-menu-item"
                onClick={() => {
                  if (mobile) setMobileNavigationOpen(false);
                  go({ view: "User settings", agentId: null, runId: null });
                }}
              >
                <Server size={16} aria-hidden="true" />
                <span>Runtime settings</span>
              </Menu.Item>
            )}
            {role === "owner" && (
              <Menu.Item
                className="account-menu-item"
                onClick={() => {
                  if (mobile) setMobileNavigationOpen(false);
                  go({ view: "Workspace settings", agentId: null, runId: null });
                }}
              >
                <Building2 size={16} aria-hidden="true" />
                <span>Workspace settings</span>
              </Menu.Item>
            )}
            {role === "owner" && (
              <Menu.Item
                className="account-menu-item"
                onClick={() => {
                  setArchiveOpen(true);
                }}
              >
                <Archive size={16} aria-hidden="true" />
                <span>Archived groups</span>
              </Menu.Item>
            )}
            <div className="account-menu-separator" role="separator" />
            <Menu.Item
              className="account-menu-item account-menu-item-danger"
              onClick={() =>
                void perform(async () => {
                  await post("/logout");
                  location.reload();
                })
              }
            >
              <LogOut size={16} aria-hidden="true" />
              <span>Sign out</span>
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );

  const navigation = (
    <aside className="sidebar">
      <div className="brand">
        <img className="brand-mark" src="/agentic-enterprise-logo.png" alt="Agentic Enterprise logo" width={44} height={44} />
        <div>
          <strong>Agentic Enterprise</strong>
          <span>{workspaceName}</span>
        </div>
        {!mobile && (
          <button
            className="sidebar-collapse-button"
            aria-label="Collapse navigation"
            title="Collapse navigation"
            onClick={() => {
              navigationPanel.current?.collapse();
              setPersistedCollapsed(true);
            }}
          >
            <PanelLeftClose size={18} />
          </button>
        )}
      </div>
      {role === "owner" && (
        <button
          className="search-button"
          aria-label={group ? `Search #${group.name}` : "Search unavailable: select a group to search"}
          title={group ? `Search #${group.name}` : "Select a group to search messages and documents"}
          disabled={!group}
          onClick={() => setSearchOpen(true)}
        >
          <Search size={16} /> <span>{group ? `Search #${group.name}` : "Select a group to search"}</span> {group && <kbd>⌕</kbd>}
        </button>
      )}
      {data && (
        <GroupList
          readOnly={role !== "owner"}
          groups={data.groups}
          persistence={sidebarPreferences}
          selected={["Organization", "Live Preview", "Action board", "User settings", "Profile", "Workspace settings"].includes(tab) ? null : groupId}
          running={data.runs.filter(active).map((r) => r.group_id)}
          onCreate={() => setGroupEditor({ id: "", name: "", description: "", member_ids: [], human_ids: [], project:null, scope_levels: null, chat_lead_id: null, archived_at: null, deleted_at: null })}
          onCreateProject={() => setGroupEditor({ id:"", name:"", description:"", project:{workdir:{path:"",canonical_path:"",git_root:null,ssh_host:null},members:[]},scope_levels:null,chat_lead_id:null,archived_at:null,deleted_at:null })}
          onSelect={(id) => {
            go({ groupId: id, view: "Chat", agentId: null, runId: null });
            setReply(null);
            setAttachments([]);
          }}
        />
      )}
      <div className="sidebar-bottom">
        {role === "owner" && (
          <nav className="sidebar-shortcuts" aria-label="Workspace tools">
            <button
              className={`organization-button ${tab === "Action board" || tab === "Actions" ? "selected" : ""}`}
              onClick={() => go({ view: "Action board", agentId: null, runId: null })}
            >
              <ListChecks size={18} />
              <span>Action board</span>
              <ChevronRight size={15} />
            </button>
            <button
              className={`organization-button ${tab === "Organization" || tab === "Live Preview" ? "selected" : ""}`}
              onClick={() => {
                go({ view: "Organization", agentId: null, runId: null });
              }}
            >
              <Network size={18} />
              <span>Organization</span>
              <ChevronRight size={15} />
            </button>
          </nav>
        )}
        <div className="owner-row">
          {renderAccountMenu(false)}
        </div>
      </div>
    </aside>
  );

  const railNavigation = (
    <aside className="sidebar rail" aria-label="Workspace navigation">
      <div className="rail-top">
        <ActionTooltip content="Expand navigation" side="right">
          <button
            className="rail-toggle-button"
            aria-label="Expand navigation"
            title="Expand navigation"
            onClick={expandSidebar}
          >
            <PanelLeftOpen size={20} />
          </button>
        </ActionTooltip>
        {role === "owner" && (
          <ActionTooltip
            content={group ? `Search #${group.name}` : "Select a group to search messages and documents"}
            side="right"
          >
            <button
              className={`rail-action-button ${!group ? "disabled" : ""}`}
              aria-label={group ? `Search #${group.name}` : "Search unavailable: select a group to search"}
              title={group ? `Search #${group.name}` : "Select a group to search messages and documents"}
              disabled={!group}
              onClick={() => setSearchOpen(true)}
            >
              <Search size={18} />
            </button>
          </ActionTooltip>
        )}
      </div>
      {role === "owner" && (
        <nav className="rail-shortcuts" aria-label="Workspace tools">
          <ActionTooltip content="Action board" side="right">
            <button
              className={`rail-action-button ${tab === "Action board" || tab === "Actions" ? "selected" : ""}`}
              aria-label="Action board"
              title="Action board"
              onClick={() => go({ view: "Action board", agentId: null, runId: null })}
            >
              <ListChecks size={18} />
            </button>
          </ActionTooltip>
          <ActionTooltip content="Organization" side="right">
            <button
              className={`rail-action-button ${tab === "Organization" || tab === "Live Preview" ? "selected" : ""}`}
              aria-label="Organization"
              title="Organization"
              onClick={() => go({ view: "Organization", agentId: null, runId: null })}
            >
              <Network size={18} />
            </button>
          </ActionTooltip>
        </nav>
      )}
      <div className="rail-bottom">
        {renderAccountMenu(true)}
      </div>
    </aside>
  );

  return (
    <div className="shell">
      <PanelGroup
        className="workspace-panels"
        elementRef={panelGroup}
        onLayoutChanged={(_, meta) => {
          if (meta.isUserInteraction) {
            // Keyboard layout commits precede ResizeObserver; measure after React paints.
            requestAnimationFrame(() => {
              const sidebarEl = panelGroup.current?.querySelector(".sidebar");
              if (sidebarEl && !mobile) {
                const currentWidth = Math.round(sidebarEl.getBoundingClientRect().width);
                if (currentWidth <= 60 && !sidebarCollapsed) {
                  setPersistedCollapsed(true);
                } else if (currentWidth >= 180 && sidebarCollapsed) {
                  setPersistedCollapsed(false);
                }
              }
              const widths: Record<string, number> = {};
              for (const name of ["sidebar", "inspector"]) {
                const panel = panelGroup.current?.querySelector(`.${name}`);
                if (panel && !mobile && panel.getBoundingClientRect().width >= (name === "sidebar" ? 180 : 300)) {
                  const width = Math.round(panel.getBoundingClientRect().width);
                  widths[name] = width;
                  if (name === "sidebar" && width >= 180 && width <= 420) {
                    try {
                      localStorage.setItem(`ae_sidebar_expanded_width:v1:${user}:${workspaceId}`, String(width));
                    } catch {
                      // ignore
                    }
                  }
                }
              }
              if (Object.keys(widths).length)
                void perform(async () => {
                  await put("/preferences/panels", widths);
                });
            });
          }
        }}
      >
        {!mobile && <NavigationPanel panelRef={onSidebarPanelRef} defaultSize={getSavedExpandedWidth()}>
          {sidebarCollapsed ? railNavigation : navigation}
        </NavigationPanel>}
        {!mobile && <Separator
          elementRef={separatorRef}
          className="panel-separator navigation-separator"
          aria-label="Resize main navigation"
          title="Click to toggle navigation rail. Drag to resize."
          onPointerDownCapture={(event) => { edgePointer.current = event.clientX; }}
          onMouseDownCapture={(event) => { edgePointer.current = event.clientX; }}
          onClick={(event) => {
            const start = edgePointer.current;
            edgePointer.current = null;
            if (start === null || Math.abs(event.clientX - start) < 8) {
              if (sidebarCollapsed) {
                expandSidebar();
              } else {
                collapseSidebar();
              }
            }
          }}
        />}
        <Panel id="content" minSize={mobile && (agent || selectedRun || preview) ? 0 : 220}>
          <main className={`main-panel${preview ? " has-file-preview" : ""}`} inert={mobile && !!(agent || selectedRun || preview)}>
            {mobile && <div className="navigation-toolbar">
              <button aria-label="Show navigation" onClick={() => setMobileNavigationOpen(true)}><PanelLeftOpen size={20} /><span>Workspace</span></button>
            </div>}
            {tab === "NotFound" && (
              <div className="empty-state">
                <h2>Page not found</h2>
                <p>This group, agent or view is unavailable.</p>
                <Button
                  onClick={() =>
                    go({
                      groupId: "general",
                      view: "Chat",
                      agentId: null,
                      runId: null,
                    })
                  }
                >
                  Open General
                </Button>
              </div>
            )}
            {tab !== "Organization" && tab !== "Live Preview" && tab !== "Action board" && tab !== "User settings" && tab !== "Profile" && tab !== "Workspace settings" && tab !== "NotFound" && (
              <>
                <header className="topbar">
                  <div className="group-title">
                    {group?.project?<FolderKanban size={23}/>:<Hash size={23} />}
                    <div>
                      <h1>{group?.name}</h1>
                      <p>{group?.description}</p>
                    </div>
                  </div>
                  <div className="topbar-actions">
                    {tab === "Chat" && <ChatActivity questions={chatQuestions.map(q => q.run_id)} runs={(data?.runs ?? []).filter((r) => r.group_id === groupId && (r.side_chat_id ?? null) === sideChatId)} onOpen={setSelectedRun} />}
                    <Dialog>
                      <DialogTrigger render={<button className="group-members-trigger" aria-label="View group agents" />}>
                        <span className="avatar-stack">
                          {participants.slice(0, 4).map((a) => <Avatar key={a.id} agent={a} />)}
                          {participants.length === 0 && <Users size={18} />}
                        </span>
                        <span className="group-members-count">{participants.length}</span>
                      </DialogTrigger>
                      <DialogContent className="group-members-dialog">
                        <DialogHeader>
                          <DialogTitle>Agents in {group?.name}</DialogTitle>
                          <DialogDescription>{participants.length} agents in this group’s chat scope. Mention @name to message them directly.</DialogDescription>
                        </DialogHeader>
                        <ul className="group-members-list" aria-label="Group agents">
                          {participants.map((a) => (
                            <li key={a.id}>
                              <Avatar agent={a} />
                              <div><strong>{a.name}</strong><span>{a.position || a.role}</span></div>
                              {!a.enabled ? <Badge variant="outline">Paused</Badge> : null}
                            </li>
                          ))}
                        </ul>
                        {participants.length === 0 && <p>No agents in this group’s chat scope.</p>}
                      </DialogContent>
                    </Dialog>
                    {role === "owner" && <Button
                      variant="outline"
                      size="sm"
                      onClick={() => group && setGroupEditor(group)}
                    >
                      <Settings2 size={14} /> {group?.project?"Manage project":"Manage group"}
                    </Button>}
                  </div>
                </header>
                {groupClosed && <div className="group-status-banner" role="status">
                  <div><strong>{group?.deleted_at ? "Deleted group" : "Archived group"}</strong><p>History and files are kept. Restore this group to make changes. Scheduled tasks stay paused.</p></div>
                  <Button size="sm" variant="outline" onClick={() => group && setGroupEditor(group)}>Restore group</Button>
                </div>}
                <nav className="view-tabs" aria-label="Group views">
                  {(
                    [
                      ["Chat", MessageSquare],
                      ["Knowledge", FileText],
                      ["Runs", Terminal],
                      ["Scheduled tasks", CalendarClock],
                      ["Actions", ListChecks],
                      ["Structure", Network],
                    ] as const
                  ).filter(([name]) => (role === "owner" || name === "Chat") && (name !== "Structure" || !!group?.project)).map(([name, Icon]) => (
                    <button
                      className={tab === name ? "active" : ""}
                      key={name}
                      onClick={() => {
                        go({ view: name, agentId: null, runId: null });
                      }}
                    >
                      <Icon size={16} />
                      {name}
                      {name === "Runs" && running.length > 0 && (
                        <span>{running.length}</span>
                      )}
                    </button>
                  ))}
                  <span className="view-context">
                    <FolderOpen size={14} />
                    {group?.project ? "Project workdir" : `${participants.filter((a) => a.workdir).length} attached codebases`}
                  </span>
                </nav>
              </>
            )}
            {pendingQuestions.some(q => tab !== "Chat" || q.group_id !== groupId || q.side_chat_id !== sideChatId) && <div className="question-notice" role="status">
              {pendingQuestions.filter(q => tab !== "Chat" || q.group_id !== groupId || q.side_chat_id !== sideChatId).map(q => <button key={q.id} onClick={() => go({groupId:q.group_id,sideChatId:q.side_chat_id,view:"Chat",agentId:null,runId:null})}>
                {q.agent_name} needs your answer · {data?.groups.find(g => g.id === q.group_id)?.name}{q.side_chat_id ? " · Side chat" : ""}
              </button>)}
            </div>}
            {!connected && (
              <div className="banner notice" role="status">
                Reconnecting to your workspace…
              </div>
            )}
            {notice && (
              <div className="banner notice" role="status">
                {notice}
                <button
                  aria-label="Dismiss notice"
                  onClick={() => setNotice("")}
                >
                  <X size={16} />
                </button>
              </div>
            )}
            {tab === "Chat" && (
              <>
                <div className="timeline" onScroll={event => {
                  const node = event.currentTarget;
                  followLatest.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
                }}>
                  {sideChatId && (
                    <div className="side-chat-header" role="region" aria-label="Side chat">
                      <Button variant="outline" size="sm" onClick={() => go({ sideChatId: null })}>Back to main chat</Button>
                      <strong>Side chat</strong>
                      <span>Starts with main-chat context, then runs independently. /reset resets only this side chat.</span>
                    </div>
                  )}
                  {!sideChatId && <div className="channel-intro">
                    <div className="channel-symbol">
                      {group?.project?<FolderKanban size={28}/>:<Hash size={28} />}
                    </div>
                    <h2>{group?.project?group.name:"Your team starts here."}</h2>
                    <p>
                      {group?.project ? `Project workspace: ${group.project.workdir.ssh_host ? sshWorkstationLabel(group.project.workdir.ssh_host, data?.workstations ?? []) + ": " : group.project.workdir.runtime_id ? "" : applicationEnvironmentLabel + ": "}${group.project.workdir.path}` : "A shared space to give direction, work together, and see what gets done."}
                    </p>
                    <div className="intro-chips">
                      <span>
                        <ShieldCheck size={13} /> Local & private
                      </span>
                      <span>
                        <Terminal size={13} /> Native agent execution
                      </span>
                      <span>
                        <FolderOpen size={13} /> Your existing codebases
                      </span>
                    </div>
                  </div>}
                  {messages.length >= 50 && (
                    <button
                      className="load-more"
                      onClick={() =>
                        void perform(async () => {
                          const older = await api<Message[]>(
                            chatMessagesPath(groupId, sideChatId, messages[0].id),
                          );
                          if (groupRef.current.groupId === groupId && groupRef.current.sideChatId === sideChatId) setMessages([...older, ...messages]);
                        })
                      }
                    >
                      Load earlier messages
                    </button>
                  )}
                  {messages.length > 0 && (
                    <div className="date-separator">
                      <span>
                        {new Date(messages[0].created_at).toLocaleDateString(
                          [],
                          {
                            month: "long",
                            day: "numeric",
                            year: "numeric",
                          },
                        )}
                      </span>
                    </div>
                  )}
                  {messages.map((m) => {
                    const isSelf = m.sender === user;
                    const isHuman = m.sender === "owner" || m.sender.startsWith("@");
                    const sender = allAgents.find((a) => a.id === m.sender);
                    const position = sender?.position || data?.runs.find((run) => run.id === m.run_id)?.profile.position;
                    return (
                    <article id={`message-${m.id}`} tabIndex={-1} className={`message message-${isSelf ? "self" : m.sender === "system" ? "system" : isHuman ? "human" : "agent"}`} key={m.id}>
                      {m.sender === "system" ? (
                        <div className="avatar system-avatar">
                          <Slash size={17} />
                        </div>
                      ) : (
                        <Avatar
                          agent={allAgents.find((a) => a.id === m.sender)}
                          owner={isHuman}
                        />
                      )}
                      <div className="message-content">
                        <div className="message-heading">
                          <strong>
                            {isSelf ? "You" : m.sender === "system"
                              ? "Agentic Enterprise"
                              : m.sender === "owner"
                                ? "Workspace owner"
                                : (allAgents.find((a) => a.id === m.sender)
                                    ?.name ?? m.sender)}
                          </strong>
                          {!isHuman && m.sender !== "system" && position && (
                            <span className="bot-badge" title={position}>{position}</span>
                          )}
                          {!isHuman && m.sender !== "system" && m.run_id && (
                            <MessageModelBadge runId={m.run_id} run={data?.runs.find((r) => r.id === m.run_id)} />
                          )}
                          {m.schedule_id && (
                            <span className="scheduled-message-label">
                              <CalendarClock size={12} />
                              Scheduled
                            </span>
                          )}
                          <time>{time(m.created_at)}</time>
                          {m.command !== "question" && <button
                            className="reply-action"
                            disabled={groupClosed}
                            onClick={() => {
                              if (m.side_chat_id && m.side_chat_id !== sideChatId) go({ sideChatId: m.side_chat_id });
                              else setReply(m);
                            }}
                          >
                            Reply
                          </button>}
                        </div>
                        <div className="message-bubble">
                          {m.reply_to && <ReplyQuote key={`${groupId}:${m.reply_to}`} id={m.reply_to}
                            message={messages.find(message => message.id === m.reply_to)}
                            groupId={groupId} sideChatId={m.command === "btw" ? null : m.side_chat_id} agents={allAgents} user={user}
                            jumping={replyTarget?.id === m.reply_to} onJump={message => {
                              setReplyTarget(message);
                              if (message.side_chat_id !== sideChatId) go({ sideChatId: message.side_chat_id });
                            }} />}
                          <div className="markdown">
                            <MessageMarkdown runId={m.run_id} onPreview={openPreview} agents={allAgents} onMention={setSelectedAgent}>
                              {m.command === "btw" ? (m.body.replace(/^\s*\/btw\s*/, "") || "Side conversation") : m.body}
                            </MessageMarkdown>
                          </div>
                          {m.command === "question" && <QuestionCard id={m.id} question={data?.questions?.find(q => q.id === m.id)} onRefresh={refresh} />}
                          {m.artifacts.map((id) => {
                            const file = data?.artifacts.find((a) => a.id === id);
                            const isMarkdown = /\.(md|markdown)$/i.test(file?.name ?? "");
                            return <a
                              key={id}
                              className="attachment-pill"
                              href={`/api/artifacts/${id}`}
                              target={isMarkdown ? undefined : "_blank"}
                              rel="noreferrer"
                              onClick={isMarkdown && file ? (event) => {
                                event.preventDefault();
                                openPreview({ url: `/api/artifacts/${id}`, name: file.name, runId: null });
                              } : undefined}
                            >
                              <Paperclip size={13} />
                              {file?.name ?? "Attachment"}
                            </a>;
                          })}
                        </div>
                        {!sideChatId && m.command === "btw" && m.side_chat_id === m.id && (
                          <Button variant="outline" size="sm" onClick={() => go({ sideChatId: m.id })}>Open side chat</Button>
                        )}
                        {m.usage_report && (
                          <UsageCard report={m.usage_report} />
                        )}
                        {m.run_id && (
                          <button
                            className="run-link"
                            onClick={() => {
                              setSelectedRun(
                                data?.runs.find((r) => r.id === m.run_id) ??
                                  null,
                              );
                            }}
                          >
                            <Check size={13} /> View execution evidence
                          </button>
                        )}
                        {!!data?.runs.find((run) => run.id === m.run_id)?.artifact_errors.length && <p className="error run-document-notice">
                          Some linked documents could not be saved. View execution evidence for details.
                        </p>}
                        {isHuman &&
                          data?.runs
                            .filter((r) => r.message_id === m.id)
                            .map((r) => (
                              <button
                                key={r.id}
                                className={`delivery ${r.status}`}
                                onClick={() => {
                                  setSelectedRun(r);
                                }}
                              >
                                <Circle size={8} fill="currentColor" />
                                {r.profile.name}
                                {r.kind === "delegate"
                                  ? " · delegated"
                                  : r.kind === "summary"
                                    ? " · summary"
                                    : ""}
                                : {r.status.replace("_", " ")}
                                {r.error && (
                                  <span> · {r.error.slice(0, 100)}</span>
                                )}
                              </button>
                            ))}
                      </div>
                    </article>
                  ); })}
                  {chatQuestions.filter(q => !messages.some(m => m.id === q.id)).map(q => <div key={q.id}>
                    <p>{q.agent_name} needs your answer.</p>
                    <QuestionCard id={q.id} question={q} onRefresh={refresh} />
                  </div>)}
                  {chatRunning.length > 0 && (
                    <div className="running-card">
                      <Terminal size={17} />
                      <div>
                        <strong>
                          {chatRunning
                            .map(
                              (r) =>
                                data?.agents.find((a) => a.id === r.agent_id)
                                  ?.name,
                            )
                            .join(", ")}{" "}
                          {chatQuestions.length ? "waiting for your answer" : "working"}
                        </strong>
                        <span>
                          {chatRunning[0].status} · {shortPath(chatRunning[0].cwd)}
                        </span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          void perform(async () => {
                            await post(`/runs/${chatRunning[0].id}/cancel`);
                            await refresh();
                          })
                        }
                      >
                        <Square size={11} /> Stop
                      </Button>
                      <button
                        aria-label="View live output"
                        onClick={() => {
                          setSelectedRun(chatRunning[0]);
                        }}
                      >
                        <MoreHorizontal size={20} />
                      </button>
                    </div>
                  )}
                  <div ref={bottom} />
                </div>
                {!groupClosed && <div className="composer-area">
                  {reply && (
                    <div className="reply-preview">
                      <ReplyQuote key={reply.id} id={reply.id} message={reply}
                        groupId={groupId} sideChatId={reply.side_chat_id} agents={allAgents} user={user} />
                      <button
                        aria-label="Cancel reply"
                        onClick={() => setReply(null)}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                  <div className="composer">
                    <CommandInput
                      key={`${groupId}:${sideChatId ?? "main"}`}
                      value={draft}
                      agents={participants}
                      ref={composerInput}
                      onChange={value => { setDraft(value); sendFeedback.clear(); }}
                      onSend={() => void send()}
                      busy={busy}
                      placeholder={chatQuestions.length ? "Answer the question above to continue · new messages are queued" : sideChatId ? "Message this side chat · independent session" : `Message #${group?.name ?? ""} · / for commands`}
                    />
                    {attachments.length > 0 && (
                      <div className="compose-attachments">
                        {attachments.map((id) => (
                          <button
                            key={id}
                            onClick={() =>
                              setAttachments((old) =>
                                old.filter((i) => i !== id),
                              )
                            }
                          >
                            <Paperclip size={12} />
                            {data?.artifacts.find((a) => a.id === id)?.name}
                            <X size={12} />
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="composer-footer">
                      <button aria-label="Mention an agent" onMouseDown={e=>e.preventDefault()} onClick={()=>composerInput.current?.openMentions()}> @ </button>
                      <button
                        aria-label="Attach file"
                        disabled={Boolean(uploadFeedback.pending)}
                        aria-busy={Boolean(uploadFeedback.pending)}
                        onClick={() => uploadRef.current?.click()}
                      >
                        {uploadFeedback.pending ? <PendingIcon pending size={18} /> : <Paperclip size={18} />}
                      </button>
                      <span className="chat-lead-hint">
                        {draft.trim().startsWith("/")
                          ? draft.trim().startsWith("/reset")
                            ? sideChatId ? "Fresh sessions for this side chat. Main chat and other side chats are unchanged." : "Fresh sessions for this group and its side chats. Other groups are unchanged."
                            : draft.trim().startsWith("/btw") ? "Opens an independent side chat with main-chat context. Add a question to start work." : "Chat commands run directly in your workspace."
                          : mentionedAgents.length > 0
                            ? `Sending to ${mentionedAgents.map((a) => a.name).join(", ")}.`
                            : "Room message · mention an agent to start work."}
                      </span>
                      <Button
                        aria-label="Send message"
                        aria-busy={Boolean(sendFeedback.pending)}
                        disabled={!draft.trim() || busy}
                        size="icon"
                        onClick={() => void send()}
                      >
                        {sendFeedback.pending ? <PendingIcon pending size={18} /> : <ArrowUp size={18} />}
                      </Button>
                    </div>
                  </div>
                  <p className="composer-hint">
                    Enter to send · Shift + Enter for a new line · / for
                    commands · @name to send directly{" "}
                    <span>Agent activity is saved to your organization.</span>
                  </p>
                  <ActionStatus feedback={sendFeedback}>
                    {sendFeedback.result?.kind === "warning" && <Button variant="outline" onClick={() => void sendFeedback.run("refresh", async () => { await refresh(); return { kind: "success", message: "Conversation refreshed." }; }, { errorMessage: "Conversation could not refresh. The previously accepted message remains saved." })}>Retry refresh</Button>}
                  </ActionStatus>
                  <ActionStatus feedback={uploadFeedback} />
                </div>}
              </>
            )}
            {tab === "Runs" && (
              <div className="content-view">
                <div className="view-heading">
                  <div>
                    <h2>Execution history</h2>
                    <p>Real processes. Inspectable outcomes.</p>
                  </div>
                  <Badge variant="outline">
                    {data?.runs.filter((r) => r.group_id === groupId).length}{" "}
                    recent runs
                  </Badge>
                </div>
                {data?.runs
                  .filter((r) => r.group_id === groupId)
                  .map((r) => (
                    <button
                      className="run-row"
                      key={r.id}
                      onClick={() => {
                        setSelectedRun(r);
                      }}
                    >
                      <Avatar
                        agent={data.agents.find((a) => a.id === r.agent_id)}
                      />
                      <div>
                        <strong>
                          {data.agents.find((a) => a.id === r.agent_id)?.name}
                        </strong>
                        <small>{r.cwd}</small>
                      </div>
                      <Badge variant="outline">{r.status}</Badge>
                      <time>{time(r.created_at)}</time>
                    </button>
                  ))}
                {!data?.runs.some((r) => r.group_id === groupId) && (
                  <Empty
                    icon={<Terminal size={28} />}
                    title="Your runs will appear here"
                    text="Select an agent when sending a message to start its first run."
                  />
                )}
              </div>
            )}
            {tab === "Scheduled tasks" && (
              <ScheduledTasks
                readOnly={groupClosed}
                key={`${groupId}:${groupClosed}`}
                groupId={groupId}
                tasks={
                  data?.schedules.filter((s) => s.group_id === groupId) ?? []
                }
                runs={data?.runs ?? []}
                onRefresh={refresh}
                onOpenRun={(id) => go({ runId: id })}
              />
            )}
            {tab === "Knowledge" && (
              <KnowledgeExplorer
                groupId={groupId}
                uploadPending={Boolean(uploadFeedback.pending)}
                readOnly={groupClosed}
                key={`${groupId}:${groupClosed}`}
                files={
                  data?.artifacts.filter((a) => a.group_id === groupId && a.in_knowledge) ?? []
                }
                groupName={group?.name ?? ""}
                onUpload={() => uploadRef.current?.click()}
                onRefresh={refresh}
              />
            )}
            {tab === "Knowledge" && <ActionStatus feedback={uploadFeedback}>
              {uploadFeedback.result?.kind === "warning" && <Button variant="outline" onClick={() => void uploadFeedback.run("refresh", async () => { await refresh(); return { kind: "success", message: "Files refreshed." }; }, { errorMessage: "Files could not refresh. Check the stored file before uploading it again." })}>Retry refresh</Button>}
            </ActionStatus>}
            {(tab === "Action board" || tab === "Actions") && data && <ActionBoard key={tab === "Actions" ? groupId : "organization"} data={data} groupId={tab === "Actions" ? groupId : undefined} onRefresh={refresh} onOpenRun={(groupId,runId)=>go({groupId,view:"Runs",runId,agentId:null})}/>}
            {["Profile", "User settings", "Workspace settings"].includes(tab) && <section className="user-settings-shell" aria-label="User settings">
              <header className="settings-shell-heading"><h1>User settings</h1><nav className="settings-tabs" aria-label="User settings sections">
                <Button variant={tab === "Profile" ? "secondary" : "ghost"} aria-current={tab === "Profile" ? "page" : undefined} onClick={()=>go({view:"Profile",agentId:null,runId:null})}><UserRound size={16}/>Profile</Button>
                <Button variant={tab === "User settings" ? "secondary" : "ghost"} aria-current={tab === "User settings" ? "page" : undefined} onClick={()=>go({view:"User settings",agentId:null,runId:null})}><Server size={16}/>Runtime</Button>
                <Button variant={tab === "Workspace settings" ? "secondary" : "ghost"} aria-current={tab === "Workspace settings" ? "page" : undefined} onClick={()=>go({view:"Workspace settings",agentId:null,runId:null})}><Building2 size={16}/>Workspace</Button>
              </nav></header>
            {tab === "Profile" && (
              <section className="user-settings">
                <div className="settings-page">
                  <header className="settings-page-heading">
                    <p className="settings-kicker">ACCOUNT</p>
                    <h1>Profile</h1>
                    <p>Your signed-in account and workspace access.</p>
                  </header>
                  <section className="settings-card">
                    <div className="settings-section-title">
                      <UserRound size={20} />
                      <h2>{displayName || user}</h2>
                    </div>
                    <form
                      className="form-stack profile-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void accountProfileFeedback.run(
                          "save-profile",
                          async () => {
                            const hasControl = Array.from(displayNameDraft).some(c => {
                              const code = c.charCodeAt(0);
                              return code < 32 || (code >= 127 && code <= 159);
                            });
                            if (hasControl) {
                              return { kind: "error", message: "Display name cannot contain control characters." };
                            }
                            const trimmed = displayNameDraft.trim();
                            if (Array.from(trimmed).length > 64) {
                              return { kind: "error", message: "Display name cannot exceed 64 characters." };
                            }
                            const payload = { display_name: trimmed === "" ? null : trimmed };
                            const res = await put<{ user: string; display_name: string | null }>("/me/profile", payload);
                            if (!activeApp.current) return;
                            onDisplayNameChange?.(res.display_name);
                            setDisplayNameDraft(res.display_name ?? "");
                            return { kind: "success", message: "Profile saved." };
                          },
                          { errorMessage: "Could not save profile. Your draft has been kept." }
                        );
                      }}
                    >
                      <div className="form-field">
                        <Label htmlFor="account-display-name">Display name</Label>
                        <Input
                          id="account-display-name"
                          name="display_name"
                          placeholder={user}
                          value={displayNameDraft}
                          onChange={(e) => setDisplayNameDraft(e.target.value)}
                          disabled={accountProfileFeedback.pending !== null}
                        />
                        <p className="hint">Plain text up to 64 characters. Leave blank to use your account username.</p>
                      </div>
                      <div className="form-actions">
                        <Button
                          type="submit"
                          disabled={accountProfileFeedback.pending !== null || displayNameDraft === (displayName ?? "")}
                        >
                          <PendingIcon pending={accountProfileFeedback.pending !== null} />
                          Save profile
                        </Button>
                      </div>
                      <ActionStatus feedback={accountProfileFeedback}>
                        {accountProfileFeedback.result?.kind === "error" && (
                          <Button
                            variant="outline"
                            type="button"
                            disabled={accountProfileFeedback.pending !== null}
                            onClick={() =>
                              void accountProfileFeedback.run(
                                "check-profile",
                                async () => {
                                  const me = await api<{ user: string; display_name?: string | null }>("/me");
                                  if (!activeApp.current) return;
                                  onDisplayNameChange?.(me.display_name ?? null);
                                  const savedName = me.display_name ?? "";
                                  const isMatching = savedName === displayNameDraft.trim();
                                  return {
                                    kind: "success",
                                    message: isMatching
                                      ? `Saved display name matches your draft (${savedName || "account default"}).`
                                      : `Saved display name is: "${savedName || "account default"}". Your unsaved draft "${displayNameDraft}" is retained.`,
                                  };
                                },
                                { errorMessage: "Could not check saved profile." }
                              )
                            }
                          >
                            Check saved profile
                          </Button>
                        )}
                      </ActionStatus>
                    </form>
                    <dl className="profile-details">
                      <dt>Account</dt>
                      <dd>{user === "owner" ? "Platform administrator" : "Matrix account"}</dd>
                      <dt>Username</dt>
                      <dd>{user}</dd>
                      <dt>Workspace</dt>
                      <dd>{workspaceName}</dd>
                      <dt>Role</dt>
                      <dd>{role === "owner" ? "Owner" : "Member"}</dd>
                    </dl>
                  </section>
                </div>
              </section>
            )}
            {tab === "Workspace settings" && <section className="user-settings"><div className="settings-page"><header className="settings-page-heading"><p className="settings-kicker">SETTINGS</p><h1>Workspace</h1><p>Manage your workspace, people, and their access.</p></header>{workspaceSettings}</div></section>}
            {tab === "User settings" && <UserSettings role={role} user={user} controllerAccess={controllerAccess} workstations={data?.workstations ?? []} onRefresh={refresh} enrollmentToken={enrollmentToken} onEnrollmentTokenChange={setEnrollmentToken}/>}
            </section>}
            {tab === "Structure" && group?.project && data && <div className="project-structure-view">{projectTeamOpen && <ProjectTeam key={`${group.id}:${JSON.stringify(group.project.members)}`} group={group} agents={data.agents} onSaved={refresh} onClose={() => setProjectTeamOpen(false)} onAdd={() => { setNewAgentProject(groupId); setNewAgent(true); }}/>}<Suspense fallback={<div className="empty-state">Opening project structure…</div>}><OrganizationChart key={groupId} workstations={data.workstations ?? []}
              projectName={group.name} layoutPath={`/organization/layout?group_id=${encodeURIComponent(groupId)}`}
              agents={data.agents.filter(a=>group.project!.members.some(m=>m.agent_id===a.id)).map(a=>({...a,reports_to:group.project!.members.find(m=>m.agent_id===a.id)?.manager_id??null,workdir:group.project!.workdir}))}
              connections={Object.fromEntries(group.project.members.map(m=>[m.agent_id,data.project_connections?.[groupId]]))} savedLayout={data.project_layouts?.[groupId]??{}}
              onDeletedAgents={()=>setProjectTeamOpen(true)} selected={selectedAgent} onSelect={id => go({ agentId: id, section: "Profile", runId: null })}
              onAdd={()=>{setNewAgentProject(groupId);setNewAgent(true);}}/></Suspense></div>}
            {(tab === "Organization" || tab === "Live Preview") && (
              <Suspense
                fallback={
                  <div className="empty-state">Opening organization…</div>
                }
              >
                <OrganizationChart
                  workstations={data?.workstations ?? []}
                  agents={(data?.agents ?? []).map(a=>a.project_id?{...a,workdir:data?.groups.find(g=>g.id===a.project_id)?.project?.workdir??a.workdir}:a)}
                  connections={data?.connections ?? {}}
                  savedLayout={data?.organization_layout ?? {}}
                  onDeletedAgents={() => setDeletedAgentsOpen(true)}
                  selected={selectedAgent}
                  onSelect={(id) => {
                    setSelectedAgent(id);
                  }}
                  onAdd={() => { setNewAgentProject(""); setNewAgent(true); }}
                  onLivePreview={() => go({ view: "Live Preview", agentId: null, runId: null, cockpitGroupId: null })}
                />
              </Suspense>
            )}
            {tab === "Live Preview" && <Suspense fallback={<div className="empty-state" role="status">Opening live preview…</div>}>
              <LivePreview workspaceId={workspaceId} workspaceName={workspaceName} role={role}
                groupId={route.cockpitGroupId} agents={organizationAgents} groups={data?.groups ?? []} runs={data?.runs ?? []}
                onFilter={(cockpitGroupId) => go({ cockpitGroupId })}
                onBack={() => go({ view: "Organization", agentId: null, runId: null })}
                onOpenAgent={setSelectedAgent} onRefresh={refresh}/>
            </Suspense>}
          </main>
        </Panel>
        {!mobile && (agent || selectedRun || preview) && (
          <Separator
            className="panel-separator"
            aria-label={preview ? "Resize Markdown preview" : "Resize agent configuration"}
          />
        )}
        {(agent || selectedRun || preview) && (
          <Panel
            id="inspector"
            defaultSize={mobile ? "100%" : data?.panel_sizes.inspector ?? (preview ? 560 : 370)}
            minSize={mobile ? "100%" : 300}
            maxSize={mobile ? "100%" : 900}
          >
            {preview && <MarkdownPreview key={preview.url} file={preview} onClose={() => openPreview(null)} onPreview={openPreview}
              onAddToKnowledge={addReportToKnowledge} onRefresh={refresh} artifacts={(data?.artifacts ?? []).filter((file) => file.group_id === groupId)}
              groupName={group?.name ?? "this group"} readOnly={groupClosed || role !== "owner"}
              readOnlyReason={groupClosed ? "Restore this group to save documents or add knowledge." : "Workspace owner access is required to save documents or add knowledge."} />}
            {agent && !preview && (
              <AgentInspector
                controllerAccess={controllerAccess}
                key={agent.id}
                agent={agent}
                workstations={data?.workstations ?? []}
                connection={data?.connections?.[agent.id]}
                groups={data?.groups ?? []}
                runs={data?.runs ?? []}
                agents={data?.agents ?? []}
                section={route.section}
                onSectionChange={(section) => go({ section })}
                onClose={() => tab === "Structure" ? go({ agentId: null }) : setSelectedAgent(null)}
                onSaved={refresh}
                perform={perform}
              />
            )}
            {selectedRun && !preview && (
              <aside className="inspector">
                <div className="inspector-heading">
                  <strong>Execution evidence</strong>
                  <button
                    aria-label="Close run details"
                    onClick={() => setSelectedRun(null)}
                  >
                    <PanelRightClose size={18} />
                  </button>
                </div>
                <RunInspector
                  run={
                    data?.runs.find((r) => r.id === selectedRun.id) ??
                    selectedRun
                  }
                  events={runEvents}
                  activityUnavailable={runEventsFailure === selectedRun.id}
                  questions={(data?.questions ?? []).filter(q => q.run_id === selectedRun.id)}
                  onRefresh={refresh}
                  onCancel={() =>
                    void perform(async () => {
                      await post(`/runs/${selectedRun.id}/cancel`);
                      await refresh();
                    })
                  }
                />
              </aside>
            )}
          </Panel>
        )}
      </PanelGroup>
      {mobile && <Dialog open={mobileNavigationOpen} onOpenChange={setMobileNavigationOpen}>
        <DialogContent className="mobile-navigation" style={{ translate: "none" }} showCloseButton={false}>
          <DialogHeader className="sr-only"><DialogTitle>Workspace navigation</DialogTitle><DialogDescription>Your groups and organization.</DialogDescription></DialogHeader>
          <button className="mobile-navigation-close" aria-label="Hide navigation" onClick={() => setMobileNavigationOpen(false)}><PanelLeftClose size={20} /></button>
          {navigation}
        </DialogContent>
      </Dialog>}
      <ArchivedGroups open={archiveOpen} onClose={() => setArchiveOpen(false)} groups={data?.groups ?? []}
        onOpen={(id) => go({ groupId: id, view: "Chat", agentId: null, runId: null })} onRefresh={refresh} />
      <input
        ref={uploadRef}
        className="hidden"
        type="file"
        multiple
        aria-label="Upload attachment"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          void (async () => {
            for (const file of files) await upload(file);
          })();
          e.target.value = "";
        }}
      />
      <Dialog open={deletedAgentsOpen} onOpenChange={setDeletedAgentsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deleted agents</DialogTitle>
            <DialogDescription>
              Restore an agent with its saved profile and files. Restored agents
              start disabled.
            </DialogDescription>
          </DialogHeader>
          <div className="session-list">
            {data?.deleted_agents.map((deleted) => (
              <div key={deleted.id}>
                <strong>{deleted.name}</strong>
                <p>{deleted.role}</p>
                <Button
                  variant="outline"
                  onClick={() =>
                    void perform(async () => {
                      await post(`/agents/${deleted.id}/restore`);
                      await refresh();
                    })
                  }
                >
                  Restore {deleted.name}
                </Button>
              </div>
            ))}
            {!data?.deleted_agents.length && <p>No deleted agents.</p>}
          </div>
        </DialogContent>
      </Dialog>
      {newAgent && <NewAgentDialog agents={organizationAgents} groups={data?.groups ?? []} projectId={newAgentProject}
        controllerAccess={controllerAccess} workstations={data?.workstations ?? []} onClose={() => setNewAgent(false)}
        getNavigationLifetime={() => navLifetimeRef.current}
        onCreated={async (agent, submitLifetime) => {
          await refresh();
          setNewAgent(false);
          if (submitLifetime !== undefined && navLifetimeRef.current !== submitLifetime) {
            return;
          }
          if (agent.project_id) {
            setProjectTeamOpen(true);
            go({ groupId: agent.project_id, view: "Structure", agentId: agent.id, section: "Profile", runId: null });
          } else {
            setSelectedAgent(agent.id);
          }
        }} />}
      {groupEditor && <GroupDialog controllerAccess={controllerAccess} key={`${groupEditor.id}:${groupEditor.archived_at}:${groupEditor.deleted_at}`}
        group={data?.groups.find((g) => g.id === groupEditor.id) ?? groupEditor}
        agents={organizationAgents}
        workstations={data?.workstations ?? []}
        onClose={() => setGroupEditor(null)}
        onSaved={async (saved) => {
          await refresh();
          go(saved.deleted_at ? { view: "Organization", agentId: null, runId: null } : { groupId: saved.id, view: saved.project && !groupEditor.id ? "Structure" : "Chat", agentId: null, runId: null });
          if (saved.project && !groupEditor.id) setProjectTeamOpen(true);
          setReply(null); setAttachments([]);
        }} />}
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="search-dialog">
          <DialogHeader>
            <DialogTitle>Search #{group?.name}</DialogTitle>
            <DialogDescription>
              Find earlier messages or indexed documents and images.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void perform(async () =>
                setSearchResult(
                  await api<SearchResult>(
                    `/search?group_id=${encodeURIComponent(groupId)}&q=${encodeURIComponent(searchQuery)}&semantic=${semantic}&media=${searchMedia}`,
                  ),
                ),
              );
            }}
            className="form-stack"
          >
            <Input
              aria-label="Search query"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="What are you looking for?"
              required
            />
            <label className="check-row">
              <input
                type="checkbox"
                checked={semantic}
                onChange={(e) => setSemantic(e.target.checked)}
              />{" "}
              Semantic document & image search
            </label>
            {semantic && (
              <ValuePicker
                aria-label="Search file type"
                value={searchMedia}
                onValueChange={setSearchMedia}
                options={[{ value: "documents", label: "Documents" }, { value: "images", label: "Images" }]}
              />
            )}
            <Button type="submit">
              <Search size={15} /> Search
            </Button>
          </form>
          <div className="search-results">
            {searchResult?.messages?.map((m) => (
              <article key={m.id}>
                <small>{time(m.created_at)}</small>
                <p>{m.body}</p>
              </article>
            ))}
            {searchResult?.artifacts?.map((a) => (
              <a
                key={a.id}
                href={`/api/artifacts/${a.id}`}
                target="_blank"
                rel="noreferrer"
              >
                <strong>{a.name}</strong>
                <p>{a.snippet}</p>
                <small>CLIP similarity · source file</small>
              </a>
            ))}
            {searchResult &&
              !(
                searchResult.messages?.length || searchResult.artifacts?.length
              ) && <p>No results in this group.</p>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Empty({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="empty-state">
      {icon}
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

function RunInspector({
  run,
  events,
  activityUnavailable,
  onCancel,
  questions,
  onRefresh,
}: {
  run: Run;
  events: Event[];
  activityUnavailable: boolean;
  onCancel: () => void;
  questions: QuestionRequest[];
  onRefresh: () => Promise<void>;
}) {
  return (
    <div className="inspector-body">
      {activityUnavailable && <p role="status">Run activity could not refresh. Previously loaded activity is retained.</p>}
      <Badge variant="outline">{run.status}</Badge>
      <h2>{run.profile.name}</h2>
      {run.profile.position && <p className="muted">{run.profile.position}</p>}
      {questions.map(q => <QuestionCard key={q.id} id={q.id} question={q} onRefresh={onRefresh} />)}
      <dl className="details">
        <dt>Working directory</dt>
        <dd>{run.cwd}</dd>
        <dt>Process</dt>
        <dd>
          PID {run.pid ?? "not started"} · exit {run.exit_code ?? "pending"}
        </dd>
        <dt>Profile revision</dt>
        <dd>{run.profile.revision}</dd>
        <dt>Provider session</dt>
        <dd>{run.native_session_id ?? "Not assigned yet"}</dd>
        <dt>Started</dt>
        <dd>{run.started_at ?? "Queued"}</dd>
        <dt>Executable</dt>
        <dd>{run.executable || "Pending launch"}</dd>
      </dl>
      {active(run) && (
        <Button variant="outline" onClick={onCancel}>
          <Square size={12} /> Stop run
        </Button>
      )}
      {run.error && <p className="error">{run.error}</p>}
      {run.artifact_errors.length > 0 && <section className="run-document-errors" aria-label="Document capture issues">
        <h3>Document capture issues</h3>
        <p className="hint">Some linked documents could not be saved. Open a document link to recover its current version when available.</p>
        <ul>{run.artifact_errors.map((failure) => <li key={failure.path}><code>{failure.path}</code><p className="error">{failure.error}</p></li>)}</ul>
      </section>}
      <details>
        <summary>Launch arguments</summary>
        <pre>{run.arguments.join("\n")}</pre>
      </details>
      {run.usage && (
        <details>
          <summary>Reported usage</summary>
          <pre>{JSON.stringify(run.usage, null, 2)}</pre>
        </details>
      )}
      {run.organization_context && (
        <details>
          <summary>Organization context supplied to this run</summary>
          <OrganizationRelationships context={run.organization_context} />
          <pre>{JSON.stringify(run.organization_context, null, 2)}</pre>
        </details>
      )}
      <h3>Provider events</h3>
      <div className="event-log">
        {events
          .filter((e) => e.kind === "run.output")
          .map((e) => (
            <pre key={String(e.seq)}>
              {typeof e.payload === "object" &&
              e.payload !== null &&
              "line" in e.payload
                ? String(e.payload.line)
                : JSON.stringify(e.payload)}
            </pre>
          ))}
      </div>
    </div>
  );
}

function canManage(candidate: Agent, agent: Agent, agents: Agent[]) {
  const seen = new Set([agent.id]);
  let current: Agent | undefined = candidate;
  while (current) {
    if (seen.has(current.id)) return false;
    seen.add(current.id);
    current = agents.find((a) => a.id === current?.reports_to);
  }
  return true;
}

function OrganizationRelationships({
  context,
}: {
  context: OrganizationContext;
}) {
  function person(id: string) {
    if (id === "owner") return `${context.owner_name} (Owner)`;
    const member = context.members.find((m) => m.id === id);
    return member
      ? `${member.name}${member.position ? ` · ${member.position}` : ""}`
      : id;
  }
  const names = (ids: string[]) =>
    ids.length ? ids.map(person).join(", ") : "None";
  return (
    <dl
      className="details organization-relationships"
      aria-label="Organization relationships"
    >
      <dt>Reports to</dt>
      <dd>{person(context.manager_id)}</dd>
      <dt>Management chain</dt>
      <dd>{context.reporting_chain.map(person).join(" → ")}</dd>
      <dt>Direct reports</dt>
      <dd>{names(context.direct_report_ids)}</dd>
      <dt>Team, including indirect reports</dt>
      <dd>{names(context.team_member_ids)}</dd>
      <dt>Peers reporting to the same manager</dt>
      <dd>{names(context.peer_ids)}</dd>
      <dt>Organization</dt>
      <dd>
        {context.members.length} agents, with positions, reporting lines and
        available access
      </dd>
    </dl>
  );
}

function editableProfile(agent: Agent): Agent {
  return { ...agent, instructions: [...new Set([agent.instructions, agent.agents_md].filter(text => text.trim()))].join("\n\n"), agents_md: "" };
}

function AgentInspector({
  controllerAccess,
  workstations,
  connection,
  agent,
  agents,
  groups,
  runs,
  section,
  onSectionChange,
  onClose,
  onSaved,
  perform,
}: {
  connection?: Connection;
  controllerAccess: boolean;
  workstations: Workstation[];
  agent: Agent;
  agents: Agent[];
  groups: Group[];
  runs: Run[];
  section: Section;
  onSectionChange: (section: Section) => void;
  onClose: () => void;
  onSaved: () => Promise<void>;
  perform: (work: () => Promise<void>) => Promise<void>;
}) {
  const [edited, setEdited] = useState(() => editableProfile(agent));
  const [baseline, setBaseline] = useState(() => editableProfile(agent));
  const [legacyPending, setLegacyPending] = useState(() => Boolean(agent.agents_md.trim()));
  const accepted = useRef(baseline);
  const draftProfile = useRef(edited);
  useLayoutEffect(() => { draftProfile.current = edited; }, [edited]);
  const feedback = useActionFeedback(`agent:${agent.id}`, section);
  const [needsReview, setNeedsReview] = useState(false);
  const [retrySave, setRetrySave] = useState(false);
  const [reviewed, setReviewed] = useState<Agent | null>(null);
  const dirty = JSON.stringify(edited) !== JSON.stringify(baseline) || legacyPending;
  const externalChange = agent.revision > baseline.revision;
  const profileLocked = Boolean(feedback.pending);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [folderPicker, setFolderPicker] = useState(false);
  const projectWorkdir = groups.find(g=>g.id===agent.project_id)?.project?.workdir;
  const effectiveAgent = projectWorkdir ? {...agent,workdir:projectWorkdir} : agent;
  const [path, setPath] = useState(agent.workdir?.path ?? "");
  const [sshHost, setSshHost] = useState(agent.workdir?.ssh_host ?? "");
  const [selectedRuntimeId, setRuntimeId] = useState(projectWorkdir?.runtime_id ?? agent.runtime_id ?? agent.workdir?.runtime_id ?? "");
  const runtimeId = projectWorkdir ? projectWorkdir.runtime_id ?? "" : selectedRuntimeId;
  const [runtimes, setRuntimes] = useState<RegisteredRuntime[]>([]);
  const remote = Boolean(sshHost);
  const [probe, setProbe] = useState("");
  const [refreshTarget, setRefreshTarget] = useState<"profile" | "script" | null>(null);
  const [validatingWorkdir, setValidatingWorkdir] = useState(false);
  const currentWorkdirKey = `${path}::${runtimeId}::${remote ? sshHost.trim() : ""}::${edited.harness}`;
  const [workdirDiagnosis, setWorkdirDiagnosis] = useState<{
    key: string;
    kind: "success" | "error";
    origin?: "validate" | "attach";
    gitStatus?: string;
    message?: string;
  } | null>(null);
  const activeWorkdirDiagnosis = workdirDiagnosis?.key === currentWorkdirKey ? workdirDiagnosis : null;
  const [filePath, setFilePath] = useState("");
  const [fileView, setFileView] = useState<FileView | null>(null);
  const [scriptScope, setScriptScope] = useState(false);
  const [scriptName, setScriptName] = useState("");
  const [scriptContent, setScriptContent] = useState("");
  const [sessionList, setSessionList] = useState<Session[]>([]);
  const [revisionList, setRevisionList] = useState<Agent[]>([]);
  const [models, setModels] = useState<CodexSettings | null>(null);
  const [organization, setOrganization] = useState<OrganizationContext | null>(
    null,
  );
  const loadOrganization = useCallback(
    async () =>
      setOrganization(
        await api<OrganizationContext>(
          `/agents/${agent.id}/organization-context`,
        ),
      ),
    [agent.id],
  );
  const [modelError, setModelError] = useState("");
  const catalogHost = effectiveAgent.workdir?.ssh_host;
  const modelsRequest = useRef(0);
  const loadModels = useCallback(() => {
    const request = ++modelsRequest.current;
    setModels(null);
    setModelError("");
    if (!runtimeId && !controllerAccess) { setModels(null); setModelError("Choose a runtime to load its model catalog."); return Promise.resolve(); }
    const context = agent.project_id ? "" : runtimeId ? `&runtime_id=${encodeURIComponent(runtimeId)}` : catalogHost ? `&ssh_host=${encodeURIComponent(catalogHost)}` : "";
    return api<CodexSettings>(`/harness/settings?harness=${edited.harness}&agent_id=${encodeURIComponent(agent.id)}${context}`).then(settings => {
      if (request === modelsRequest.current) { setModels(settings); setModelError(""); }
    }, (error: unknown) => {
      if (request === modelsRequest.current) setModelError(error instanceof Error ? error.message : String(error));
    });
  }, [catalogHost, runtimeId, edited.harness, agent.id, agent.project_id, controllerAccess]);
  useEffect(() => {
    if (section !== "Profile") return;
    let request = modelsRequest.current;
    const refresh = () => { void loadModels(); request = modelsRequest.current; };
    refresh();
    window.addEventListener("focus", refresh);
    return () => { window.removeEventListener("focus", refresh); if (modelsRequest.current === request) modelsRequest.current = request + 1; };
  }, [loadModels, section]);
  const selectedModel = models?.models.find(
    (m) => m.slug === (edited.model || models.model),
  );
  const inheritedReasoning =
    selectedModel?.slug === models?.model
      ? models?.reasoning
      : selectedModel?.default_reasoning_level;
  const adoptProfile = useCallback((value: Agent) => {
    const next = editableProfile(value);
    accepted.current = next;
    setBaseline(next); setEdited(next); setLegacyPending(Boolean(value.agents_md.trim()));
    setPath(next.workdir?.path ?? ""); setSshHost(next.workdir?.ssh_host ?? "");
    setRuntimeId(projectWorkdir?.runtime_id ?? next.runtime_id ?? next.workdir?.runtime_id ?? "");
    setProbe(""); setNeedsReview(false); setReviewed(null); setRetrySave(false); setRefreshTarget(null);
  }, [projectWorkdir?.runtime_id]);
  useEffect(() => {
    if (agent.revision <= accepted.current.revision || feedback.pending || needsReview) return;
    if (JSON.stringify(draftProfile.current) === JSON.stringify(accepted.current)) adoptProfile(agent);
  }, [agent, feedback.pending, needsReview, adoptProfile]);
  const resultKind = feedback.result?.kind;
  const clearFeedback = feedback.clear;
  useEffect(() => {
    if (dirty && resultKind === "success") clearFeedback();
  }, [dirty, resultKind, clearFeedback]);
  async function persistProfile(next: Agent, action: string): Promise<ActionResult> {
      let result: Agent;
      try { result = await put<Agent>(`/agents/${agent.id}`, next); }
      catch (error) {
        if (error instanceof ApiFailure && error.message === "Profile changed since it was opened; reload before saving") {
          setNeedsReview(true);
          return { kind: "error", message: "This profile changed elsewhere. Your draft is kept. Check the saved profile before saving again." };
        }
        if (error instanceof ApiFailure && /^Timeout must be/.test(error.message)) return { kind: "error", message: "Run timeout must be between 10 and 14400 seconds. Your draft is kept." };
        setNeedsReview(true);
        return { kind: "warning", message: `Save not confirmed for ${agent.name}. Your draft is kept. Check saved state before trying again; configuration files may not have been updated.` };
      }
      adoptProfile(result);
      try { await onSaved(); }
      catch {
        setRefreshTarget("profile");
        return { kind: "warning", message: `${agent.name}: configuration saved, but the view could not refresh. Retry refresh without saving again.` };
      }
      setRefreshTarget(null);
      return { kind: "success", message: action === "restore" ? `${agent.name}: configuration restored as a new revision. Applies to the next run.` : `${agent.name}: changes saved. Instructions apply to the next run.` };
  }
  async function save(next = edited, action = "save") {
    if (needsReview || externalChange) return;
    await feedback.run(action, () => persistProfile(next, action));
  }
  async function checkSavedProfile() {
    await feedback.run("review", async () => {
      const state = await api<StateView>("/state");
      const current = state.agents.find(value => value.id === agent.id);
      if (!current) return { kind: "error", message: "The agent is no longer available. Your draft is kept." };
      setReviewed(current);
      return { kind: "warning", message: `Saved revision ${current.revision} is available for review. Your draft is kept; reading stored data does not confirm configuration-file updates.` };
    }, { errorMessage: "Could not read the saved profile. Your draft is kept. Try checking again." });
  }
  const loadFile = useCallback(
    async (relative: string, scripts: boolean) => {
      setFileView(
        await api<FileView>(
          `/agents/${agent.id}/files?path=${encodeURIComponent(relative)}&scope=${scripts ? "scripts" : "workdir"}`,
        ),
      );
      setFilePath(relative);
    },
    [agent.id],
  );
  useEffect(() => {
    if (section === "Profile") void perform(loadOrganization);
    if (section === "Sessions")
      void perform(async () =>
        setSessionList(
          (await api<Session[]>("/sessions")).filter(
            (s) => s.agent_id === agent.id,
          ),
        ),
      );
    if (section === "Code") void perform(() => loadFile("", scriptScope));
    if (section === "History")
      void perform(async () =>
        setRevisionList(await api<Agent[]>(`/agents/${agent.id}/revisions`)),
      );
  }, [
    section,
    agent.id,
    agent.revision,
    scriptScope,
    perform,
    loadFile,
    loadOrganization,
  ]);
  return (
    <aside className="inspector">
      <div className="inspector-heading">
        <strong>Agent configuration</strong>
        <button aria-label="Close agent settings" onClick={onClose}>
          <PanelRightClose size={18} />
        </button>
      </div>
      <div className="agent-summary">
        <Avatar agent={agent} />
        <div>
          <h2>{agent.name}</h2>
          <span>
            {agent.position || agent.role || "Set a position in Profile"}
          </span>
        </div>
        <Badge variant="outline">
          {agent.enabled ? "Enabled" : "Disabled"}
        </Badge>
      </div>
      <nav className="inspector-tabs">
        {sections.map((s) => (
          <button
            className={section === s ? "active" : ""}
            key={s}
            onClick={() => onSectionChange(s)}
          >
            {s}
          </button>
        ))}
      </nav>
      <div className="inspector-body">
        <p className="project-kind">{agent.project_id ? "Project-specific agent" : "Organization agent"}</p>
        {projectWorkdir && <p className="hint">Runs, terminal and skills use this project's workdir: <code>{projectWorkdir.path}</code>. <a href={`/projects/${agent.project_id}/structure`}>Open project structure</a></p>}
        {effectiveAgent.workdir?.ssh_host && <WorkstationStatus host={sshWorkstationLabel(effectiveAgent.workdir.ssh_host, workstations)} connection={connection} />}
        {(externalChange || needsReview) && <div className="profile-conflict">
          <p role={externalChange && !needsReview && !profileLocked ? "alert" : undefined}>{externalChange ? "This profile has a newer saved revision. Your draft has been kept." : "The last save could not be confirmed. Check saved state before another save."}</p>
          <Button variant="outline" disabled={profileLocked} aria-busy={feedback.isPending("review")} onClick={() => void checkSavedProfile()}><PendingIcon pending={feedback.isPending("review")} />Check saved profile</Button>
          {reviewed && <><details><summary>Saved revision {reviewed.revision}</summary><p>{reviewed.name} · {reviewed.position}</p><pre>{editableProfile(reviewed).instructions}</pre></details>
            <Button variant="outline" disabled={profileLocked} onClick={() => { adoptProfile(reviewed); feedback.clear(); }}>Discard draft and load saved profile</Button>
            <Button variant="outline" disabled={profileLocked} onClick={() => { const nextBaseline = editableProfile(reviewed); accepted.current = nextBaseline; setBaseline(nextBaseline); setEdited(current => ({ ...current, revision: reviewed.revision })); setRetrySave(needsReview); setNeedsReview(false); setReviewed(null); feedback.clear(); }}>Keep my draft using saved revision</Button>
            <p className="hint">Keeping your draft lets the next explicit save replace the reviewed configuration. It does not retry the previous save.</p></>}
        </div>}
        {section === "Profile" && (
          <div className="form-stack"><fieldset className="form-stack profile-lock" disabled={profileLocked}>
            <Label htmlFor="profile-name">Display name</Label>
            <Input
              id="profile-name"
              value={edited.name}
              onChange={(e) => setEdited({ ...edited, name: e.target.value })}
            />
            <Label htmlFor="profile-position">Position</Label>
            <Input
              id="profile-position"
              value={edited.position}
              placeholder="Software Engineer"
              maxLength={120}
              onChange={(e) =>
                setEdited({ ...edited, position: e.target.value })
              }
            />
            <Label htmlFor="profile-role">Role</Label>
            <Textarea
              id="profile-role"
              value={edited.role}
              placeholder="Responsibilities and scope of this agent"
              onChange={(e) => setEdited({ ...edited, role: e.target.value })}
            />
            <Label htmlFor="profile-manager">Reports to</Label>
            <ValuePicker searchable
              id="profile-manager"
              disabled={profileLocked || !!agent.project_id}
              value={edited.reports_to ?? ""}
              onValueChange={(value) =>
                setEdited({ ...edited, reports_to: value || null })
              }
              options={[{ value: "", label: "Organization owner" }, ...agents.filter(a => canManage(a, agent, agents)).map(a => ({ value: a.id, label: a.name }))]}
            />
            <details className="organization-knowledge">
              <summary>Organization knowledge</summary>
              <p className="hint">
                Every run receives the saved organization structure, including
                direct messages and delegated tasks.
              </p>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void perform(loadOrganization)}
              >
                Refresh relationships
              </Button>
              {organization && (
                <OrganizationRelationships context={organization} />
              )}
            </details>
            <RuntimeSelect value={runtimeId} onLoaded={setRuntimes} disabled={Boolean(projectWorkdir)} allowController={controllerAccess}
              onChange={id => {
                setRuntimeId(id); setSshHost(""); setPath(""); setProbe(""); setModels(null); setModelError("");
                const available = availableHarnesses(runtimes.find(runtime => runtime.id === id));
                setEdited({...edited, runtime_id: id || undefined, workdir: null, model: "", reasoning: "", harness: available.includes(edited.harness) ? edited.harness : available[0] ?? edited.harness});
              }} />
            {projectWorkdir && <p className="hint">This project's runtime is configured in project settings.</p>}
            {runtimeId !== (agent.runtime_id ?? agent.workdir?.runtime_id ?? "") && !projectWorkdir && <p className="hint">Save this runtime, then attach its folder in Workdir before running the agent.</p>}
            <HarnessSelect id="profile-harness" value={edited.harness} runtimeId={runtimeId} runtimes={runtimes} allowController={controllerAccess} onChange={harness => {
              setModels(null); setModelError(""); setProbe("");
              setEdited({...edited, harness, model:"", reasoning:"", permission: harness === "opencode" ? "danger-full-access" : edited.permission});
            }} />
            <p className="hint">Each harness keeps its own resumable sessions. Switching back resumes that harness’s conversation.</p>
            <Label htmlFor="profile-model">Model</Label>
            <ValuePicker searchable
              id="profile-model"
              value={edited.model}
              disabled={profileLocked || !models}
              onValueChange={(value) =>
                setEdited({ ...edited, model: value, reasoning: "" })
              }
              options={[
                { value: "", label: models
                  ? `Use ${harnessNames[edited.harness]} setting (${models.model})`
                  : modelError ? "Model catalog unavailable" : "Loading models…" },
                ...(edited.model && !models?.models.some(m => m.slug === edited.model) ? [{ value: edited.model, label: `${edited.model} (unavailable)`, disabled: true }] : []),
                ...(models?.models.map(m => ({ value: m.slug, label: `${m.display_name}${edited.harness === "opencode" ? ` · ${m.slug.split("/")[0]}` : ""}` })) ?? []),
              ]}
            />
            {Boolean(selectedModel?.supported_reasoning_levels.length) && <><Label htmlFor="profile-reasoning">{edited.harness === "opencode" ? "Model variant" : "Reasoning effort"}</Label>
            <ValuePicker
              id="profile-reasoning"
              value={edited.reasoning}
              disabled={profileLocked || !selectedModel}
              onValueChange={(value) =>
                setEdited({ ...edited, reasoning: value })
              }
              options={[
                { value: "", label: inheritedReasoning
                  ? `Use default (${inheritedReasoning})`
                  : "Use model default" },
                ...(edited.reasoning && !selectedModel?.supported_reasoning_levels.some(r => r.effort === edited.reasoning) ? [{ value: edited.reasoning, label: `${edited.reasoning} (unavailable)`, disabled: true }] : []),
                ...(selectedModel?.supported_reasoning_levels.map(r => ({ value: r.effort, label: r.effort.charAt(0).toUpperCase() + r.effort.slice(1), title: r.description })) ?? []),
              ]}
            />
            </>}
            <div className="model-source">
              <span>{edited.harness === "opencode" ? "From your OpenCode CLI · refresh after adding providers or models" : `From your ${harnessNames[edited.harness]} settings`}</span>
              <button
                type="button"
                onClick={() => void loadModels()}
                aria-label="Refresh models"
              >
                <RefreshCw size={14} /> Refresh
              </button>
            </div>
            {modelError && (
              <p className="error" role="alert">
                {modelError}
              </p>
            )}
            <Label htmlFor="profile-timeout">Run timeout (seconds)</Label>
            <Input
              id="profile-timeout"
              type="number"
              min={10}
              max={14400}
              value={edited.timeout_seconds}
              onChange={(e) =>
                setEdited({
                  ...edited,
                  timeout_seconds: Number(e.target.value),
                })
              }
            />
            <Label htmlFor="profile-color">Avatar color</Label>
            <input
              id="profile-color"
              type="color"
              value={edited.color}
              onChange={(e) => setEdited({ ...edited, color: e.target.value })}
            />
            <label className="check-row">
              <input
                type="checkbox"
                checked={edited.enabled}
                onChange={(e) =>
                  setEdited({ ...edited, enabled: e.target.checked })
                }
              />{" "}
              Agent enabled
            </label>
            </fieldset><Button
              variant="outline"
              onClick={() =>
                void perform(async () => {
                  const p = await post<{ message: string }>(
                    `/agents/${agent.id}/probe`,
                  );
                  setProbe(p.message);
                })
              }
            >
              <ShieldCheck size={15} /> Check {harnessNames[agent.harness]} connection
            </Button>
            {probe && <p className="probe-result">{probe}</p>}
          </div>
        )}
        {section === "Workdir" && projectWorkdir && <div className="form-stack"><h3>Project workdir</h3><p>Runtime and workdir are inherited from this project.</p><code>{projectWorkdir.path}</code><a href={`/projects/${agent.project_id}/structure`}>Open project structure to manage its workdir</a></div>}
        {section === "Workdir" && !projectWorkdir && (
          <fieldset className="form-stack profile-lock" disabled={profileLocked}>
            <div className="workdir-icon">
              <FolderOpen size={26} />
            </div>
            <h3>Work in your existing codebase</h3>
            <p className="muted">
              Attach a local or remote folder. Your agent will run directly in
              that directory. Agent runs and terminal commands automatically load
              this folder’s .env file when they start. Edit the file in your
              codebase; changes apply to the next execution.
            </p>
            <p className="hint">Runtime: {runtimes.find(runtime => runtime.id === runtimeId)?.name ?? (runtimeId ? "Selected in Profile" : "Controller / SSH")}. {runtimeId ? "Uses runtime root or registered paths." : "In Docker execution, paths are Linux container paths (such as /projects/<repository> for mounted host projects)."} <button type="button" onClick={() => onSectionChange("Profile")}>Change in Profile</button></p>
            {controllerAccess && !runtimeId && <WorkstationSelect id="workstation-host" value={sshHost} workstations={workstations} onChange={host => { setSshHost(host); setPath(""); setProbe(""); }}/> }
            <Label htmlFor="workdir-path">Absolute directory path</Label>
            <Button variant="outline" disabled={!runtimeId && (!controllerAccess || (remote && !sshHost.trim()))} onClick={() => setFolderPicker(true)}>
              <FolderOpen size={16} />
              Browse folders
            </Button>
            <Input
              id="workdir-path"
              value={path}
              aria-describedby={activeWorkdirDiagnosis?.kind === "error" ? "workdir-diagnosis" : undefined}
              onChange={(e) => {
                setPath(e.target.value);
                setWorkdirDiagnosis(null);
              }}
              placeholder={remote ? "/home/you/project" : "F:\\Engineering\\my-project"}
            />
            <Button
              variant="outline"
              disabled={validatingWorkdir}
              onClick={() =>
                void (async () => {
                  setValidatingWorkdir(true);
                  try {
                    const result = await post<{
                      workspace: Workspace;
                      git_status: string;
                    }>("/workspaces/probe", {
                      path,
                      harness: edited.harness,
                      runtime_id: runtimeId || null,
                      ssh_host: remote ? sshHost.trim() : null,
                    });
                    setEdited({ ...edited, runtime_id: result.workspace.runtime_id, workdir: result.workspace });
                    setWorkdirDiagnosis({ key: currentWorkdirKey, kind: "success", origin: "validate", gitStatus: result.git_status });
                  } catch (error) {
                    setWorkdirDiagnosis({
                      key: currentWorkdirKey,
                      kind: "error",
                      origin: "validate",
                      message: error instanceof Error ? error.message : "Workdir validation failed.",
                    });
                  } finally {
                    setValidatingWorkdir(false);
                  }
                })()
              }
            >
              <FolderOpen size={15} /> Validate workdir
            </Button>
            {activeWorkdirDiagnosis?.kind === "success" && activeWorkdirDiagnosis.gitStatus && (
              <pre className="probe-result">{activeWorkdirDiagnosis.gitStatus}</pre>
            )}
            {activeWorkdirDiagnosis?.kind === "error" && activeWorkdirDiagnosis.message && (
              <p
                id="workdir-diagnosis"
                {...(activeWorkdirDiagnosis.origin === "validate" ? { role: "alert" } : {})}
                className="workdir-diagnosis error"
              >
                {activeWorkdirDiagnosis.message}
              </p>
            )}
            <Label htmlFor="workdir-access">Access mode</Label>
            <ValuePicker
              id="workdir-access"
              value={edited.permission}
              disabled={profileLocked}
              onValueChange={(value) =>
                setEdited({ ...edited, permission: value })
              }
              options={[
                { value: "read-only", label: "Read only - inspect the codebase" },
                { value: "workspace-write", label: "Workspace write - make requested changes" },
                { value: "danger-full-access", label: "YOLO - full access, no approvals" },
              ]}
            />
            {edited.harness === "opencode" && edited.permission !== "danger-full-access" && <p className="hint">OpenCode tool permissions: shell commands are disabled in restricted modes. Workspace write allows file edits inside the workdir. These controls are not an operating-system sandbox. Some free providers reject restricted runs; the selected permissions stay in effect when a run fails.</p>}
            {edited.permission === "danger-full-access" && (
              <p className="hint">
                Commands run with your account’s access, without {edited.harness === "codex" ? "the Codex sandbox or " : ""}approval prompts.
              </p>
            )}
            <Button
              onClick={() =>
                void feedback.run("attach", async () => {
                  let result: { workspace: Workspace };
                  try {
                    result = await post<{ workspace: Workspace }>(
                      "/workspaces/probe",
                      { path, harness: edited.harness, runtime_id: runtimeId || null, ssh_host: remote ? sshHost.trim() : null },
                    );
                    setWorkdirDiagnosis({ key: currentWorkdirKey, kind: "success", origin: "attach" });
                  } catch (error) {
                    const probeDetail = error instanceof Error ? error.message : "Workdir probe failed.";
                    const toastMessage = `Attach failed: could not access directory ${path || "path"}.`;
                    setWorkdirDiagnosis({
                      key: currentWorkdirKey,
                      kind: "error",
                      origin: "attach",
                      message: `Folder access probe: ${probeDetail}. Verify the path exists and is accessible to the selected runtime.`,
                    });
                    return {
                      kind: "error",
                      message: toastMessage,
                    };
                  }
                  const changedSshHost = (result.workspace.ssh_host ?? null) !== (agent.workdir?.ssh_host ?? null);
                  return persistProfile({ ...edited, runtime_id: result.workspace.runtime_id, workdir: result.workspace, ...(changedSshHost ? {model:"", reasoning:""} : {}) }, "attach");
                })
              }
              disabled={needsReview || externalChange}
              aria-busy={feedback.isPending("attach")}
            >
              <PendingIcon pending={feedback.isPending("attach")} />{feedback.isPending("attach") ? "Attaching…" : agent.workdir ? "Change workdir" : "Attach workdir"}
            </Button>
            {agent.workdir && (
              <>
                <div className="attached-path">
                  <Check size={14} />
                  <span>{agent.workdir.path}</span>
                </div>
                <Button
                  variant="ghost"
                  onClick={() =>
                    void save({ ...edited, workdir: null }, "detach")
                  }
                >
                  Detach workdir
                </Button>
              </>
            )}
            <p className="hint">
              Attaching does not copy or change files. Detaching never deletes
              your codebase. Remote native sessions stay on that workstation; chat and execution records stay under org.
            </p>
          </fieldset>
        )}
        {section === "Instructions" && (
          <fieldset className="form-stack profile-lock" disabled={profileLocked}>
            <Label htmlFor="markdown-editor">Role and task instructions</Label>
            <Textarea
              id="markdown-editor"
              className="code-editor"
              value={edited.instructions}
              onChange={(e) =>
                setEdited({
                  ...edited,
                  instructions: e.target.value,
                })
              }
            />
            <details>
              <summary>Markdown preview</summary>
              <div className="markdown">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {edited.instructions}
                </ReactMarkdown>
              </div>
            </details>
            <p className="hint">
              Applied to the next run. Existing repository AGENTS.md files
              remain unchanged.
            </p>
          </fieldset>
        )}
        {section === "Code" && (
          <div className="form-stack">
            <label className="check-row">
              <input
                type="checkbox"
                checked={scriptScope}
                onChange={(e) => setScriptScope(e.target.checked)}
              />{" "}
              Agent-owned scripts
            </label>
            <p className="hint">{fileView?.base}</p>
            {filePath && (
              <button
                className="file-back"
                onClick={() =>
                  void perform(() =>
                    loadFile(
                      filePath.split("/").slice(0, -1).join("/"),
                      scriptScope,
                    ),
                  )
                }
              >
                <ArrowLeft size={14} /> Parent folder
              </button>
            )}
            {fileView?.entries?.map((entry) => (
              <button
                className="file-entry"
                key={entry.name}
                onClick={() =>
                  void perform(() =>
                    loadFile(
                      [filePath, entry.name].filter(Boolean).join("/"),
                      scriptScope,
                    ),
                  )
                }
              >
                {entry.directory ? (
                  <FolderOpen size={15} />
                ) : (
                  <FileText size={15} />
                )}
                {entry.name}
              </button>
            ))}
            {fileView?.text !== undefined && (
              <>
                <p>{filePath}</p>
                <pre className="file-preview">{fileView.text}</pre>
              </>
            )}
            {scriptScope && (
              <>
                <Label htmlFor="script-name">Script filename</Label>
                <Input
                  id="script-name"
                  disabled={feedback.isPending("script")}
                  value={scriptName}
                  onChange={(e) => setScriptName(e.target.value)}
                  placeholder="verify.ps1"
                />
                <Textarea
                  aria-label="Script content"
                  disabled={feedback.isPending("script")}
                  className="code-editor"
                  value={scriptContent}
                  onChange={(e) => setScriptContent(e.target.value)}
                />
                <Button
                  disabled={profileLocked || !scriptName.trim()}
                  aria-busy={feedback.isPending("script")}
                  onClick={() =>
                    void feedback.run("script", async () => {
                      await put(`/agents/${agent.id}/files`, {
                        name: scriptName,
                        content: scriptContent,
                      });
                      try { await loadFile("", true); }
                      catch {
                        setRefreshTarget("script");
                        return { kind: "warning", message: `${agent.name}: script saved, but the file list could not refresh.` };
                      }
                      setRefreshTarget(null);
                      return { kind: "success", message: `${agent.name}: script saved. It has not been executed.` };
                    }, { errorMessage: `${agent.name}: script save not confirmed. Filename and content are kept; check the file before trying again.` })
                  }
                >
                  <PendingIcon pending={feedback.isPending("script")} />{feedback.isPending("script") ? "Saving script…" : "Save script"}
                </Button>
                <p className="hint">Saving does not execute the script.</p>
              </>
            )}
          </div>
        )}
        {section === "Terminal" && (
          <AgentTerminal
            key={agent.id}
            agent={effectiveAgent}
            onWorkdir={() => onSectionChange("Workdir")}
            onSkills={() => onSectionChange("Skills")}
          />
        )}
        {section === "Skills" && (
          <AgentSkills
            key={agent.id}
            agent={effectiveAgent}
            onWorkdir={() => onSectionChange("Workdir")}
            onTerminal={() => onSectionChange("Terminal")}
          />
        )}
        {section === "Sessions" && (
          <div className="session-list">
            <p className="hint">Each group and side chat has its own session for this agent. Each harness starts only when assigned work and exits when that execution finishes.</p>
            {sessionList.map((s) => (
              <div key={s.id}>
                <Badge variant="outline">
                  {s.active ? "Current" : "Reset"}
                </Badge>
                {" "}<strong>{groups.find((g) => g.id === s.group_id)?.name ?? s.group_id} · {s.side_chat_id ? `Side chat ${s.side_chat_id.slice(0, 8)}` : "Main chat"}</strong>
                <p>{harnessNames[s.harness]} · {!s.active ? "Retired" : runs.some((r) => r.session_id === s.id && ["running", "starting"].includes(r.status)) ? "Working" : runs.some((r) => r.session_id === s.id && r.status === "queued") ? "Queued" : "Idle · resumes when triggered"}</p>
                <code>{s.native_id ?? "Not started yet"}</code>
                <p>{s.workspace}</p>
                {s.active && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      void perform(async () => {
                        await post(`/sessions/${s.id}/reset`);
                        setSessionList(
                          (await api<Session[]>("/sessions")).filter(
                            (s) => s.agent_id === agent.id,
                          ),
                        );
                      })
                    }
                  >
                    <RefreshCw size={13} /> Start fresh next time
                  </Button>
                )}
              </div>
            ))}
            {!sessionList.length && (
              <p className="muted">
                A session is created when you send this agent a message.
              </p>
            )}
          </div>
        )}
        {section === "History" && (
          <div className="session-list">
            {revisionList.map((r) => (
              <div key={r.revision}>
                <strong>Revision {r.revision}</strong>
                <p>
                  {r.name} · {r.workdir?.path ?? "No workdir"}
                </p>
                <details>
                  <summary>Inspect instructions</summary>
                  <pre>
                    {r.instructions}\n{r.agents_md}
                  </pre>
                </details>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={profileLocked || needsReview || externalChange}
                  aria-busy={feedback.isPending("restore")}
                  onClick={() =>
                    void save({ ...editableProfile(r), revision: baseline.revision }, "restore")
                  }
                >
                  <PendingIcon pending={feedback.isPending("restore")} />{feedback.isPending("restore") ? "Restoring…" : "Restore this revision"}
                </Button>
              </div>
            ))}
          </div>
        )}
        {["Profile", "Instructions"].includes(section) && (
          <Button
            className="save-profile"
            disabled={profileLocked || needsReview || externalChange || (!dirty && !retrySave)}
            aria-busy={feedback.isPending("save")}
            onClick={() => void save()}
          >
            {feedback.isPending("save") ? <PendingIcon pending size={15} /> : <Check size={15} />}
            {feedback.isPending("save") ? "Saving…" : !dirty && feedback.result?.kind === "success" ? "Saved" : "Save changes"}
          </Button>
        )}
        {["Profile", "Instructions", "Workdir", "History", "Code"].includes(section) && <><ActionStatus feedback={feedback}>
          {Boolean(refreshTarget) && !needsReview && <Button variant="outline" disabled={profileLocked} onClick={() => void feedback.run("refresh", async () => { if (refreshTarget === "script") await loadFile("", true); else await onSaved(); setRefreshTarget(null); return { kind: "success", message: `${agent.name}: view refreshed.` }; }, { errorMessage: "The view could not refresh. Previously acknowledged changes remain saved." })}>Retry refresh</Button>}
        </ActionStatus>{dirty && ["Profile", "Instructions"].includes(section) && <p className="hint" data-draft-status="unsaved">Unsaved changes</p>}</>}
        {section === "Profile" && (
          <Button
            variant="destructive"
            className="delete-agent"
            disabled={profileLocked}
            onClick={() => setConfirmDelete(true)}
          >
            Delete agent
          </Button>
        )}
      </div>
      {folderPicker && (
        <FolderPicker
          runtimeId={runtimeId || undefined}
          initialPath={path}
          sshHost={remote ? sshHost.trim() : undefined}
          onSelect={(selected) => {
            setPath(selected);
            setProbe("");
            setWorkdirDiagnosis(null);
            setFolderPicker(false);
          }}
          onClose={() => setFolderPicker(false)}
        />
      )}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {agent.name}?</DialogTitle>
            <DialogDescription>
              The agent will leave the organization chart. Its history and files
              stay available for restoration. Its direct reports move to its
              manager. Stop active work before deleting.
            </DialogDescription>
          </DialogHeader>
          <Button
            variant="destructive"
            onClick={() =>
              void (async () => {
                try {
                  await api(`/agents/${agent.id}`, { method: "DELETE" });
                  await onSaved();
                  onClose();
                } catch (error) {
                  setDeleteError(
                    error instanceof Error ? error.message : String(error),
                  );
                }
              })()
            }
          >
            Delete {agent.name}
          </Button>
          {deleteError && (
            <p role="alert" className="error">
              {deleteError}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </aside>
  );
}
