# Integration Testing Workflow

## Overview

This document describes how to test the Python solver service end-to-end from TypeScript, including running both services concurrently and executing integration tests.

## Architecture

```
TypeScript (Next.js) ←→ Python Solver Service (FastAPI/Modal)
     Client              ↑
        ↓                |
   Generated Types   OpenAPI Spec
```

## Components

### 1. Python Solver Service

- **Location**: `src/solver/`
- **Framework**: FastAPI with Modal deployment
- **Endpoints**:
  - `POST /solve` - Synchronous solve (returns Solution)
  - `POST /solve-async` - Async solve (returns ProblemReceivedResponse)

### 2. TypeScript Client

- **Generated from**: OpenAPI spec (`src/solver/openapi.json`)
- **Output**: `src/python-client/`
- **Wrapper**: `src/lib/python-client.ts` (configures auth/URL)
- **Generator**: `@hey-api/openapi-ts` with Zod validation

### 3. Integration Tests

- **Location**: `src/scripts/smoke-tests/test-solver-service.ts`
- **Tests**:
  - Empty problem
  - Simple driver and rider

## Workflows

### Regenerate TypeScript Client

When you modify Python models or endpoints:

```bash
npm run gen-client
```

This:

1. Dumps OpenAPI spec from FastAPI app (`dump_openapi.py`)
2. Generates TypeScript types and SDK (`openapi-ts`)

**Files generated**:

- `src/python-client/types.gen.ts` - TypeScript type definitions
- `src/python-client/sdk.gen.ts` - API functions
- `src/python-client/zod.gen.ts` - Zod validators
- `src/python-client/client.gen.ts` - HTTP client

### Local Development (Both Services)

Run Python and Next.js concurrently:

```bash
npm run dev:fastapi-only
```

This runs:

- Python: `uvicorn server:webapp --reload --port 8000`
- Next.js: `next dev` (with `GROUPTHERE_SOLVER_API_URL=http://localhost:8000`)

**Note**: Make sure `.env` has `GROUPTHERE_SOLVER_API_KEY` set.

### Local Development (Python Only)

Run just the Python service:

```bash
# Option 1: Local FastAPI (port 8000)
npm run python:dev-fastapi

# Option 2: Local Modal serve
npm run python:dev

# Option 3: Local FastAPI (alternate command)
npm run python:dev-fastapi-2
```

### Run Integration Tests

#### Against Production

```bash
npm run smoke-test-solver-service
```

Uses `$PRODUCTION_GROUPTHERE_SOLVER_API_URL` from `.env`.

#### Against Local Server

```bash
# Terminal 1: Start local Python server
npm run python:dev-fastapi

# Terminal 2: Run tests against localhost
GROUPTHERE_SOLVER_API_URL=http://localhost:8000 \
  npm run script src/scripts/smoke-tests/test-solver-service.ts
```

### Manual Integration Test (Step-by-Step)

For debugging, run services and tests separately:

```bash
# Terminal 1: Start Python server
source activate
cd src/solver
uv run uvicorn server:webapp --reload --port 8000

# Terminal 2: Test with curl
curl -X POST http://localhost:8000/solve \
  -H "Authorization: Bearer $GROUPTHERE_SOLVER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "test-1",
    "event_id": "event-1",
    "trippers": [],
    "tripper_distances": []
  }'

# Terminal 3: Run TypeScript integration test
GROUPTHERE_SOLVER_API_URL=http://localhost:8000 \
  npm run script src/scripts/smoke-tests/test-solver-service.ts
```

## Environment Variables

Required in `.env`:

```bash
# For authentication
GROUPTHERE_SOLVER_API_KEY=your-secret-key

# For local development
GROUPTHERE_SOLVER_API_URL=http://localhost:8000

# For production testing
PRODUCTION_GROUPTHERE_SOLVER_API_URL=https://your-modal-url.modal.run
```

## Deployment

### Deploy to Modal

```bash
npm run python:deploy
```

This deploys the solver to Modal and provides a production URL.

### Update Production URL

After deployment, update `.env`:

```bash
PRODUCTION_GROUPTHERE_SOLVER_API_URL=https://zsiegel92--groupthere-solver-serve-webapp.modal.run
```

## Troubleshooting

### Types Out of Sync

If TypeScript types don't match Python models:

```bash
npm run gen-client
```

### Integration Test Fails

1. Check server is running: `curl http://localhost:8000/docs`
2. Verify API key is set: `echo $GROUPTHERE_SOLVER_API_KEY`
3. Check server logs for errors
4. Ensure models match between Python and TypeScript

### Modal Deployment Issues

```bash
# Check deployment status
uv run --directory src/solver modal app logs groupthere-solver

# Re-deploy
npm run python:deploy
```

## Testing Checklist

Before committing changes to Python models:

- [ ] Run `npm run python:check-all` (type check, lint, format, tests)
- [ ] Run `npm run gen-client` to update TypeScript types
- [ ] Run local integration test against `http://localhost:8000`
- [ ] Deploy to Modal with `npm run python:deploy`
- [ ] Run `npm run smoke-test-solver-service` against production
- [ ] Commit both Python and generated TypeScript files

## Quick Reference

```bash
# Full Python checks
npm run python:check-all

# Regenerate client
npm run gen-client

# Local dev (both services)
npm run dev:fastapi-only

# Integration test (production)
npm run smoke-test-solver-service

# Deploy to Modal
npm run python:deploy
```
