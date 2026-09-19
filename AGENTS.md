# WineOps

WineOps is an early-stage IoT fermentation-monitoring project for home winemaking.

## Map

- `device/raspberry-pi/` reads DS18B20 sensors and writes readings directly to Supabase.
- `database/` holds the checked-in SQL migrations and the latest-reading view.
- `backend/` is a Fastify API that reads Supabase data for clients.
- `frontend/` is the React/Vite dashboard and calls the backend API.

The currently implemented data path is: Raspberry Pi → Supabase → Fastify API → React dashboard. Keep these existing boundaries explicit; the frontend does not query Supabase directly.

## Current domain facts

- Temperature values are stored and exchanged as `temperature_c`; the frontend may format them for display.
- Each Pi reporter is configured with a stable `DEVICE_ID` and sends it with every new reading. Device health is inferred from stored sensor readings; there are no heartbeats.
- A `sensors` row identifies physical hardware by `hardware_id`. A `monitoring_points` row identifies the thing being observed. `sensor_assignments` records their time-bounded relationship, which the experiment API resolves when assembling historical series.
- Do not assume unimplemented reliability features exist. In particular, the current Pi reporter has no persistent offline queue or retry/deduplication mechanism.

## Navigation and verification

Read the scoped `AGENTS.md` before changing a component. Root documentation in [README.md](README.md) describes the current system and local development; database and Pi setup details live in their respective READMEs.

Run verification from the changed component directory using the commands documented in its scoped file. There is no repository-wide package script.

Keep these files brief and update them only when a convention or constraint is established in the repository.
