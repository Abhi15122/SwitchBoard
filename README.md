# Switchboard

A shared team inbox. Customers write to a business through a messaging provider (Pigeon, simulated). Support agents sign in, watch conversations arrive in real time, claim them, reply and see delivery status. Several businesses (workspaces) share one deployment and never see each other's data.

```
simulated customers -> Pigeon :4010 --webhook--> server :4000 --WebSocket--> React app :5173
agent reply         -> server -> POST /v1/messages on Pigeon -> status webhooks back
```

## Run it from a clean clone

Needs Node 22 and Docker.

```
npm run up                  # MongoDB, Redis, Pigeon, the IdP and Paybox, in Docker
npm run scaffold:install    # installs server and web dependencies
npm run scaffold:server     # server on http://localhost:4000
npm run scaffold:web        # React app on http://localhost:5173
```

Open http://localhost:5173 and sign in as one of the test users on the IdP page (Asha and Ben in `ws_acme`, Chloe and Dev in `ws_globex`, Eli in both). Make a customer write in with `npm run inbound`. `npm run quiet` stops the automatic trickle of customer messages and `npm run drizzle` turns it back on.

The server reads every address and secret from the environment (see `.env.example`). Defaults match the Docker services, so no `.env` file is needed. Set `COOKIE_SECURE=1` when serving over https.

`switchboard.json` holds the install and start commands the grader uses:

```
install: npm run scaffold:install
start:   npm --prefix scaffold/server start      (health: /healthz)
```

## Tests and checks

```
npm --prefix scaffold/server test     # server unit tests (the Redis test skips if Redis is down)
npm --prefix scaffold/web test        # inbox reducer tests
npm --prefix scaffold/server run typecheck
npm --prefix scaffold/web run typecheck
```

The check is the program the graders run. It deletes application data and starts the server itself, so stop your dev server first.

| Command | What it does |
| --- | --- |
| `npm run check` | Level 1 of the official harness. Needs Linux (see below). |
| `npm run check:full` | Levels 1, 2, 3 and 5 of the official harness. Needs Linux. |
| `npm run check:linux` | Runs the unmodified `harness/check.js --full` inside a Node 22 Linux container on a private compose network (project `sbcheck`). Works from Windows and macOS. |
| `npm run check:win:full` | `harness/check.win.js`, a local copy for native Windows. It differs only in how it starts `sh` and kills a process tree. Its results are not official. |

On native Windows `harness/check.js` cannot kill a process group, so levels 2 and 3 would measure nothing. Use `check:linux` there.

## How it is built

All state lives in MongoDB and Redis. The server keeps nothing in memory that matters, so any copy can serve any request and any copy can be killed with `kill -9`.

| Piece | Where | What it does |
| --- | --- | --- |
| Webhook intake | `webhooks.ts`, `signature.ts` | Verifies the HMAC over the raw body, rejects stale timestamps, stores each message once by `(workspace, messageId)`, orders by `(occurredAt, messageId)` at read time, and answers 2xx only after the message, conversation and feed frame are written. |
| Feed | `feed.ts` | One document per change with a per-workspace increasing `seq` and a unique dedupe key. It backs the WebSocket and replay. |
| Outbox and worker | `conversations.ts`, `worker.ts`, `pigeon.ts`, `gate.ts` | A reply is stored first (unique on `(workspace, client_ref)`), then every copy runs a worker that claims due rows with a 15 s lease. The Pigeon `Idempotency-Key` is the `client_ref`, so a retry after a timeout or a crash cannot send twice. A shared Redis token bucket (burst 4, 3 per second) and shared cool-off keep all copies inside Pigeon's per-workspace limit. |
| Login | `oidc.ts`, `auth.ts`, `session.ts` | Authorization code with PKCE. State and sessions live in Redis. The ID token is verified with RS256 against the IdP's keys. |
| Access | `access.ts` | 401 without a session, 403 for a workspace you are not in. Writes check the Origin header. |
| API | `api.ts` | `/api/me`, `/api/conversations`, conversation detail, reply, claim, release, close, reopen. |
| WebSocket | `ws.ts` | `/ws?workspace=&after=`. Reads the Mongo feed, so a client on one copy sees what another copy processed. Replays everything after `after`, then continues live. |
| Grader endpoints | `grader.ts` | Reset, snapshot, reply and claim, behind `x-grader-token`. They call the same functions the API uses. |
| Frontend | `scaffold/web` | React, TypeScript and Tailwind. Cookie session, live feed with reconnect and replay, optimistic replies keyed by `client_ref`. |

See `DECISIONS.md` for what was cut, what was assumed and what is known to be wrong.
