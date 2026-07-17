/** Browser event when firm_settings.session_timeout_minutes is saved. */
export const SESSION_TIMEOUT_CHANGED_EVENT = "sas:session-timeout-changed";

export function notifySessionTimeoutChanged(minutes: number) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(SESSION_TIMEOUT_CHANGED_EVENT, { detail: { minutes } }),
  );
}
