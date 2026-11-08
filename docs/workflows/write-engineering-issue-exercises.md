# Ticket-writing workflow exercises

These are private drafting exercises, not new or rewritten GitHub issues. They test the workflow against existing WineOps evidence and show the expected level of detail.

## Straightforward: run the ingestion concurrency suite

**Source problem:** [#53](https://github.com/mattyplo/wineops/issues/53). `backend/test/database/reading-ingestion.integration.test.ts` contains the real PostgreSQL concurrency tests, but registers them as skipped when `WINEOPS_TEST_DATABASE_URL` is absent. The test setup rejects a non-empty target database before applying migrations.

### Draft: Validate the ingestion concurrency suite on a disposable database

#### Problem

The ingestion RPC's concurrent replay and conflict behavior has not been executed in the real PostgreSQL suite because no disposable test database URL is configured. This leaves database-level concurrency coverage unverified.

#### Context

- **Evidence:** `backend/test/database/reading-ingestion.integration.test.ts` conditionally skips the suite without `WINEOPS_TEST_DATABASE_URL` and requires an empty database.
- **Known:** The suite applies migrations and creates roles; production and shared databases are unsafe targets.
- **Assumptions / unverified:** The suite will pass once a suitable database is available.

#### Desired Outcome

The existing concurrency suite has recorded results from an isolated, disposable PostgreSQL database.

#### Acceptance Criteria

- [ ] The suite runs rather than skips against an empty, disposable database.
- [ ] Results cover concurrent identical UUID replay and conflicting UUID reuse.
- [ ] The command, non-secret environment requirements, pass/fail results, and deviations are recorded.
- [ ] The disposable database is cleaned up after the run.

#### Verification

Run `npm run test:database` from `backend/` with `WINEOPS_TEST_DATABASE_URL` set to the isolated database, then record the result without exposing credentials.

**Evaluation:** The evidence supplies the scope and safety boundary, so no clarification was needed. Four outcome-focused criteria were sufficient; no implementation was prescribed.

## Ambiguous: preserve readings during delivery outages

**Source problem:** `device/raspberry-pi/AGENTS.md` and [#4](https://github.com/mattyplo/wineops/issues/4). The reporter sends individual readings to Fastify and currently has no persistent offline queue, retry/backoff, or deduplication behavior. The exact retention limit and full-queue policy are not established.

### Draft: Preserve Pi observations during temporary delivery outages

#### Problem

When Fastify or the network is unavailable, the reporter has no durable way to retain undelivered observations. A temporary delivery failure can therefore leave an observation unavailable for later submission.

#### Context

- **Evidence:** `device/raspberry-pi/AGENTS.md` documents that the reporter continues after submission errors but has no persistent offline queue, retry/backoff, or deduplication behavior.
- **Known:** Readings must use the Fastify ingestion API, retain their original timestamp and stable identity, and survive reporter restart or Pi reboot.
- **Assumptions / unverified:** Expected outage duration, acceptable storage budget, and the product policy when retained storage is full are not yet defined.

#### Desired Outcome

Temporary delivery outages do not silently discard observations, and recovered delivery preserves their original measurement identity and time.

#### Acceptance Criteria

- [ ] During a simulated API or network outage, sampling continues and undelivered observations remain recoverable across a reporter restart.
- [ ] After recovery, retained observations are delivered through Fastify with their original IDs and timestamps, without duplicate stored readings.
- [ ] Retained-storage capacity, replay behavior, and full-capacity behavior are documented and observable.
- [ ] Tests cover outage, recovery, restart persistence, and ambiguous delivery retry behavior.

#### Verification

Simulate an outage and recovery on the reporter, inspect retained observations and logs, and confirm the resulting Fastify-stored readings.

#### Open Questions

- What retention duration or storage budget is acceptable on supported Pi devices?
- When retained storage reaches capacity, which data-loss policy is acceptable, and how must it be surfaced?

**Evaluation:** The exercise avoided selecting a queue format or full-capacity policy. Those choices materially affect behavior, so the unresolved questions remain in the ticket rather than being guessed.
