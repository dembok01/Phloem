"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Read-only value with copy feedback and a selectable fallback. */
export function CopyField({ value, label }: { value: string; label?: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");

  async function copy() {
    setStatus("idle");
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      setStatus("error");
      return;
    }
    setStatus("copied");
    setTimeout(() => setStatus("idle"), 1500);
  }

  return (
    <div className="space-y-1.5">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <Input
          aria-label={label ?? "Invite link"}
          value={value}
          readOnly
          onFocus={(event) => event.currentTarget.select()}
          className="h-9 min-w-0 font-mono text-xs"
        />
        <Button type="button" variant="outline" size="sm" onClick={copy} aria-live="polite">
          {status === "copied" ? <Check aria-hidden /> : <Copy aria-hidden />}
          {status === "copied" ? "Copied" : "Copy"}
        </Button>
      </div>
      {status === "error" ? (
        <p role="status" className="text-xs text-muted-foreground">
          Copy is unavailable. Select the link above and copy it manually.
        </p>
      ) : null}
    </div>
  );
}
