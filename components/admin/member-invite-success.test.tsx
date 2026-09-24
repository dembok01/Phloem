import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { MemberInviteSuccess } from "./member-invite-success";

test("the enrollment success handoff exposes the exact invite for manual sending", () => {
  const html = renderToStaticMarkup(
    <MemberInviteSuccess
      invite={{
        outcome: "invited",
        memberName: "Mary Thomas",
        caregiverEmail: "alex@example.com",
        inviteUrl:
          "https://dashboard.example.com/invite/11111111-2222-3333-4444-555555555555",
      }}
      onEnrollAnother={() => undefined}
    />,
  );

  assert.match(html, /Member enrolled/);
  assert.match(html, /Mary Thomas/);
  assert.match(html, /alex@example\.com/);
  assert.match(html, /No email was sent automatically/);
  assert.match(
    html,
    /value="https:\/\/dashboard\.example\.com\/invite\/11111111-2222-3333-4444-555555555555"/,
  );
  assert.match(html, />Copy</);
  assert.match(html, /href="\/admin\/invites"/);
  assert.match(html, /Enroll another member/);
});

test("linking to an existing account offers no invite link to copy", () => {
  const html = renderToStaticMarkup(
    <MemberInviteSuccess
      invite={{
        outcome: "linked",
        memberName: "Remadevi K A",
        caregiverEmail: "alex@example.com",
        caregiverName: "Alex Kumar",
      }}
      onEnrollAnother={() => undefined}
    />,
  );

  assert.match(html, /Added to an existing account/);
  assert.match(html, /Remadevi K A/);
  assert.match(html, /Alex Kumar/);
  // The whole point: there is no invite, so nothing must look copyable.
  assert.doesNotMatch(html, /Invite link/);
  assert.doesNotMatch(html, /\/invite\//);
});
