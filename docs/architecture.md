# Architecture Notes

## Backend

- Layered modules under `server/src/modules/*`
- `routes` compose module routers
- `services` for business logic
- `db` for ORM/query setup and migrations

## Frontend

- Feature-based organization under `client/src/features/*`
- Shared UI in `components`
- API clients in `services`
- App-wide state in `state`
