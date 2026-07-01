# MCP Activation Audit

Purpose: prevent tool-surface drift. As an MCP server grows, overlapping tools, wordier descriptions, and unclear follow-up flows make agents less likely to call the right tool.

## Prevent Tool-Surface Drift

Start by deciding the activation model, then rewrite the concrete tool descriptions below. The score is secondary metadata; the main goal is to make each tool easy for an agent to choose, skip, or handle safely.

- Surface shape: 8 exposed tools collapse into 8 workflow groups.
- Primary surface: 6 default-visible tools; 1 follow-up/helper tools; 1 admin/destructive tools.
- Overlap diagnosis: 4 overlapping tool findings need merge, rename, or sharper boundaries.
- Flow diagnosis: 1 confirm/reject helper tool should be exposed after a pending action exists, not as primary choices.
- Follow-up distinction: 1 low-risk helper tool reduce default-surface clutter; 0 contribution/submission gate tools may reduce workflow completion.
- Observed activation: not measured yet; add initialize and tools/call logs to prove whether the drift fix increases usage.
- Review priority: Rewrite create_task with concrete "Use when" trigger language and a clearer safe path.
- Tools needing description review: 8 of 8
- Findings to triage: 1 fail, 14 warn, 0 info
- Preferred rewrite shape: short, decisive `Use when` / `Returns` / `Do not use when` / `Safety`.

## Implementation Plan For Cursor/Claude

Feed this section to a coding agent as the concrete fix plan:

- [ ] Export the current MCP tools/list and keep this report plus the JSON audit as the baseline for future PR checks.
- [ ] Define the activation model: default-visible primary tools are `create_task`, `get_doc`, `list_docs`, `run_any_request`, `search_docs`, `update_task`; low-risk contextual follow-up tools are `confirm_task_creation`; contribution/submission gates are none; admin/destructive tools are `delete_task`.
- [ ] Update server registration so contextual follow-up tools are only advertised after a pending action exists, or move them behind a separate admin/profile configuration if the client cannot do contextual exposure.
- [ ] For contribution/submission workflows, add draft/confirmation/posting completion metrics before introducing new safety gates.
- [ ] For every item in Actionable Tool Findings, apply the suggested name/description or an equivalent shorter rewrite with a decisive trigger, return shape, exclusion rule, and safety note.
- [ ] Resolve each Merge/Hide/Split recommendation by merging overlapping capabilities, renaming tools that compete for the same prompt, or making the boundary explicit in `Do not use when` wording.
- [ ] Add or update standard MCP ToolAnnotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) so safety is machine-readable instead of buried in prose.
- [ ] Wire warn-only CI on pull requests with a baseline audit so new tools, overlap, score regressions, and missing descriptions get an advisory PR comment before drift ships.
- [ ] Instrument proof metrics: initialized sessions, tools/list payload bytes, tools/call success/error, missed-prompt replay results, first-tool-call latency, and task completion turns.

## Actionable Tool Findings

### delete_task
- Exposure: Admin, maintenance, or destructive capability should not be exposed to every ordinary agent session by default. Preferred action: admin_profile.
- WARN description_too_short: Description is too short for reliable model selection.
- WARN weak_required_input: Required inputs need clearer descriptions or examples: taskId.
- FAIL unsafe_destructive_tool: Destructive tool lacks explicit confirmation, safety, or review wording.
- WARN tool_overlap: Overlaps heavily with update_task.
- Recommendation: Move to an admin profile unless ordinary users need this in the default surface.
- Current description:

```text
Delete a task.
```

- Suggested rewrite:

```text
Use when: an administrator intentionally needs delete_task maintenance.
Returns: the maintenance result.
Do not use when: serving ordinary user workflows or when a read-only inspection tool would be enough.
Safety: admin/destructive capability; keep out of the default user-facing profile and require explicit operator intent.
```

### confirm_task_creation
- Exposure: Follow-up helper tools are useful after a pending action exists and reduce default-surface clutter without changing the primary completion path. Preferred action: contextual_exposure.
- WARN weak_required_input: Required inputs need clearer descriptions or examples: pendingId.
- Recommendation: Keep for safety, but consider contextual exposure only when there is a pending action.
- Current description:

```text
Confirm a drafted task.
```

- Suggested rewrite:

```text
Use when: a pending task_creation action has already been shown to the user and the user explicitly confirmed it.
Returns: the confirmed result.
Do not use when: starting a new workflow, guessing user intent, or bypassing a preview/draft step.
Safety: confirmation helper; expose contextually only after there is a pending action.
```

