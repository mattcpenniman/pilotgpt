# AGENTS.md

## Project Overview

PilotGPT is a demo full-stack flight-operations application.

- `frontend/`: React, Vite, Lucide React, and plain CSS.
- `backend/`: Python 3.12, FastAPI, and Pydantic.
- `backend/data/`: JSON-file persistence used by the running API.
- `backend/tests/`: Pytest API and workflow tests.
- `compose.yaml`: Local Docker deployment for both services.

This is a demo application, not a production aviation system. Do not add production compatibility layers unless explicitly requested.

## Working Guidelines

- Make the smallest change that fully solves the requested problem.
- Preserve existing UI patterns and terminology unless the task calls for a redesign.
- Do not modify unrelated work in a dirty worktree.
- Do not edit generated or installed content in `frontend/dist/`, `frontend/node_modules/`, Python cache directories, or `.pytest_cache/`.
- Keep source files and documentation in ASCII unless existing content requires otherwise.
- Update tests when backend behavior or validation rules change.
- Keep API, frontend demo data, and UI status handling aligned when introducing workflow states.

## Frontend

Frontend source lives in `frontend/src/`.

- `App.jsx` contains the application shell, pages, forms, and UI behavior.
- `api.js` is the API client. All application endpoints use the `/api/v1` prefix.
- `demoData.js` supplies the fallback workspace when the API is unavailable.
- `styles.css` contains shared styles; feature-specific styles may use a separate imported CSS file.
- Use functional React components and hooks consistent with the existing code.
- Use Lucide icons rather than adding another icon dependency.
- Fleet and Pilot Cards use a three-dot action to open a populated edit screen; keep these controls functional and preserve this interaction when changing the cards.
- Resource editors must use the existing `PATCH` API contract and remain usable in the fallback demo workspace.
- Maintain responsive behavior at the existing desktop, tablet, and mobile breakpoints.
- Vite environment variables must use the `VITE_` prefix. The API base is configured with `VITE_API_URL`.

There is currently no frontend lint or unit-test command. Verify frontend changes with:

```bash
cd frontend
npm run build
```

For local development:

```bash
cd frontend
npm ci
npm run dev
```

## Backend

Backend source lives in `backend/app/`.

- `main.py`: FastAPI routes and application setup.
- `models.py`: Pydantic request, response, and domain models.
- `service.py`: Workflow rules, validation, and resource coordination.
- `storage.py`: JSON collection persistence and atomic writes.

Keep route handlers thin. Put cross-resource validation and state transitions in the service layer. Put schema constraints and serialized field definitions in Pydantic models.

Important domain rules include:

- API datetimes must include a timezone offset.
- Trip approval validates aircraft capacity/status, pilot eligibility, and assignment conflicts.
- Flight scheduling validates crew and aircraft assignments and rejects overlapping schedules.
- Flight status transitions follow the supported lifecycle defined by the models and service.
- JSON storage is safe for atomic writes in one process only; do not treat it as a transactional multi-process database.

Do not change files under `backend/data/` merely to exercise behavior. Tests should use temporary data directories, following the existing test fixtures.

Run backend tests with:

```bash
cd backend
python -m pytest -q
```

Install backend development dependencies with:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-dev.txt
```

## Full-Stack Changes

When changing an API shape or workflow:

1. Update backend models and service behavior.
2. Add or update API tests.
3. Update `frontend/src/api.js` if the endpoint contract changed.
4. Update UI handling and `frontend/src/demoData.js` when the new behavior must work in demo mode.
5. Run the backend tests and frontend production build.

## Docker

Build and run the complete application with:

```bash
docker compose up --build
```

The frontend is available on port `3000`, the API on port `8000`, and API documentation at `http://localhost:8000/docs`.

## Before Finishing

- Run the narrowest relevant checks, then the full affected service checks.
- For frontend-only changes, run `npm run build` in `frontend/`.
- For backend changes, run `python -m pytest -q` in `backend/`.
- For cross-stack changes, run both.
- Run `git diff --check` and report any checks that could not be completed.
