# AI-First MVP Delivery Contract

This file is the operating contract for future ChatGPT 5.4 and Codex work in this repository.

Its purpose is to keep the project focused on a solid MVP, reduce agent drift, minimize token waste, and ship the smallest correct increments.

## Core Goal

Ship a solid MVP that is publicly demoable, trustworthy in the core flow, and intentionally incomplete outside the MVP boundary.

## AI-First Time Expectations

Using ChatGPT 5.4 and Codex consistently should improve execution speed and reduce iteration cost, but it does not change the true dependency graph.

- Expect roughly 25-40% less elapsed effort for well-bounded implementation tasks.
- Do not expect large time savings for deployment hardening, external integrations, or production validation.
- Current planning baseline:
	- Showable MVP: about 1-2 focused days with strict AI-first discipline.
	- Solid completed MVP: about 3-5 focused days.
	- First real production deployment: about 1.5-3 weeks, depending on hosting and operational hardening.

## MVP Definition Of Done

The MVP is only complete when all of the following are true:

- The public site loads successfully.
- `npm test` passes.
- `npm run build` passes.
- The local DB-backed app boots cleanly using the documented setup.
- The demo/live data path works end to end.
- Core pages are usable.
- `/api/system/status` works and reflects useful health information.
- No knowingly broken or misleading production-looking features remain publicly exposed.

## Strict Out Of Scope

Unless a task is explicitly approved as a new milestone, the following are out of scope:

- Redesigns and broad visual polish
- Broad refactors
- Speculative abstractions
- Advanced analytics
- Auth systems beyond what MVP strictly requires
- Billing or accounts
- Mobile applications
- Dashboards beyond current admin need
- Infrastructure complexity not required for first launch

## Model And Tool Roles

### ChatGPT 5.4

Use ChatGPT 5.4 for:

- Milestone planning
- Scoping
- Acceptance criteria
- Design review
- Risk assessment
- Post-change review

### Codex

Use Codex for:

- Repo-grounded inspection
- Implementation
- Local validation
- Build, test, and debug work
- Surgical code review

### Default AI-first pattern

Use this default flow unless there is a concrete reason not to:

1. ChatGPT 5.4 produces or refines the milestone spec.
2. Codex inspects the repo, implements the change, and verifies it locally.
3. ChatGPT 5.4 reviews the diff and results when the task was non-trivial.

## Thread Discipline

### Required thread shape

Every future thread must follow this order:

1. Identify which MVP milestone is being advanced.
2. Confirm the narrow objective.
3. Inspect relevant files and current behavior before editing.
4. List concrete acceptance criteria.
5. Implement only the smallest coherent slice.
6. Run targeted verification.
7. Update docs or checklist state if the milestone changed.
8. Stop and report the next smallest milestone.

### Anti-drift rules

- Every thread must explicitly state which MVP milestone it is advancing before editing code.
- Use one thread per milestone, not one thread per idea.
- Reuse an existing thread only when continuing the same milestone and its context still helps.
- Do not widen scope mid-thread.
- If the task expands materially, stop and split it into a new milestone.
- If unrelated issues are found, record them for later unless they block the active milestone.

### Anti-waste rules

- Do not ask the model to rewrite or re-audit the whole repo when only one subsystem is changing.
- Always provide the smallest relevant context window.
- Prefer file-path-targeted prompts over repo-wide descriptions.
- Ask for exact errors, failing commands, diffs, and 1-3 relevant files when possible.
- Avoid repeating repository background that is already captured in this file or the README.
- For code review, ask for findings first, not a broad summary.
- For implementation, ask for one milestone at a time, not the entire roadmap repeatedly.

## Inspect First, Ask Second

Use this policy by default:

- Inspect first for anything discoverable in the repo or environment.
- Ask only for true product preferences, tradeoffs, or hard external unknowns.
- Prefer narrow prompts with explicit success criteria and exact files or functions when known.

## MVP Milestones

Future threads should advance these milestones in order. Do not skip ahead unless blocked by a dependency.

