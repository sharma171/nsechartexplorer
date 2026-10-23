import { useEffect, useState } from "react";

/**
 * Lightweight mobile-only nudge to rotate to landscape.
 * Pure CSS animation (see .rotate-phone styles in src/styles.css), no packages.
 */
export function RotatePrompt() {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(sessionStorage.getItem("dismiss_rotate_prompt") === "1");
    const mq = window.matchMedia("(max-width: 768px) and (orientation: portrait)");
    const update = () => setVisible(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  if (!visible || dismissed) return null;

  function dismiss() {
    sessionStorage.setItem("dismiss_rotate_prompt", "1");
    setDismissed(true);
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 bottom-3 z-50 flex items-center gap-3 rounded-lg border bg-popover text-popover-foreground px-3 py-2 shadow-lg animate-rotate-toast"
    >
      <div className="rotate-phone-icon shrink-0" aria-hidden="true">
        <div className="rotate-phone-screen" />
      </div>
      <p className="text-xs leading-snug">
        Rotate to landscape for better view of candle columns
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="ml-auto shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        ✕
      </button>
    </div>
  );
}
