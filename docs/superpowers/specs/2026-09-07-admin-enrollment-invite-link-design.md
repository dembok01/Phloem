# Admin Enrollment Invite Link Design

## Goal

Restore the admin enrollment handoff so the person enrolling a member receives the exact caregiver invite link immediately and can send it manually. Enrollment must not send an invite email automatically.

## Approved experience

- The enrollment form explains that it creates a secure invite link and does not send email.
- The primary action reads “Enroll & create invite link.”
- A successful submission stays on the enrollment page and replaces the form with a clear success card.
- The card identifies the member and caregiver email, displays the exact invite URL, and provides Copy and supported-device Share actions.
- The success card links to the invite history and offers a fresh “Enroll another member” action.
- The existing Invites page remains the place to re-copy or revoke an invite later.

## Technical design

The existing `create_member_with_invite` RPC remains the source of the invite token. A testable enrollment service validates the form, invokes that RPC through a narrow dependency, and turns the returned token into a typed success result containing `memberName`, `caregiverEmail`, and `inviteUrl`. The server action revalidates affected pages and returns that result to a React `useActionState` form instead of redirecting and discarding the token.

The token is sent only in the server-action response required to render the approved copy/share UI. It is not placed in query parameters, redirect URLs, logs, or email. No schema, RPC, RLS, or email-service changes are required.

## Error handling and accessibility

- Validation and RPC failures render inline with `role="alert"` while the form remains available.
- A missing RPC token is treated as a failure, never as a successful enrollment.
- The invite remains visible and selectable if clipboard access fails.
- Share appears only where the Web Share API is available; cancellation is silent and other failures produce an inline status.
- All actions use existing focus, pending, and disabled states.

## Verification

Regression tests cover the enrollment service returning the exact invite URL and rejecting invalid or tokenless results. A rendering test covers the success handoff’s manual-send messaging and exact link. Run the focused tests, full unit suite, type-check, lint for changed files, and production build.
