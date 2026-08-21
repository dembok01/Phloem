"use client";

// App-wide toast layer (audit G-9): every action outcome gets a confirmation
// that repeats the verb of the button that caused it. Success auto-dismisses;
// errors stay until dismissed. aria-live so screen readers hear outcomes.
//
// Motion contract (Portal Elevation F3):
//   · Enters from the bottom edge and LEAVES THROUGH THE SAME EDGE. Asymmetric
//     paths are what make a dismissal feel arbitrary — and they are what make
//     swipe-to-dismiss legible, because the swipe follows the exit path.
//   · translateY is a percentage, so it moves by the toast's own height whatever
//     the message length.
//   · Swipe down to dismiss, with velocity: a quick flick counts even if it did
//     not travel far, which is how the gesture feels on a phone.
//   · The timer pauses on hover and while the tab is hidden — nobody should lose
//     a message they were reading, or return to a tab and find it already gone.
import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion, type PanInfo } from "motion/react";
import { CheckCircle2, Info, XCircle, X } from "lucide-react";
import { useCalmMotion } from "@/components/use-calm-motion";
import { cn } from "@/lib/utils";

type ToastKind = "success" | "error" | "info";
/** An optional single affordance on the toast — in practice, Undo. Only offer one
 * where a TRUE inverse exists: a toast that says "Undo" and cannot is worse than
 * no toast at all. (Suspend↔Reactivate qualifies; a hard-deleted invite does not.) */
export type ToastAction = { label: string; run: () => void | Promise<void> };
type Toast = { id: number; kind: ToastKind; message: string; action?: ToastAction };

type ToastContextValue = {
  toast: (kind: ToastKind, message: string, action?: ToastAction) => void;
};

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

const ICONS: Record<ToastKind, React.ReactNode> = {
  success: <CheckCircle2 className="size-5 text-success" aria-hidden />,
  error: <XCircle className="size-5 text-danger" aria-hidden />,
  info: <Info className="size-5 text-info" aria-hidden />,
};

const AUTO_DISMISS_MS = 5000;
/** An actionable toast has to outlive the reading of it, not just the noticing. */
const AUTO_DISMISS_ACTION_MS = 9000;
/** px/s. Motion reports velocity per second; the ~0.11 px/ms rule of thumb ×1000. */
const FLICK_VELOCITY = 110;
/** Past this fraction of its own height, a slow drag still dismisses. */
const DRAG_DISTANCE = 56;

function ToastItem({
  toast,
  onDismiss,
  calm,
}: {
  toast: Toast;
  onDismiss: (id: number) => void;
  calm: boolean;
}) {
  const { id, kind, message, action } = toast;
  const [paused, setPaused] = React.useState(false);
  const [running, setRunning] = React.useState(false);

  // Errors never auto-dismiss. Everything else runs a timer that stops while the
  // pointer is over the toast, while its action is firing, or while the tab is
  // in the background.
  React.useEffect(() => {
    if (kind === "error" || paused || running) return;
    const timer = window.setTimeout(
      () => onDismiss(id),
      action ? AUTO_DISMISS_ACTION_MS : AUTO_DISMISS_MS,
    );
    return () => window.clearTimeout(timer);
  }, [id, kind, paused, running, action, onDismiss]);

  React.useEffect(() => {
    const onVisibility = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  function onDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.y > DRAG_DISTANCE || info.velocity.y > FLICK_VELOCITY) onDismiss(id);
  }

  return (
    <motion.div
      layout={calm ? false : "position"}
      // Enter and exit share one path: in from below, out the same way.
      initial={calm ? false : { opacity: 0, transform: "translateY(100%)" }}
      animate={{ opacity: 1, transform: "translateY(0%)" }}
      exit={calm ? { opacity: 0 } : { opacity: 0, transform: "translateY(100%)" }}
      transition={calm ? { duration: 0 } : { type: "spring", duration: 0.4, bounce: 0.1 }}
      drag={calm ? false : "y"}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0.02, bottom: 0.9 }}
      onDragEnd={onDragEnd}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      data-slot="toast"
      role={kind === "error" ? "alert" : "status"}
      className={cn(
        "pointer-events-auto flex w-full max-w-sm touch-pan-x items-start gap-2.5 rounded-xl border bg-popover px-4 py-3 text-popover-foreground shadow-pop",
        !calm && "cursor-grab active:cursor-grabbing",
        kind === "error" && "border-danger/30",
      )}
    >
      {ICONS[kind]}
      <p className="min-w-0 flex-1 pt-px text-sm leading-snug">{message}</p>
      {action ? (
        <button
          type="button"
          disabled={running}
          onClick={async () => {
            setRunning(true);
            try {
              await action.run();
            } finally {
              onDismiss(id);
            }
          }}
          className="pressable -my-1 shrink-0 rounded-lg border px-2.5 py-1.5 text-sm font-semibold hover:bg-muted disabled:opacity-60"
        >
          {running ? "…" : action.label}
        </button>
      ) : null}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => onDismiss(id)}
        className="-m-1 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="size-4" aria-hidden />
      </button>
    </motion.div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const nextId = React.useRef(1);
  const calm = useCalmMotion();

  const dismiss = React.useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback(
    (kind: ToastKind, message: string, action?: ToastAction) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev.slice(-3), { id, kind, message, action }]);
    },
    [],
  );

  return (
    <ToastContext.Provider value={React.useMemo(() => ({ toast }), [toast])}>
      {children}
      <div
        aria-live="polite"
        aria-label="Notifications"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:items-end"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <ToastItem key={t.id} toast={t} onDismiss={dismiss} calm={calm} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Bridges server-action outcomes to toasts: reads `?ok=` / `?error=` codes,
 * shows the mapped message once, and cleans the URL. Render one per page that
 * redirects with outcome params; pass the page's own code → copy maps.
 */
export function FlashToast({
  ok,
  error,
}: {
  ok?: Record<string, string>;
  error?: Record<string, string>;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fired = React.useRef<string | null>(null);

  React.useEffect(() => {
    const okCode = searchParams.get("ok");
    const errCode = searchParams.get("error");
    if (!okCode && !errCode) return;
    const key = `${pathname}?ok=${okCode}&error=${errCode}`;
    if (fired.current === key) return;
    fired.current = key;

    if (okCode && ok?.[okCode]) toast("success", ok[okCode]);
    if (errCode && error?.[errCode]) toast("error", error[errCode]);

    const params = new URLSearchParams(searchParams);
    params.delete("ok");
    params.delete("error");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [searchParams, pathname, ok, error, toast, router]);

  return null;
}
