# Project Rules

These rules apply to every task in this project.

1. **Read and maintain project memory**
   - At the start of meaningful work, read `rules.md`, `project_context.md`, and `chat.md` in that order.
   - If any file does not exist, create it from the project template without overwriting existing content.
   - Before finishing each meaningful task, update both `chat.md` and `project_context.md` with relevant requirements, decisions, work status, client communication, and validation results.
   - Keep `chat.md` to durable information only; do not copy the full chat transcript.

2. **Client-facing messages**
   - When drafting a message, question, or update for the client, provide it in one clean plain-text copy box.
   - Use short, human language with clear spacing and line breaks so it can be pasted into WhatsApp without breaking the formatting.
   - Mention only what the client needs to know. Do not include internal development details, commands, implementation debate, or unnecessary technical terms.

3. **Efficient project reading**
   - Do not repeatedly scan generated or dependency folders unless the task directly requires them. Normally exclude: `node_modules/`, `vendor/`, `.git/`, `.next/`, `dist/`, `build/`, `coverage/`, `.cache/`, `tmp/`, and virtual-environment folders.
   - Read targeted source, configuration, documentation, test, and log files instead of repeatedly reading the entire project.

4. **Testing and temporary files**
   - Test relevant changes before marking them complete.
   - Do not delete or overwrite user-created files, existing tests, build outputs needed by the project, or anything whose ownership is unclear.
   - Remove only temporary/debug files created during the current work after successful testing. Keep useful test scripts, screenshots, fixtures, and evidence in `testing/` (or the project's existing test folder) when they are needed again.

5. **Requirement and task tracking**
   - Add each new requirement to `project_context.md` as soon as it is understood.
   - Mark work as `In progress`, `Pending`, `Blocked`, or `Completed`; do not silently lose unfinished work.
   - Record each client query/update in the client communication log and move it from waiting to answered when resolved.

6. **Clear scope and concise answers**
   - Answer the client directly and to the point. Explain technical detail only when it affects their decision, timeline, cost, or required action.
   - Do not make irreversible, out-of-scope, or access-sensitive changes without clear approval.

7. **Privacy, accuracy, and handover**
   - Never write passwords, API keys, tokens, payment details, or private credentials into Markdown files, source code, messages, screenshots, or logs.
   - State assumptions and blockers clearly. Do not claim a change is complete until it has been verified.
   - At meaningful milestones, leave the project in a handover-ready state: documentation current, temporary files cleaned, and next action clear.

