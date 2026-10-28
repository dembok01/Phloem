"use client";

// Copy the emergency details as text, to paste and pin in the family's WhatsApp
// group (client item 6) — so the trainer finds them there too.
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function CopyWhatsAppButton({ text }: { text: string }) {
  const { toast } = useToast();

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast("success", "Copied — paste it in the family's group and pin it");
    } catch {
      toast("error", "Couldn't copy. Try again, or copy the details from this card.");
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={copy}>
      <Copy className="size-3.5" aria-hidden /> Copy for WhatsApp
    </Button>
  );
}
