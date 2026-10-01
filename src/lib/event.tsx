import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { formCategories, normalizeForm, type FormConfig } from "../../shared/site";
import { DEFAULT_EVENT, type PublicEvent, eventDate } from "../../shared/event";
import { api, EVENT_CHANNEL } from "./api";

// How often open pages re-check the event settings, so admin changes show up without a reload.
const POLL_MS = 15_000;

// null until the first response, so stale defaults never flash on screen.
const Context = createContext<PublicEvent | null>(null);
export function EventProvider({ children }: { children: ReactNode }) {
  const [event, setEvent] = useState<PublicEvent | null>(null);
  useEffect(() => {
    const refresh = () => api.event().then(r => setEvent(r.settings)).catch(() => setEvent(e => e ?? DEFAULT_EVENT));
    const tick = () => document.visibilityState === "visible" && refresh();
    void refresh();
    const interval = window.setInterval(tick, POLL_MS);
    let channel: BroadcastChannel | undefined;
    try { channel = new BroadcastChannel(EVENT_CHANNEL); channel.onmessage = refresh; } catch { /* unsupported */ }
    window.addEventListener("event-settings-changed", refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(interval);
      channel?.close();
      window.removeEventListener("event-settings-changed", refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
  return <Context.Provider value={event}>{children}</Context.Provider>;
}

/** Tells this tab and other open tabs (same browser) that the event settings changed. */
export function announceEventChange() {
  window.dispatchEvent(new Event("event-settings-changed"));
  try { const c = new BroadcastChannel(EVENT_CHANNEL); c.postMessage("changed"); c.close(); } catch { /* unsupported */ }
}

/** Current event settings, or null while the first request is still pending. */
export const useEvent = () => useContext(Context);
export function EventMeta() {
  const event = useEvent();
  if (!event) return <span className="event-loading" aria-hidden="true">&nbsp;</span>;
  return <><time dateTime={event.date}>{eventDate(event)}</time> · {event.location}</>;
}
export function EventName() { return <>{useEvent()?.name ?? "\u00a0"}</>; }

/** Form builder config (defaults until loaded / when not configured). */
export function useForm(): FormConfig {
  const form = useEvent()?.form;
  return useMemo(() => normalizeForm(form), [form]);
}
/** All configured categories incl. hidden ones – for labels, filters and stats in the dashboard. */
export const useCategories = () => formCategories(useForm());
