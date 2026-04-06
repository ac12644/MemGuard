# Contributing to MemGuard

Thank you for your interest in contributing to MemGuard. This guide will help you get started.

## Development Setup

### Prerequisites

- Python 3.12+
- Node.js 20+
- Docker & Docker Compose
- [uv](https://github.com/astral-sh/uv) (recommended) or pip

### Getting Started

```bash
# Clone the repo
git clone https://github.com/ac12644/MemGuard.git
cd MemGuard

# Start dependencies
docker-compose up -d postgres redis

# Backend
uv venv && uv pip install -e ".[dev]" psycopg2-binary
source .venv/bin/activate
alembic upgrade head
uvicorn src.main:app --reload --port 8001

# Dashboard (separate terminal)
cd dashboard && npm install && npm run dev
```

### Running Tests

```bash
# Unit tests (fast, no DB required)
pytest tests/unit/ -v

# Integration tests (requires running server)
pytest tests/integration/ -v

# Lint
ruff check src/ tests/

# Dashboard type check
cd dashboard && npx tsc --noEmit
```

## How to Contribute

### Reporting Bugs

- Open an issue with a clear title and description
- Include steps to reproduce, expected behavior, and actual behavior
- Add relevant logs or screenshots

### Suggesting Features

- Open an issue with the `enhancement` label
- Describe the problem you're solving and your proposed solution
- Consider how it fits with the existing architecture

### Pull Requests

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Run tests: `pytest tests/unit/ -v`
5. Run lint: `ruff check src/ tests/`
6. Commit with a clear message
7. Push and open a PR against `main`

### PR Guidelines

- Keep PRs focused on a single change
- Add tests for new functionality
- Update docs if you change API behavior
- Follow the existing code style

## Code Style

### Python (Backend)

- **Async everywhere** for DB and HTTP operations
- **Type hints** on all function signatures
- **Pydantic** for API input/output validation
- **SQLAlchemy ORM** for all database queries (no raw SQL)
- **120 character** line length (enforced by Ruff)
- **Google-style** docstrings on public functions
- **snake_case** for variables, functions, modules

### TypeScript (Dashboard)

- **camelCase** for variables and functions
- **PascalCase** for components
- Prefer **functional components** with hooks
- Use **@tanstack/react-query** for data fetching
- Follow the Obsidian Intelligence design system tokens

### Commit Messages

Use clear, imperative-mood messages:

```
Add Zep connector with graph search support
Fix trust score calculation for zero-retrieval memories
Update dashboard memory cards with expand/collapse
```

## Architecture Overview

```
src/
  api/routes/      # FastAPI route handlers
  connectors/      # Memory system adapters (implement BaseConnector)
  engine/          # Validation strategies + trust scoring
  models/          # SQLAlchemy ORM models
  scheduler/       # Celery tasks + prioritizer
  quarantine/      # Quarantine management
  mcp/             # MCP server for agent integration
  utils/           # Shared utilities

dashboard/src/
  pages/           # Route-level page components
  components/      # Shared UI components
  api/client.ts    # API client (typed fetch wrapper)
```

### Adding a New Connector

1. Create `src/connectors/myconnector.py` implementing `BaseConnector`
2. Add it to `src/connectors/registry.py`
3. Add a form section in `dashboard/src/pages/Connectors.tsx`
4. Add tests in `tests/unit/test_myconnector.py`

### Adding a New Validation Strategy

1. Create `src/engine/strategies/mystrategy.py`
2. Register it in `src/engine/validator.py`
3. Add a strategy card in `dashboard/src/pages/Validations.tsx`
4. Add tests in `tests/unit/test_mystrategy.py`

## License

By contributing, you agree that your contributions will be licensed under the Apache License 2.0.
