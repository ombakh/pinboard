# Full-Stack Forum Base (Node.js + React)

This repository is structured for a full-stack forum application:

- `client/`: React frontend (Vite-style structure)
- `server/`: Node.js/Express backend (modular architecture)
- `docs/`: architecture and API notes
- `scripts/`: project automation helpers

## Suggested next steps

1. Install dependencies in `client` and `server`
2. Implement authentication (JWT + refresh token)
3. Expand SQLite schema and add migration/versioning strategy
4. Connect frontend API services to backend routes

## Run locally

1. `npm install`
2. `make dev`

This starts:

- API server: `http://localhost:4000`
- React app: `http://localhost:5173`

Thread data is persisted in SQLite at `server/data/forum.db`.