### Milestone 1: Buildable deployable core

- Fix the `next build` failure in `src/lib/db/pool.ts`.
- Verify `npm test` passes.
- Verify `npm run build` passes.
- Confirm the local DB-backed app boots cleanly with documented setup.
- Treat this as the immediate gating milestone. Nothing else is done until the build is green.

### Milestone 2: MVP truthfulness pass

- Remove or hide anything that looks production-ready but is not.
- Review alerts and admin/provenance exposure specifically.
- If real email delivery is not implemented, either label alerts clearly as non-MVP or complete the minimum provider-backed path.
- If admin routes remain unauthenticated, remove public navigation to them or gate them appropriately for MVP.
- Goal: no misleading public surface area.

### Milestone 3: Demo-quality data flow

- Use this MVP data mode:
	- real official ingestion when available
	- deterministic seeded fallback when not
- Verify end-to-end demo refresh from empty DB to working public pages.
- Verify homepage filters, member page, asset page, and system status against seeded and live-ingested data.
- Add and maintain a short operator checklist for reliable demo refresh before showing the product.

### Milestone 4: First hosted MVP

- Choose one simple hosting path and commit to it.
- Prefer the least operationally complex setup that supports Next.js, Postgres, and scheduled workers.
- Deploy the web app.
- Provision Postgres.
- Set environment variables.
- Run schema setup.
- Document the exact bootstrap sequence.
- Do not publish a demo URL until build, pages, and status endpoint are verified in the hosted environment.

### Milestone 5: Production readiness minimum

- Complete the minimum real alert provider integration or explicitly defer alerts from launch.
- Set worker schedules for ingestion and pricing refresh.
- Add basic runbook coverage for:
	- stale ingestion
	- failed pricing refresh
	- failed alert delivery
	- empty UI
	- DB misconfiguration
- Add minimal logging and monitoring expectations tied to `/api/system/status` and worker summaries.
- Only after these are stable should the project be considered the first actual production deployment.

## Thread Templates

### Required start-of-thread template

Every implementation thread should begin by stating:

- Current milestone:
- Narrow objective:
- Relevant files to inspect:
- Acceptance criteria:

### Required end-of-thread template

Every implementation thread should end by stating:

- Changed behavior:
- Verification performed:
- Remaining risk:
- Next smallest milestone:

## Verification Expectations

Use these checks as the default progression:

### Planning artifact checks

- Root `AGENTS.md` exists and is unambiguous.
- It defines milestone order, acceptance criteria, and strict out-of-scope boundaries.
- It gives future threads a concrete workflow instead of generic advice.

### MVP gating checks

- `npm test` passes.
- `npm run build` passes.
- Local app runs against configured Postgres.
- Demo refresh path produces usable public pages.

### Truthfulness checks

- No public UI advertises broken or stub-only functionality.
- Any non-MVP capability is either hidden, clearly labeled, or completed.
- Admin and provenance exposure is intentional, not accidental.

### Hosted MVP checks

- Hosted app boots successfully.
- `/api/system/status` returns the expected health structure.
- Core pages render with real or deterministic fallback data.
- Worker schedule assumptions are documented and reproducible.

### Production minimum checks

- Ingestion, pricing refresh, and any launched alert functionality have a clear operator runbook.
- Each major failure mode has at least one observation path and one recovery step.

## Defaults And Assumptions

- Process strictness is strict MVP gate.
- ChatGPT 5.4 and Codex are expected to be used consistently on this project.
- Codex is the default implementation agent.
- ChatGPT 5.4 is the default planning and review agent.
- The project should optimize for the fastest path to a truthful, demoable, hosted MVP.
- Architectural elegance is secondary to MVP correctness and momentum.
- Alerts are not assumed to be part of launch unless provider-backed delivery is actually completed.
- Admin functionality is not assumed to be public-facing for MVP.
- The immediate next execution task is Milestone 1: make the app build cleanly and keep it build-clean.
