# AI sessions used for Switchboard

Every Claude Code session used for this project, one Markdown file per session, in the order the sessions were created. Each file is a conversation extract: the messages between me and the assistant, the briefs the assistant gave to subagents and the subagents' reports. Tool calls, tool output and file contents are left out. The text is not edited.

All five sessions began as one conversation (12:43 on 27 November 2026) and were later forked, so they share their early history. That shared history is written once, in the earliest file that contains it, and each later file starts where it diverged.

| File | Session | What it holds |
| --- | --- | --- |
| `01-root-problem-statement-review-c73403cc.md` | Original session | Reading the brief, the plan, the environment probe, phases 0 and 1, and the first brief for phase 2. |
| `02-fork-rev-2-02c65892.md` | Fork `problem-statement-rev-2` | Fork taken part way through the original session. It added nothing of its own. |
| `03-fork-rev-3-5bd290f6.md` | Fork `problem-statement-rev-3` | A short conversation on top of the original session: restyling the frontend, pushing the result to GitHub, and starting the local server. |
| `04-fork-e5b19899.md` | Fork "Problem statement review (fork)" | The frontend, phase 2 and phase 3 work, the Linux check run, and the README and decisions documents. |
| `05-fork-50d4f147.md` | Continuation of the same fork | The most recent messages, about this folder. |

Subagents (smaller assistants started by the session to build one piece each) have no separate files. Each file includes the brief the subagent was given and the report it returned.
