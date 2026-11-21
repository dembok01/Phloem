# Dashboard design refresh

**Goal:** Elevate the entire Phloem dashboard, including every care-team role, the admin workspace, and the family portal, with a cohesive visual language and purposeful interaction feedback.

**Architecture:** Keep the existing Next.js server components, permissions, actions, and queries. Update the shared visual primitives and add a responsive, role-aware workspace shell; refine the presentation of each role's overview and detail screens. Reuse the existing fonts, role hues, growth-ring identity, Base UI primitives, and motion tokens.

**Tech stack:** Next.js 15, React 19, Tailwind 4, Base UI, CSS transitions, existing Motion where already needed.

## Design and constraints

- Botanical direction: warm paper canvas, forest-green navigation, white panels, readable green-black text, restrained role-colour accents.
- Staff: persistent desktop navigation, compact mobile navigation, clear workspace context, an editorial page heading, a focal summary, and dense readable work queues.
- Family: welcoming summary, spacious quick actions, clear consultation and care-team information. Elderly mode keeps larger controls and suppresses movement.
- Motion: 160ms press feedback, 200ms overlay/state transitions, at most 220ms content entrance. Keep frequent keyboard actions instant; no count-up effects on clinical data or decorative looping motion.
- Preserve all existing auth/data semantics, safety colours, labels, form actions, filters, and route destinations. No database changes or new dependencies.
- Preserve existing untracked user documents. Work directly in the current workspace so the complete visual result is available locally.

## Tasks

- [x] Shared primitives: refine cards, buttons, inputs, chips, lists, empty/loading states, sheets and toast surfaces; keep their public interfaces compatible.
- [x] Workspace: create responsive role navigation and a shared shell; integrate current account, notification and desk-switcher controls; polish page headers and tab rails.
- [x] Clinical workspace: refine doctor/nutritionist/trainer/psychologist overview, coordinator Today and pipeline, and clinical member presentation without altering data logic.
- [x] Family and auth: refine family home, care-team and renewal surfaces, related portal pages and signed-out layouts; preserve elderly-mode usability.
- [x] Admin: strengthen summary hierarchy, metric links, filters, table readability, member details and care-team management presentation.
- [x] Verification: typecheck, lint, existing unit suite and production build. Use local browser checks for desktop/mobile layout, keyboard focus, navigation, overlays and reduced-motion behavior. Inspect actual screenshots and correct visible issues before handoff.

## Ownership

The primary agent owns global styles, the workspace shell, navigation, admin surfaces and integration. Independent workers own shared UI primitives; clinical/coordinator presentation; and family/auth presentation. Each edits only its assigned files, reports limitations and runs targeted static checks. Final integrated verification is performed by the primary agent.

## Verification record

- All 68 changed TypeScript/TSX files passed an esbuild syntax check.
- `npm run typecheck` completed successfully.
- The existing unit suite completed with 176 passed, 0 failed.
- Integrated code review fixed off-screen mobile menus, short-window sidebar clipping,
  and stale search destinations after desk changes.
- Production build passed, including Next.js lint and type validation.
- Browser checks: admin overview, members, care team, coordinator Today and pipeline
  rendered at 1440px without horizontal overflow. Admin also passed at 390px and 360px.
- Search dialog focus containment and focus restoration passed; reduced-motion CSS
  resolved to 0.00001s transitions; no browser page errors were recorded.
- Fully loaded doctor workspace passed at 1440px and 390px with no horizontal overflow.
- Desk-switcher and notification popovers stayed within a 360px viewport. The member-edit
  sheet retained focus and fit the 390px mobile viewport with its footer accessible.
- At 1024 × 540, the desktop sidebar scrolled to expose all navigation items.
- Inspected desktop and mobile screenshots, including the loaded doctor workspace and
  member-edit sheet. The final interaction pass reported no browser page errors.
- Family portal and individual clinical-role workflows received code/build verification;
  authenticated browser checks used the admin, coordinator and All doctors views.
- `git diff --check` passed. Production preview runs at http://127.0.0.1:3000.
