# Decisions

## What I built

- **Webhook intake.** Each message from the messaging provider is stored exactly once and shown in its true order. Forged requests and requests with an old timestamp are rejected. The server answers "success" only after the message has been written to the database.
- **Reliable sending of replies.** A reply is saved first, and then a background worker running inside every copy of the server sends it to the messaging provider. Each reply is marked with a stable identifier, so a repeated attempt can never cause the customer to receive it twice. All copies share one rate limiter, so together they stay inside the provider's limit. A reply survives the provider's "too many requests" answers, temporary failures, slow responses and complete outages. It also survives a forceful kill of the server and the permanent loss of one copy.
- **Login.** Sign-in uses the OpenID Connect standard with the Proof Key for Code Exchange protection. The identity provider says who the person is and which workspaces and roles they have. Sessions are kept in Redis, so any copy of the server can recognise a signed-in person.
- **Web interface for the frontend.** It lists conversations, shows one conversation in full, sends a reply, and lets an agent claim, release, close and reopen a conversation. Every request is checked against the person's workspace membership, so one business can never see another business's data.
- **Live updates.** A WebSocket connection pushes new messages, status changes and assignments to the browser. Every change carries a sequence number that only goes up within a workspace. A browser that reconnects asks for everything after the last number it saw, so it misses nothing. The updates are read from the database, so a browser connected to one copy of the server sees what another copy processed.
- **Frontend.** A React application written in TypeScript and styled with Tailwind CSS: sign-in, inbox, conversation view, reply box with live delivery status, and workspace switching for people who belong to two workspaces.
- **Tests.** Automated tests cover the webhook signature check, the identity token check, cookie handling, the access rules, the rate limiter, how replies to the messaging provider are classified, the ordering rule for live updates, and the frontend state logic.
- **A way to run the official check on Windows.** The official check program cannot stop a whole group of processes on native Windows, so levels 2 and 3 would measure nothing there. The command `npm run check:linux` runs the unmodified check program inside a Linux container instead.

## What I cut, and why

- **Encrypted private notes and the `PROTOCOL.md` document.** Not attempted. I put the five graded levels first.
- **Search with Elasticsearch.** Not built. It is optional and is only reviewed by reading the code.
- **Billing with Paybox.** Not built. It is a bonus and never makes up for a failed level.

## What I assumed where the brief says nothing

- **Administrator role.** An administrator may release a conversation that another agent holds. An ordinary agent may claim, reply, close and reopen, and may release only a conversation they hold themselves.
- **Reopening a conversation.** A new customer message reopens a closed conversation. A reply sent by an agent also reopens it.
- **Sessions.** A session lasts 8 hours. Roles are read from the identity token when the person signs in and are not refreshed during the session.
- **Sending speed.** Each workspace is limited to a burst of 4 messages and then 3 messages per second. This is below the provider's own limit of a burst of 8 and 4 per second, so the provider never has to refuse us. A temporary failure is retried without end, waiting longer each time up to a maximum of 5 seconds. Any other client error from the provider, apart from "too many requests", marks the reply as failed.
- **Sizes.** A reply may be at most 2000 characters, and the inbox is shown 20 conversations at a time.
- **Customer identity.** A customer is identified by the phone number exactly as the messaging provider sends it.

## What I know is still wrong or unproven

- **What the check proves and what it does not.** `CHECK_REPORT.json` was produced by the unmodified check program running on Linux with Node 22, through `npm run check:linux`. It scored 75 of 75. That is one run, and the check has random parts, for example the moment at which it forcefully kills the server in level 2. Level 4 (the written rules) is not part of the public check and is covered only by my own automated tests.
- **Ordering of live updates.** A sequence number is reserved before the change is written, so a change with a lower number can become visible slightly after one with a higher number. The live connection waits about 300 milliseconds for such a gap to fill and then skips it. A write slower than that would be missed by a client that stays connected until it reconnects.
- **Load from live connections.** Each live connection asks the database for new changes every 1.5 seconds and whenever it is woken up. That is fine at this size but would not scale to thousands of connections.
- **Resetting the data.** The reset endpoint restarts the sequence numbers at 1. Live connections are closed with code 4000, and the browser starts again from 0, but the inbox list keeps the conversations it has already loaded until the page is refreshed.
- **Missing status updates on reopening.** When a conversation is reopened by a new customer message or by a reply, no "conversation status" update is sent over the live connection. The frontend loads the data again after those events, so what the person sees is correct, but another program listening to the live connection would not learn the new status.
- **Late duplicates reopen conversations.** A delayed duplicate of an old customer message reopens a conversation that an agent has just closed.
- **Unlimited reads.** The snapshot endpoint reads every message, and the endpoint that shows one conversation has no limit on how many messages it returns.
- **Shutdown and Redis outages.** When the server stops normally, the worker does not wait for replies that are still being sent. If Redis is unavailable, replies the worker has claimed wait until their 15 second lease runs out before another copy can take them.
- **Cookie without the secure flag.** The session cookie is only marked as secure when the environment variable `COOKIE_SECURE=1` is set, because the development setup uses a plain unencrypted web connection.