### create_task
- WARN description_too_short: Description is too short for reliable model selection.
- WARN weak_required_input: Required inputs need clearer descriptions or examples: title.
- WARN unsafe_write_tool: Write-like tool lacks safety, draft, redaction, or explicit-confirmation wording.
- WARN tool_overlap: Overlaps heavily with update_task.
- Recommendation: Prefer a verb plus concrete domain object in the name.
- Current description:

```text
Create a task.
```

- Suggested rewrite:

```text
Use when: the user needs the task workflow.
Returns: the relevant result.
Do not use when: the task belongs to another workflow or no tool call is needed.
Safety: document whether this tool is read-only, writes data, calls external systems, or requires confirmation.
```

### run_any_request
- WARN weak_required_input: Required inputs need clearer descriptions or examples: method, path.
- WARN unsafe_write_tool: Write-like tool lacks safety, draft, redaction, or explicit-confirmation wording.
- Recommendation: Prefer a verb plus concrete domain object in the name.
- Current description:

```text
Run any request against the workspace API.
```

- Suggested rewrite:

```text
Use when: the user needs the run any request workflow.
Returns: the relevant result.
Do not use when: the task belongs to another workflow or no tool call is needed.
Safety: document whether this tool is read-only, writes data, calls external systems, or requires confirmation.
```

### update_task
- WARN unsafe_write_tool: Write-like tool lacks safety, draft, redaction, or explicit-confirmation wording.
- WARN tool_overlap: Overlaps heavily with create_task.
- WARN tool_overlap: Overlaps heavily with delete_task.
- Current description:

```text
Use when: the user asks to change an existing task's title, body, assignee, due date, or status. Returns the updated task.
```

- Suggested rewrite:

```text
Use when: the user needs the update task workflow.
Returns: the relevant result.
Do not use when: the task belongs to another workflow or no tool call is needed.
Safety: document whether this tool is read-only, writes data, calls external systems, or requires confirmation.
```

### list_docs
- WARN description_too_short: Description is too short for reliable model selection.
- Current description:

```text
List docs.
```

- Suggested rewrite:

```text
Use when: the user needs the list docs workflow.
Returns: the relevant result.
Do not use when: the task belongs to another workflow or no tool call is needed.
Safety: document whether this tool is read-only, writes data, calls external systems, or requires confirmation.
```

### search_docs
- Recommendation: Prefer a verb plus concrete domain object in the name.
- Current description:

```text
Use when: the user needs to find internal docs by keyword, title, owner, or path. Returns matching documents with short snippets and canonical URLs.
```

- Suggested rewrite:

```text
Use when: the user needs the search workflow.
Returns: the relevant result.
Do not use when: the task belongs to another workflow or no tool call is needed.
Safety: document whether this tool is read-only, writes data, calls external systems, or requires confirmation.
```

### get_doc
- Current description:

```text
Use when: the user has a specific document id or URL and needs the full current document body plus metadata.
```

- Suggested rewrite:

```text
Use when: the user needs the doc workflow.
Returns: the relevant result.
Do not use when: the task belongs to another workflow or no tool call is needed.
Safety: document whether this tool is read-only, writes data, calls external systems, or requires confirmation.
```

## Recommended Description Format

Use this structure for tool descriptions, especially for write, destructive, public-posting, or workflow-helper tools:

```text
Use when: the concrete user situation or agent state that should trigger this tool.
Returns: the result shape or decision the agent can expect.
Do not use when: nearby tasks where another tool or no tool is a better choice.
Safety: side effects, confirmation requirements, redaction rules, auth scope, or why the tool is read-only.
```

## Rewritten Tool Descriptions

Keep these rewrites short and activation-oriented. Avoid implementation detail unless it helps the agent choose the correct tool.

### confirm_task_creation -> confirm_task_creation
Profile: core; advisory priority (non-standard MCP hint, most clients ignore): 0.2

Use when: a pending task_creation action has already been shown to the user and the user explicitly confirmed it.
Returns: the confirmed result.
Do not use when: starting a new workflow, guessing user intent, or bypassing a preview/draft step.
Safety: confirmation helper; expose contextually only after there is a pending action.

### create_task -> create_task
Profile: core; advisory priority (non-standard MCP hint, most clients ignore): 0.7

Use when: the user needs the task workflow.
Returns: the relevant result.
Do not use when: the task belongs to another workflow or no tool call is needed.
Safety: document whether this tool is read-only, writes data, calls external systems, or requires confirmation.

