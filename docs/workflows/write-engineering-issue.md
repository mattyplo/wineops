# Write an engineering issue

Use this workflow to turn a real WineOps problem into a concise GitHub issue. Its governing principle is: **understand the problem before specifying the solution.** It is ordinary Markdown: humans, ChatGPT, Codex, and other tools should use the same workflow and [template](../templates/engineering-issue.md).

## 1. Discover the problem

Read the applicable `AGENTS.md` files and the smallest set of source material that can establish the problem: code, tests, logs, documentation, a user report, or an existing issue. Capture the evidence and its location. Do not promote a desired feature, a likely cause, or an implementation idea to fact without support.

Separate what you find into:

- **Known facts** — directly supported observations and constraints.
- **Assumptions / unverified points** — plausible but unconfirmed explanations, requirements, or risks.

State the desired outcome in terms of what should be true for the user or system, not the technology or design that might achieve it.

## 2. Clarify only consequential unknowns

Ask the human a concise question when an unanswered point would materially change the problem, scope, safety, or definition of success. Prefer questions that distinguish between real choices; do not ask for implementation decisions merely to fill out a ticket.

Do not delay an issue for every uncertainty. If an answer is unavailable, retain the question or important unverified assumption in the ticket. An issue may explicitly call for investigation.

## 3. Draft the ticket

Start from the [canonical template](../templates/engineering-issue.md).

- Keep **Problem** to 1–3 sentences and cite the relevant evidence in **Context**.
- Include the facts that constrain the work and label assumptions rather than silently resolving them.
- Make **Desired Outcome** implementation-independent.
- Write normally 3–5 small, observable acceptance criteria. Use fewer when the work is genuinely simpler; use more only when necessary to protect a consequential boundary.
- Describe verification that would establish the outcome, including manual or operational checks where appropriate.
- Use **Suggested Implementation**, **Open Questions**, and **Out of Scope** only when they add useful information; remove empty optional sections.

Suggested implementation is advice, not a requirement. A ticket is not an implementation plan or an architecture decision record.

## 4. Review, create, and refine

Before publishing, check that:

- each material claim is either supported by evidence or labeled unverified;
- the outcome and acceptance criteria describe results rather than a prescribed design;
- unresolved consequential questions remain visible; and
- the issue is short enough to read quickly without losing a needed constraint.

Create a GitHub issue only when the requester asks to create one. Initial creation does not require a separate approval step; human review and later editing are expected. When new evidence or answers arrive, update the same ticket rather than inventing certainty retroactively.

## Examples exercised during adoption

See [the lightweight exercise notes](write-engineering-issue-exercises.md) for a straightforward and an ambiguous WineOps problem used to refine this workflow.
