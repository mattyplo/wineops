import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { Client, Pool } from "pg";

const databaseUrl = process.env.WINEOPS_TEST_DATABASE_URL;
const migrationsDir = join(import.meta.dirname, "../../../database/migrations");
const test = databaseUrl ? it : it.skip;
const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null;

const activeSensor = "28-00000021a7d3";
const inactiveSensor = "28-00000021a7d4";

function uuid(suffix: string) {
  return `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
}

function batch(readings: object[]) {
  return JSON.stringify(readings);
}

async function ingest(client: Client | Pool, readings: object[]) {
  return client.query(
    "SELECT * FROM ingest_temperature_readings($1, $2::jsonb)",
    ["integration-pi", batch(readings)],
  );
}

async function applyMigrations(numbers: string[]) {
  for (const number of numbers) {
    const file = (await (await import("node:fs/promises")).readdir(migrationsDir))
      .find((name) => name.startsWith(number));
    assert.ok(file, `migration ${number} exists`);
    await pool!.query(await readFile(join(migrationsDir, file), "utf8"));
  }
}

describe("migration 005 reading ingestion RPC (real PostgreSQL)", { skip: !databaseUrl }, () => {
  before(async () => {
    // This suite must target a disposable, empty PostgreSQL database. The
    // migrations create application tables in public and are never safe for a
    // shared or production database.
    const existing = await pool!.query(
      "SELECT to_regclass('public.temperature_readings') AS readings",
    );
    assert.equal(existing.rows[0].readings, null,
      "WINEOPS_TEST_DATABASE_URL must point to an empty disposable database");
    await pool!.query("DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$");
    await pool!.query("DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$");
    await pool!.query("DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$");
    await applyMigrations(["001", "002", "003", "004"]);
    await pool!.query(
      "INSERT INTO temperature_readings (sensor_id, temperature_c, reading_timestamp) VALUES ($1, 19.5, '2026-10-26T10:00:00Z')",
      [activeSensor],
    );
    await applyMigrations(["005"]);
    await pool!.query(
      "INSERT INTO sensors (hardware_id, state) VALUES ($1, 'ACTIVE'), ($2, 'INACTIVE')",
      [activeSensor, inactiveSensor],
    );
  });

  after(async () => {
    await pool?.end();
  });

  test("preserves legacy rows and dashboard latest-reading compatibility", async () => {
    const row = await pool!.query(
      "SELECT reading_id IS NOT NULL AS has_reading_id FROM temperature_readings WHERE sensor_id = $1",
      [activeSensor],
    );
    const latest = await pool!.query(
      "SELECT sensor_id FROM latest_temperature_readings WHERE sensor_id = $1",
      [activeSensor],
    );
    assert.equal(row.rows[0].has_reading_id, true);
    assert.equal(latest.rows.length, 1);
  });

  test("accepts identical concurrent submissions exactly once", async () => {
    const reading = { reading_id: uuid("1"), sensor_id: activeSensor, temperature_c: 22.625, reading_timestamp: "2026-10-26T10:01:02.123456Z" };
    const [first, second] = await Promise.all([ingest(pool!, [reading]), ingest(pool!, [reading])]);
    const totalInserted = first.rows[0].inserted_count + second.rows[0].inserted_count;
    const totalDuplicates = first.rows[0].duplicate_count + second.rows[0].duplicate_count;
    assert.equal(totalInserted, 1);
    assert.equal(totalDuplicates, 1);
  });

  test("rejects conflicting concurrent reuse of a reading UUID", async () => {
    const id = uuid("2");
    const results = await Promise.allSettled([
      ingest(pool!, [{ reading_id: id, sensor_id: activeSensor, temperature_c: 20, reading_timestamp: "2026-10-26T10:02:00Z" }]),
      ingest(pool!, [{ reading_id: id, sensor_id: activeSensor, temperature_c: 21, reading_timestamp: "2026-10-26T10:02:00Z" }]),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  });

  test("rolls back an entire batch when any sensor is unknown or inactive", async () => {
    const id = uuid("3");
    await assert.rejects(
      ingest(pool!, [
        { reading_id: id, sensor_id: activeSensor, temperature_c: 20, reading_timestamp: "2026-10-26T10:03:00Z" },
        { reading_id: uuid("4"), sensor_id: inactiveSensor, temperature_c: 20, reading_timestamp: "2026-10-26T10:03:00Z" },
      ]),
      /unknown or inactive sensor/,
    );
    const persisted = await pool!.query("SELECT count(*)::int AS count FROM temperature_readings WHERE reading_id = $1", [id]);
    assert.equal(persisted.rows[0].count, 0);
  });

  test("retains measurement timestamp precision and real temperature value", async () => {
    const id = uuid("5");
    await ingest(pool!, [{ reading_id: id, sensor_id: activeSensor, temperature_c: 22.625, reading_timestamp: "2026-10-26T10:04:05.123456+00:00" }]);
    const stored = await pool!.query(
      "SELECT temperature_c::text, reading_timestamp::text FROM temperature_readings WHERE reading_id = $1",
      [id],
    );
    assert.equal(stored.rows[0].temperature_c, "22.625");
    assert.match(stored.rows[0].reading_timestamp, /2026-10-26 10:04:05\.123456\+00/);
  });

  test("restricts RPC execution to service_role", async () => {
    const grants = await pool!.query(
      "SELECT has_function_privilege('service_role', 'ingest_temperature_readings(text, jsonb)', 'EXECUTE') AS service_can_execute, has_function_privilege('anon', 'ingest_temperature_readings(text, jsonb)', 'EXECUTE') AS anon_can_execute",
    );
    assert.equal(grants.rows[0].service_can_execute, true);
    assert.equal(grants.rows[0].anon_can_execute, false);
  });
});