### delete_task -> delete_task
Profile: admin; advisory priority (non-standard MCP hint, most clients ignore): 0.1

Use when: an administrator intentionally needs delete_task maintenance.
Returns: the maintenance result.
Do not use when: serving ordinary user workflows or when a read-only inspection tool would be enough.
Safety: admin/destructive capability; keep out of the default user-facing profile and require explicit operator intent.

### get_doc -> get_doc
Profile: core; advisory priority (non-standard MCP hint, most clients ignore): 1

Use when: the user needs the doc workflow.
Returns: the relevant result.
Do not use when: the task belongs to another workflow or no tool call is needed.
Safety: document whether this tool is read-only, writes data, calls external systems, or requires confirmation.

### list_docs -> list_docs
Profile: core; advisory priority (non-standard MCP hint, most clients ignore): 1

Use when: the user needs the list docs workflow.
Returns: the relevant result.
Do not use when: the task belongs to another workflow or no tool call is needed.
Safety: document whether this tool is read-only, writes data, calls external systems, or requires confirmation.

### run_any_request -> run_any_request
Profile: core; advisory priority (non-standard MCP hint, most clients ignore): 0.7

Use when: the user needs the run any request workflow.
Returns: the relevant result.
Do not use when: the task belongs to another workflow or no tool call is needed.
Safety: document whether this tool is read-only, writes data, calls external systems, or requires confirmation.

### search_docs -> search_docs
Profile: core; advisory priority (non-standard MCP hint, most clients ignore): 1

Use when: the user needs the search workflow.
Returns: the relevant result.
Do not use when: the task belongs to another workflow or no tool call is needed.
Safety: document whether this tool is read-only, writes data, calls external systems, or requires confirmation.

### update_task -> update_task
Profile: core; advisory priority (non-standard MCP hint, most clients ignore): 0.7

Use when: the user needs the update task workflow.
Returns: the relevant result.
Do not use when: the task belongs to another workflow or no tool call is needed.
Safety: document whether this tool is read-only, writes data, calls external systems, or requires confirmation.

## Merge/Hide/Split Recommendations

- Hide or move `confirm_task_creation`: Follow-up helper tools are useful after a pending action exists and reduce default-surface clutter without changing the primary completion path. Preferred action: contextual_exposure.
- Hide or move `delete_task`: Admin, maintenance, or destructive capability should not be exposed to every ordinary agent session by default. Preferred action: admin_profile.

## Recommended Tool Set

Use this activation model to keep primary tools from competing with after-action helpers:

### core
Default surface for ordinary agent sessions. Read/feedback/contribution tools stay visible; confirm/reject helpers belong here too but should be exposed contextually, not in the default tools/list.

- `confirm_task_creation` - contextual follow-up (reduces default-surface clutter)
- `create_task`
- `get_doc`
- `list_docs`
- `run_any_request`
- `search_docs`
- `update_task`

### admin
Maintenance and destructive capabilities should not compete with high-value default workflows.

- `delete_task`

## Secondary Summary And CI Metadata

- Tools exposed: 8
- Average discoverability score: 76.4
- Default-visible tools (shown in every session): 6
- Core profile: 7 (6 default-visible + 1 contextual helpers)
- Low-risk follow-up helpers: 1
- Contribution/submission gates to measure: 0
- Admin profile (kept out of the default surface): 1
- Workflow groups: 8
- tools/list payload: 3 KB
- Confirm/reject helpers: 1 (13%)
- Top recommendation: Rewrite create_task with concrete "Use when" trigger language and a clearer safe path.
- CI status: FAIL
- CI findings: 1 fail, 14 warn, 0 info
- Recommended CI posture: advisory PR comment or warn-only check by default; strict failure only for teams that explicitly want blocking policy.

### Strict CI Failures

| Rule | Tool | Message |
| --- | --- | --- |
| unsafe_destructive_tool | `delete_task` | Destructive tool lacks explicit confirmation, safety, or review wording. |

## Proof To Collect Before Monetization

- Tool usage: compare sessions with any tool call before and after the surface change.
- Correct-tool selection: replay missed prompts and track whether the expected tool becomes the top match.
- Failed attempts: compare `tools/call` errors and prompt retries after descriptions are shortened.
- Token/time savings: compare `tools/list` payload size, first-tool-call latency, and total turns to task completion.
- Change confidence: use PR baseline diffs to show which new or edited tools would have caused surface drift.

## Missed-Prompt Coverage Analysis

- No missed prompts were provided.

