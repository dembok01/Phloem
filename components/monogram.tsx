import { cn } from "@/lib/utils";

/** Warm initials mark for a member (photo-free by design — see DESIGN-PROPOSALS P-3). */
export function Monogram({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .filter((w) => w && !/^dr\.?$/i.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-secondary font-display font-semibold text-secondary-foreground",
        size === "sm" && "size-9 text-sm",
        size === "md" && "size-12 text-lg",
        size === "lg" && "size-16 text-2xl",
        className,
      )}
    >
      {initials}
    </span>
  );
}
