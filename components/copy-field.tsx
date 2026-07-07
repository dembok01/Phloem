"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Read-only value with a copy-to-clipboard button — used for dev invite links. */
export function CopyField({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — the value stays
      // visible and selectable in the input as a fallback.
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        aria-label={label ?? "Invite link"}
        value={value}
        readOnly
        onFocus={(e) => e.currentTarget.select()}
        className="h-8 font-mono text-xs"
      />
      <Button type="button" variant="outline" size="sm" onClick={copy}>
        {copied ? <Check /> : <Copy />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}
