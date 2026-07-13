"use client";

// App-wide toast layer (audit G-9): every action outcome gets a confirmation
// that repeats the verb of the button that caused it. Success auto-dismisses;
// errors stay until dismissed. aria-live so screen readers hear outcomes.
import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Info, XCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastKind = "success" | "error" | "info";
type Toast = { id: number; kind: ToastKind; message: string };

type ToastContextValue = { toast: (kind: ToastKind, message: string) => void };

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

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const nextId = React.useRef(1);

  const dismiss = React.useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev.slice(-3), { id, kind, message }]);
      if (kind !== "error") setTimeout(() => dismiss(id), 5000);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={React.useMemo(() => ({ toast }), [toast])}>
      {children}
      <div
        aria-live="polite"
        aria-label="Notifications"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:items-end"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl border bg-popover px-4 py-3 text-popover-foreground shadow-pop",
              "animate-in fade-in slide-in-from-bottom-2 duration-200 ease-out",
              t.kind === "error" && "border-danger/30",
            )}
          >
            {ICONS[t.kind]}
            <p className="min-w-0 flex-1 pt-px text-sm leading-snug">{t.message}</p>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismiss(t.id)}
              className="-m-1 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ))}
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
