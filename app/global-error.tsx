"use client";

// The last line of defence: catches failures in the root layout itself (and in
// `app/(app)/layout.tsx`, whose errors a sibling error.tsx cannot catch).
//
// Next.js replaces the entire root layout with this component, so next/font and
// globals.css are NOT applied here. Everything is therefore self-contained: a
// system font stack, the DESIGN-SYSTEM palette inlined as literals, and dark mode
// via prefers-color-scheme (the app's `.dark` class lives on a tree that no
// longer exists at this point). No imports from the design system — if the app
// is broken enough to reach this boundary, this file must not depend on it.
import * as React from "react";

const CSS = `
.ge-root {
  --ge-bg: #F5F8F5; --ge-card: #FFFFFF; --ge-ink: #1F2A24; --ge-muted: #5A6B60;
  --ge-danger: #A63A24; --ge-danger-tint: #F9ECE8; --ge-border: #DCE5DD;
  --ge-primary: #1E6B4E; --ge-on-primary: #FFFFFF;
}
@media (prefers-color-scheme: dark) {
  .ge-root {
    --ge-bg: #141C17; --ge-card: #1B2620; --ge-ink: #E8EEE9; --ge-muted: #9FB0A6;
    --ge-danger: #D9765F; --ge-danger-tint: #33201A; --ge-border: #2C3A31;
    --ge-primary: #6FBF9A; --ge-on-primary: #10241B;
  }
}
.ge-root {
  margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
  padding: 1rem; background: var(--ge-bg); color: var(--ge-ink);
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  line-height: 1.6; -webkit-font-smoothing: antialiased;
}
.ge-card {
  width: 100%; max-width: 28rem; display: flex; flex-direction: column;
  align-items: center; gap: .5rem; text-align: center;
  background: var(--ge-card); border: 1px solid var(--ge-border);
  border-radius: 14px; padding: 2.5rem 1.5rem;
  box-shadow: 0 1px 2px rgb(31 42 36 / .05), 0 1px 6px rgb(31 42 36 / .05);
}
.ge-mark {
  width: 44px; height: 44px; border-radius: 999px; margin-bottom: .25rem;
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--ge-danger-tint); color: var(--ge-danger);
}
.ge-title { font-size: 1.125rem; font-weight: 600; margin: 0; letter-spacing: -.01em; }
.ge-body { margin: 0; max-width: 24rem; color: var(--ge-muted); }
.ge-ref { margin: .5rem 0 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: .75rem; color: var(--ge-muted); }
.ge-btn {
  margin-top: 1rem; min-height: 48px; display: inline-flex; align-items: center;
  padding: 0 1.25rem; border: 0; border-radius: 10px; cursor: pointer;
  background: var(--ge-primary); color: var(--ge-on-primary);
  font: inherit; font-size: 1rem; font-weight: 500;
}
.ge-btn:focus-visible { outline: 2px solid var(--ge-primary); outline-offset: 2px; }
`;

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // lib/observe is deliberately not imported here — keep this boundary
    // dependency-free. Same one-JSON-line-per-event shape.
    console.error(
      JSON.stringify({
        evt: "app.global_error",
        level: "error",
        at: new Date().toISOString(),
        error: error.message,
        digest: error.digest,
      }),
    );
  }, [error]);

  return (
    <html lang="en">
      <body className="ge-root">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="ge-card">
          <span className="ge-mark" aria-hidden>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </svg>
          </span>
          <p className="ge-title">PHLOEM Care is temporarily unavailable</p>
          <p className="ge-body">
            Something went wrong loading the app. Nothing was lost — your information is safe. Please
            try again in a moment.
          </p>
          {error.digest ? <p className="ge-ref">Reference {error.digest}</p> : null}
          <button type="button" className="ge-btn" onClick={reset}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
