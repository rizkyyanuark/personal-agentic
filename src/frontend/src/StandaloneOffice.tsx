import { useEffect, useRef, useState } from "react";
import { mountCockpit, type CockpitHandle } from "@personal-agentic/cockpit";
import "@personal-agentic/cockpit/styles.css";
import { api, ApiFailure } from "./api";
import type { CockpitState } from "./bindings/CockpitState";
import "./LivePreview.css";

export default function StandaloneOffice() {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const cockpit = useRef<CockpitHandle | null>(null);
  const [sceneError, setSceneError] = useState("");

  const searchParams = new URLSearchParams(window.location.search);
  const groupId = searchParams.get("group") || null;

  useEffect(() => {
    if (!host) return;
    let active = true;
    let handle: CockpitHandle | null = null;
    void Promise.resolve().then(() => {
      if (!active) return;
      try {
        handle = mountCockpit(host, {
          assetBase: "/cockpit-assets/",
          workspace: { title: "Live Office", detail: "Standalone Agent Office" },
        });
        cockpit.current = handle;
        handle.setConnection("loading", "Connecting to live office...");
      } catch (error) {
        setSceneError(error instanceof Error ? error.message : String(error));
      }
    });
    return () => {
      active = false;
      cockpit.current = null;
      handle?.dispose();
    };
  }, [host]);

  useEffect(() => {
    if (!host) return;
    let stopped = false;
    let generation = 0;
    let request: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    cockpit.current?.setConnection("loading", "Loading workspace status...");

    async function poll() {
      if (stopped || document.hidden || request) return;
      const controller = new AbortController();
      request = controller;
      const current = ++generation;
      let timedOut = false;
      const deadline = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, 10000);
      try {
        const query = groupId ? `?group_id=${encodeURIComponent(groupId)}` : "";
        const next = await api<CockpitState>(`/cockpit/state${query}`, {
          signal: controller.signal,
        });
        if (stopped || controller.signal.aborted || current !== generation) return;
        cockpit.current?.updateState(next);
      } catch (error) {
        if (stopped || (controller.signal.aborted && !timedOut) || current !== generation) return;
        const text = timedOut
          ? "Connection timed out. Reconnecting..."
          : error instanceof Error
            ? error.message
            : String(error);
        const status = error instanceof ApiFailure ? error.status : null;
        const blocked = status === 401 || status === 403;
        cockpit.current?.setConnection(
          blocked ? "error" : "offline",
          text
        );
      } finally {
        clearTimeout(deadline);
        if (request === controller) request = null;
        if (!stopped && !document.hidden && current === generation) {
          timer = setTimeout(() => void poll(), 2500);
        }
      }
    }

    function visibilityChanged() {
      if (stopped) return;
      generation++;
      request?.abort();
      request = null;
      if (timer) clearTimeout(timer);
      timer = null;
      if (document.hidden) {
        cockpit.current?.setConnection("loading", "Updates paused while tab is hidden.");
      } else {
        cockpit.current?.setConnection("loading", "Refreshing live office...");
        void poll();
      }
    }

    document.addEventListener("visibilitychange", visibilityChanged);
    void poll();

    return () => {
      stopped = true;
      generation++;
      request?.abort();
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, [host, groupId]);

  return (
    <div
      className="standalone-office-container"
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100dvh",
        overflow: "hidden",
        background: "#181b22",
      }}
    >
      {sceneError && (
        <p
          className="live-preview-error"
          role="alert"
          style={{ position: "absolute", top: 80, left: 24, zIndex: 101 }}
        >
          The 3D view could not start: {sceneError}
        </p>
      )}

      <div
        ref={setHost}
        className="live-preview-scene"
        data-testid="cockpit-host"
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}
