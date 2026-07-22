# PilotGPT

PilotGPT is a full-stack flight-operations dashboard for coordinating private-aviation trips. It brings trip requests, aircraft assignments, crew scheduling, flight status, and fuel records into one responsive workspace.

The project is a demo application. It uses JSON files for persistence and is designed for local development or evaluation—not production operations.

## Features

- Operations overview with fleet, crew, trip, flight, and fuel metrics
- Trip request review, approval, rejection, and cancellation workflows
- Aircraft and pilot assignment with capacity, availability, medical, and schedule checks
- Queue for approved trips that still need flight legs
- Flight scheduling with aircraft and pilot conflict detection
- Flight lifecycle tracking from scheduled to departed or completed
- Fleet, pilot roster, and fuel-purchase management
- Responsive React interface with built-in sample data when the API is unavailable
- Interactive OpenAPI documentation for the backend

## Tech stack

- **Frontend:** React, Vite, Lucide React, CSS
- **Backend:** Python 3.12, FastAPI, Pydantic, Uvicorn
- **Storage:** Atomic JSON-file persistence
- **Deployment:** Docker Compose, multi-stage frontend image, Nginx reverse proxy
- **Tests:** Pytest and FastAPI TestClient

## Quick start with Docker

Requirements: Docker with the Compose plugin.

```bash
docker compose up --build
```

Then open:

- Web application: <http://localhost:3000>
- API documentation: <http://localhost:8000/docs>
- Health check: <http://localhost:8000/health>

The frontend proxies `/api` requests to the backend inside the Compose network. Application data is stored in `backend/data/` and mounted into the backend container, so changes persist across container restarts.

Stop the application with:

```bash
docker compose down
```

## Local development

### 1. Start the backend

Requirements: Python 3.12 or newer.

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

The API is available at <http://localhost:8000>, with interactive documentation at <http://localhost:8000/docs>.

### 2. Start the frontend

In a second terminal, using Node.js 22 or newer:

```bash
cd frontend
npm ci
cp .env.example .env
npm run dev
```

Open <http://localhost:3000>. The example environment file points the frontend to `http://localhost:8000/api/v1`.

## Configuration

| Variable | Used by | Default | Purpose |
| --- | --- | --- | --- |
| `VITE_API_URL` | Frontend build | `http://localhost:8000/api/v1` in local development | Base URL for API requests |
| `PILOTGPT_DATA_DIR` | Backend | `backend/data` | Directory containing the JSON collections |
| `CORS_ORIGINS` | Backend | `http://localhost:3000` | Comma-separated frontend origins allowed by CORS |

Vite variables are embedded at build time. When changing `VITE_API_URL` for a container image, rebuild the frontend image.

## Project structure

```text
pilotgpt/
├── backend/
│   ├── app/             # FastAPI routes, models, services, and storage
│   ├── data/            # JSON data collections
│   ├── tests/           # API workflow and validation tests
│   ├── Dockerfile
│   └── requirements*.txt
├── frontend/
│   ├── src/             # React application, API client, styles, and demo data
│   ├── Dockerfile
│   ├── nginx.conf       # Static hosting and API reverse proxy
│   └── package.json
└── compose.yaml
```

## API overview

All application endpoints are under `/api/v1`.

| Resource | Capabilities |
| --- | --- |
| `/dashboard` | Aggregated operational totals |
| `/pilots` | List, create, read, update, and delete pilots |
| `/aircraft` | List, create, read, update, and delete aircraft |
| `/trips` | Manage trip requests and approval workflow |
| `/flights` | Manage flight legs, filters, and status transitions |
| `/fuel-logs` | Manage fuel purchases and calculated costs |

Workflow actions include:

- `POST /api/v1/trips/{id}/approve`
- `POST /api/v1/trips/{id}/reject`
- `POST /api/v1/trips/{id}/cancel`
- `POST /api/v1/flights/{id}/status`

All API datetimes must include a timezone offset, such as `2030-08-01T09:00:00-04:00`.

## Testing and builds

Run the backend test suite:

```bash
cd backend
python -m pytest -q
```

Create a production frontend build:

```bash
cd frontend
npm run build
```

## Data and production considerations

The backend stores each collection as a readable JSON array in `backend/data/`. Writes use an atomic temporary-file swap and are guarded within one process, but the store does not support safe concurrent writes from multiple backend processes.

Before using this application in production, replace the JSON store with a transactional database and add authentication, authorization, audit logging, secrets management, production observability, backups, and deployment-specific CORS configuration.
