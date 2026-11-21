// The first-look tier (owner decision 2026-11-22): a page's arrival choreography
// plays the first time that page is opened in a browser session, and never again
// in that session. A visitor always sees it; a coordinator who opens Today two
// hundred times a day sees it once.
//
// One key per ROUTE, not per URL: every member page shares `/coordinator/members/:id`,
// so opening the twentieth member of the morning is as quiet as the second.
//
// Shared by the server (the boot script in app/layout.tsx) and the client
// (components/first-look.tsx), so the two can never disagree about a key.

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export function lookKey(pathname: string): string {
  return "phloem:look:" + pathname.replace(new RegExp("/" + UUID, "gi"), "/:id");
}

export type Look = "first" | "again";

/**
 * Runs in <head> before the body paints, so a hard load of a first-look page has
 * `html[data-look="first"]` from the very first frame and nothing flashes in and
 * then animates. `data-boot` marks "this decision came from the boot script" —
 * components/first-look.tsx clears it once the app has hydrated.
 *
 * Fails quiet: if sessionStorage is unavailable (private mode, blocked storage)
 * the page is treated as already seen, i.e. no animation.
 */
export const FIRST_LOOK_BOOT_SCRIPT = `(function(){try{var d=document.documentElement,p=location.pathname,k="phloem:look:"+p.replace(new RegExp("/${UUID}","gi"),"/:id"),s=window.sessionStorage,l=s.getItem(k)?"again":"first";if(l==="first")s.setItem(k,"1");d.setAttribute("data-look",l);d.setAttribute("data-boot","");window.__phloemLook={key:k,look:l};}catch(e){}})();`;
