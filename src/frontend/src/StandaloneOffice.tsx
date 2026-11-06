import { useEffect, useState } from "react";
import { mountCockpit, type CockpitHandle } from "@personal-agentic/cockpit";
import "@personal-agentic/cockpit/styles.css";
import { api } from "./api";
import { assertPublicOfficeState } from "./publicOfficeState";
import "./LivePreview.css";

type Notice = { title: string; detail: string; error?: boolean };
const loading = { title: "Memuat kantor publik", detail: "Menghubungkan ke Live Office…" };

export default function StandaloneOffice() {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [notice, setNotice] = useState<Notice | null>(loading);

  useEffect(() => {
    if (!host) return;
    let stopped = false;
    let generation = 0;
    let request: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let staleTimer: ReturnType<typeof setTimeout> | null = null;
    let handle: CockpitHandle | null = null;
    let context = "";
    let highestRevision = -1;

    function clearScene() {
      handle?.dispose();
      handle = null;
      context = "";
      host!.replaceChildren();
      if (staleTimer) clearTimeout(staleTimer);
      staleTimer = null;
    }

    async function poll() {
      if (stopped || document.hidden || request) return;
      const controller = new AbortController();
      request = controller;
      const current = ++generation;
      const deadline = setTimeout(() => controller.abort(), 10000);
      try {
        const next = await api<unknown>("/public/office/state", { signal: controller.signal, credentials: "omit", cache: "no-store" });
        if (stopped || controller.signal.aborted || current !== generation) return;
        assertPublicOfficeState(next);
        if (next.revision < highestRevision) return;
        highestRevision = next.revision;
        if (next.status !== "published") {
          clearScene();
          setNotice(next.status === "unpublished"
            ? { title: "Kantor belum dipublikasikan", detail: "Pemilik instalasi belum menetapkan kantor publik." }
            : { title: "Kantor publik tidak tersedia", detail: "Workspace yang dipublikasikan sedang tidak tersedia. Menghubungkan kembali…" });
          return;
        }
        const identity = `${next.revision}:${next.workspace!.id}`;
        if (identity !== context) {
          clearScene();
          handle = mountCockpit(host!, { assetBase: "/cockpit-assets/", workspace: { title: next.workspace!.name, detail: "Public Live Office" } });
          context = identity;
        }
        handle!.setWorkspace({ title: next.workspace!.name, detail: "Public Live Office" });
        handle!.updateState(next.snapshot!);
        setNotice(null);
        if (staleTimer) clearTimeout(staleTimer);
        staleTimer = setTimeout(() => {
          generation++;
          request?.abort();
          request = null;
          if (timer) clearTimeout(timer);
          clearScene();
          if (!stopped) {
            setNotice({ title: "Status kantor kedaluwarsa", detail: "Menunggu pembaruan Live Office…", error: true });
            timer = setTimeout(() => void poll(), 2500);
          }
        }, 20000);
      } catch {
        if (stopped || current !== generation) return;
        clearScene();
        setNotice({ title: "Kantor publik belum dapat dimuat", detail: "Koneksi atau data kantor tidak tersedia. Menghubungkan kembali…", error: true });
      } finally {
        clearTimeout(deadline);
        if (request === controller) request = null;
        if (!stopped && !document.hidden && current === generation) timer = setTimeout(() => void poll(), 2500);
      }
    }

    function visibilityChanged() {
      generation++;
      request?.abort();
      request = null;
      if (timer) clearTimeout(timer);
      timer = null;
      clearScene();
      setNotice(loading);
      if (!document.hidden) void poll();
    }

    document.addEventListener("visibilitychange", visibilityChanged);
    void poll();
    return () => {
      stopped = true;
      generation++;
      request?.abort();
      if (timer) clearTimeout(timer);
      clearScene();
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, [host]);

  return <main className="standalone-office-container" style={{ position: "fixed", inset: 0, width: "100vw", height: "100dvh", overflow: "hidden" }}>
    <div ref={setHost} className="live-preview-scene" data-testid="cockpit-host" style={{ width: "100%", height: "100%" }} />
    {notice && <div className="public-office-notice" role={notice.error ? "alert" : "status"}>
      <h1>{notice.title}</h1><p>{notice.detail}</p>
    </div>}
  </main>;
}
