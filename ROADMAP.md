# Roadmap — v2: Team Membership & Ticket Assignment

> **Status: planned, not built.** The current app is complete against the hackathon
> spec, which *deliberately excludes* team membership and ticket assignment
> (§4 "membership not in scope; all verified users manage all teams", §12
> "team membership, roles, per-ticket access control" out of scope). This v2
> goes **beyond that spec** and would ship on a separate branch — not merged into
> the graded deliverable unless explicitly wanted.

## Motivation
Move from the spec's open model (every verified user works on every team;
tickets have `created_by` only) toward a real multi-user PM tool: users belong to
teams, and tickets are assigned to a responsible person.

## The one big consequence
Introducing membership **changes the existing access model**. Today all verified
users can view/manage all teams. Decide the policy up front:
- **Additive (low-risk):** teams stay publicly listable/manageable; membership only
  governs *who can be assigned*. No access regression. (Recommended first step.)
- **Scoped (bigger):** membership gates team/board visibility & writes (private
  teams). This is genuine per-team authorization the spec avoided — larger blast radius.

## Data model
- **`team_memberships`** (join): `user_id`, `team_id`, `role` (`member` | `admin`),
  timestamps; unique `(user_id, team_id)`; FKs cascade on user/team delete.
- **`tickets.assignee_id`** — FK→users, nullable, `on_delete: :nullify`.
  Rule: assignee must be a member of the ticket's team.
- **Backfill on rollout:** make every existing user a member of every team (preserves
  current behavior), or start empty and require explicit adds. `created_by` → member.

## API
**Membership**
- `GET /api/teams/:team_id/members` → `{ members: [{id,email,role}] }` (members only — no global user enumeration).
- `POST /api/teams/:team_id/members` `{ email }` → 201; 404 unknown email; 409 already a member.
- `DELETE /api/teams/:team_id/members/:user_id` → 204; 409 if the member has assigned tickets (or auto-unassign — decide).

**Assignment**
- Ticket JSON gains `assignee: {id,email} | null`.
- `POST`/`PATCH /api/tickets` accept `assignee_id` (nullable). **422 `assignee_not_member`** if the assignee isn't in the ticket's team.
- Team change re-validates/clears `assignee` (mirrors the epic-team rule).
- `GET /api/tickets` gains `&assignee_id=` (plus a `me` convenience → current user).
- Assignee change **counts as a real field change** → bumps `modified_at`.

## Frontend
- **Team members screen** (per team): list, add-by-email, remove.
- **Ticket form:** Assignee `Select` scoped to the team's members + "Unassigned".
- **Board:** assignee indicator on cards; Assignee filter (incl. "Me"); a "My tickets" quick view.

## Security (per Marcus's guidance)
- Member listing scoped to team members; add-by-**exact email** only (no fuzzy user search that enables enumeration).
- Enforce membership server-side on assignment (and on access, if scoping reads).
- Rate-limit member-add / invitations.
- Revisit the login `403 email_unverified` enumeration tradeoff if a stricter posture is wanted.

## Milestones

Same cadence as M0–M6: each is a **full-stack vertical slice**, demoable, ending
at a review-and-commit gate. Agent flow per slice: Emily (acceptance criteria) →
David (contract) → James ∥ Emma (build) → Ryan (integration) → Sarah (`bin/check`)
+ Daniel (review) + Marcus (security, new surfaces) → Jessica (browser E2E incl.
Firefox). Order matters: **membership → assignment → (optional) scoping** —
assignment is only meaningful once membership exists.

### V2.1 — Team membership (additive, no access regression)
- **Backend:** `team_memberships` (user_id, team_id, role member|admin, unique pair);
  `GET/POST/DELETE /api/teams/:team_id/members` (list scoped to members; add by exact
  email → 201/404/409; remove → 204). **Backfill migration:** every existing user
  becomes a member of every team (preserves current behavior). rswag + model/request specs.
- **Frontend:** Team members screen (list, add-by-email, remove) reachable from Teams.
- **Demoable / DoD:** add & remove members through the UI; persists; no global user
  enumeration; existing "everyone can manage all teams" behavior unchanged.
- **Decision to settle here:** removing a member who has assigned tickets → block
  (409) or auto-unassign? (Defaults to no-op until V2.2 exists.)

### V2.2 — Ticket assignment
- **Backend:** `tickets.assignee_id` (FK→users, nullable, on_delete nullify);
  validation **assignee must be a member of the ticket's team** → `422 assignee_not_member`;
  team change clears/revalidates assignee (mirrors epic rule); assignee change **bumps
  `modified_at`**; `GET /api/tickets` gains `&assignee_id=` (+ `me`); serializer adds
  `assignee`. Enforce the remove-member policy chosen in V2.1. Specs for each rule.
- **Frontend:** assignee `Select` in the ticket form (team members + "Unassigned");
  board card assignee indicator; board **Assignee filter** + **"My tickets"** quick view.
- **Demoable / DoD:** assign/reassign/unassign a ticket; cross-team assignee rejected;
  filter the board by assignee and by "me"; assignee shows on cards.

### V2.3 — (optional) Access scoping, roles, invitations
- Membership-gated team/board visibility (private teams), **admin** role permissions,
  email **invitations** (invite unregistered users). Larger surface; genuine per-team
  authorization the original spec avoided. Ship only if the product direction calls for it.

## Effort
~2 milestones for the core (V2.1 + V2.2), +1 optional. Each is one build-and-gate
cycle of roughly the size of M2/M3. Keep on a `v2` branch; do not merge into the
graded hackathon deliverable unless intended.