## Activation And Contribution Funnel

- Solved problem events: not measured
- Draft created events: not measured
- Confirmation shown events: not measured
- Public post events: not measured
- Contribution completion rate: not measured
- generic_problem_solved: not measured - Logs do not include solved-problem events, so the contribution funnel cannot be measured from the true eligibility point.
- draft_created: not measured - No draft-created events were observed. Add instrumentation or make the safe draft tool more visible.
- user_confirmation_shown: not measured - No user-confirmation events were observed. Track when a draft is shown for explicit public-post confirmation.
- public_post_created: not measured - No public-post events were observed.

## Current Tool Surface

| Tool | Workflow | Role | Score | Calls | Errors | Declared priorityHint |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| `confirm_task_creation` | task_creation | confirm | 95 | 0 | 0 |  |
| `create_task` | task | write | 49 | 0 | 0 |  |
| `delete_task` | delete_task | destructive | 53 | 0 | 0 |  |
| `get_doc` | doc | read | 100 | 0 | 0 |  |
| `list_docs` | list_docs | read | 84 | 0 | 0 |  |
| `run_any_request` | run_any_request | write | 68 | 0 | 0 |  |
| `search_docs` | search | read | 92 | 0 | 0 |  |
| `update_task` | update_task | write | 70 | 0 | 0 |  |

## Tool-Level Findings

### confirm_task_creation
- WARN weak_required_input: Required inputs need clearer descriptions or examples: pendingId.
- Recommendation: Keep for safety, but consider contextual exposure only when there is a pending action.

### create_task
- WARN description_too_short: Description is too short for reliable model selection.
- WARN weak_required_input: Required inputs need clearer descriptions or examples: title.
- WARN unsafe_write_tool: Write-like tool lacks safety, draft, redaction, or explicit-confirmation wording.
- WARN tool_overlap: Overlaps heavily with update_task.
- Recommendation: Prefer a verb plus concrete domain object in the name.

### delete_task
- WARN description_too_short: Description is too short for reliable model selection.
- WARN weak_required_input: Required inputs need clearer descriptions or examples: taskId.
- FAIL unsafe_destructive_tool: Destructive tool lacks explicit confirmation, safety, or review wording.
- WARN tool_overlap: Overlaps heavily with update_task.
- Recommendation: Move to an admin profile unless ordinary users need this in the default surface.

### list_docs
- WARN description_too_short: Description is too short for reliable model selection.

### run_any_request
- WARN weak_required_input: Required inputs need clearer descriptions or examples: method, path.
- WARN unsafe_write_tool: Write-like tool lacks safety, draft, redaction, or explicit-confirmation wording.
- Recommendation: Prefer a verb plus concrete domain object in the name.

### search_docs
- Recommendation: Prefer a verb plus concrete domain object in the name.

### update_task
- WARN unsafe_write_tool: Write-like tool lacks safety, draft, redaction, or explicit-confirmation wording.
- WARN tool_overlap: Overlaps heavily with create_task.
- WARN tool_overlap: Overlaps heavily with delete_task.

## A/B Test Plan

- Expose a core profile with only search, feedback, low-friction usage tracking, and safe draft/start contribution tools.
- Rewrite contribution descriptions to separate draft creation from confirmed public publishing.
- Move admin/destructive and confirm/reject helper tools to an admin or contextual surface, then compare first-tool-call and draft-created rates.
- Add setup instructions telling agents to search existing shared solutions before answering from memory.
- Track initialized sessions -> useful tool-call sessions -> draft created -> confirmation shown -> public post created.

## Exact Next Instrumentation To Add

- Emit `initialize`, `tools/list`, and `tools/call` with stable `sessionId` values.
- Emit `solved_problem` when an agent has fixed a generic reusable problem.
- Emit `draft_created`, `user_confirmation_shown`, `public_post_created`, and `policy_block` for the contribution flow.
- Track tool-call errors with `tool_error` or `tools/call` events where `ok` is false.

## Privacy/Safety Friction Review

- Keep public posting behind explicit user confirmation and terms acceptance.
- Make the draft tool safe to call without confirmation because it does not publish.
- Require the draft step to remove secrets, personal data, company/customer names, private URLs, and incident-specific details.
- Set the standard MCP ToolAnnotations (readOnlyHint, destructiveHint, idempotentHint, openWorldHint) on each tool so clients can reason about safety.
- `advisoryPriority` is not a standard MCP annotation and most clients ignore it; the main fix is a smaller default surface with clearer trigger language.
