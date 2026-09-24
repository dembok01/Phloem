"use client";

import * as React from "react";

/**
 * A thin bar across the top of the window whenever the app is waiting on the
 * server — a page change, a server action, a router.refresh(). Every button in
 * the app goes through one of those, so this is the one place that answers
 * "is it loading or is it frozen?" for all of them.
 *
 * It watches fetch rather than clicks because all three reach the server through
 * window.fetch with a Next header — `rsc` for navigation and refresh,
 * `next-action` for server actions — whether they began at a <Link>, a <form>, the
 * desk switcher or a startTransition. Prefetches (`next-router-prefetch`) are
 * ignored: nobody asked for them. The bar holds until the response BODY finishes,
 * not its headers, because a redirecting action answers with headers first and
 * streams the new page after.
 *
 * ponytail: keyed to Next's own request headers (unchanged since 13). If an
 * upgrade renames them the bar just stops appearing; nothing else depends on it.
 */
export function NavProgress() {
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    const original = window.fetch;
    let inFlight = 0;
    // Deferred so a fetch Next starts mid-render never sets state during render.
    const sync = () => queueMicrotask(() => setBusy(inFlight > 0));
    const done = () => {
      inFlight -= 1;
      sync();
    };

    window.fetch = async (input, init) => {
      const headers = new Headers(init?.headers);
      const tracked =
        (headers.has("rsc") || headers.has("next-action")) &&
        !headers.has("next-router-prefetch");
      if (!tracked) return original.call(window, input, init);

      inFlight += 1;
      sync();
      try {
        const response = await original.call(window, input, init);
        // Read a copy to the end; Next reads the original.
        response.clone().arrayBuffer().catch(() => undefined).finally(done);
        return response;
      } catch (error) {
        done();
        throw error;
      }
    };
    return () => {
      window.fetch = original;
    };
  }, []);

  return busy ? <div role="progressbar" aria-label="Loading" className="nav-progress" /> : null;
}
