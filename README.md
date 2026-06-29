# WineOps

WineOps is an IoT fermentation monitoring platform for home winemaking.

The project combines Raspberry Pi edge devices, cloud services, databases, dashboards, and alerting systems to monitor and eventually control temperature-sensitive wine fermentations.

## Goals

- Monitor fermenter temperatures
- Monitor water bath temperatures
- Track ambient room conditions
- Store historical data
- Visualize fermentation trends
- Generate alerts for temperature excursions
- Enable future automated temperature control

---

# Current Status

WineOps currently supports:

- Raspberry Pi temperature collection
- DS18B20 temperature sensors
- Supabase data storage
- Fastify backend API
- React dashboard
- Cloud deployment

---

# Architecture
```text
                    WineOps
     +-------------+      +-------------+
     | Raspberry   |      | Raspberry   |
     | Pi Sensor 1 |      | Pi Sensor 2 |
     +-------------+      +-------------+
            |                    |
            +---------+----------+
                      |
                      v
                Supabase DB
                      |
                      v
                Fastify API
                      |
                      v
                React Dashboard
```

---

## Data Flow
1. Raspberry Pi reads DS18B20 sensor values
2. Sensor collector sends readings to Supabase
3. Fastify API exposes readings
4. React dashboard displays current temperatures

# Technology Stack

## Edge Devices
WineOps uses Raspberry Pi devices as edge sensor nodes.

Each device:

- Reads DS18B20 temperature sensors
- Identifies connected sensors
- Sends readings to the cloud database
- Runs independently from the dashboard

Current devices:
- Raspberry Pi 4
- Raspberry Pi 3A+

Each Pi contains:
- sensor collection scripts
- device-specific configuration

## Database

- PostgreSQL
- Supabase

Database resources live in:

```
database/
```

Includes:

- database documentation
- views
- SQL definitions

## Backend

- Node.js
- TypeScript
- Fastify
- Supabase client

Location:

```
backend/
```

Responsibilities:

- Serve sensor readings
- Provide API endpoints
- Handle database access
- Provide health checks

Current endpoints:

```
GET /health

GET /api/readings/latest
```

## Frontend

- React
- Vite
- TypeScript

Location:

```
frontend/
```

Current features:

- Display latest sensor readings
- Connect to backend API
- Show fermentation temperatures

---

# Deployment

## Live Application

Frontend:
https://wineops.vercel.app

Backend:
https://wineops-backend.onrender.com

## Frontend

Hosted on:

Vercel

Environment variables:

```
VITE_API_URL
```

Points to the backend API.

## Backend

Hosted on:

Render

Environment variables:

```
SUPABASE_URL
SUPABASE_KEY
FRONTEND_URL
```

## Database

Hosted on:

Supabase

---

# Local Development

## Backend

```bash
cd backend

npm install

npm run dev
```

Runs:

```
http://localhost:3000
```

Health check:

```bash
curl localhost:3000/health
```

---

## Frontend

```bash
cd frontend

npm install

npm run dev
```

Runs:

```
http://localhost:5173
```

---

# Project Structure

```text
wineops/
├── devices/
├── backend/
│   ├── src/
│   └── package.json
│
├── frontend/
│   ├── src/
│   └── package.json
│
├── database/
│   ├── README.md
│   └── views.sql
│
└── README.md
```

---

# Roadmap

## Monitoring

- [x] Collect temperature readings
- [x] Store readings in database
- [x] API endpoint for latest readings
- [x] Web dashboard
- [x] Deploy cloud application

## Dashboard

- [ ] Auto-refresh readings
- [ ] Sensor naming
- [ ] Temperature history charts
- [ ] Fermentation timelines
- [ ] Batch tracking

## Intelligence

- [ ] Temperature alerts
- [ ] Fermentation phase detection
- [ ] Wine profile history
- [ ] Analytics

## Automation (Future)

- [ ] Water bath control
- [ ] Temperature regulation
- [ ] Automated fermentation management

---

WineOps is an ongoing project combining software engineering, IoT, and winemaking into a practical fermentation monitoring platform.