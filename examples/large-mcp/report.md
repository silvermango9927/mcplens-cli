# MCP Activation Audit

Purpose: prevent tool-surface drift. As an MCP server grows, overlapping tools, wordier descriptions, and unclear follow-up flows make agents less likely to call the right tool.

## Prevent Tool-Surface Drift

Start by deciding the activation model, then rewrite the concrete tool descriptions below. The score is secondary metadata; the main goal is to make each tool easy for an agent to choose, skip, or handle safely.

- Surface shape: 16 exposed tools collapse into 14 workflow groups.
- Primary surface: 12 default-visible tools; 2 follow-up/helper tools; 2 admin/destructive tools.
- Overlap diagnosis: 24 overlapping tool findings need merge, rename, or sharper boundaries.
- Flow diagnosis: 2 confirm/reject helper tools should be exposed after a pending action exists, not as primary choices.
- Follow-up distinction: 2 low-risk helper tools reduce default-surface clutter; 0 contribution/submission gate tools may reduce workflow completion.
- Observed activation: not measured yet; add initialize and tools/call logs to prove whether the drift fix increases usage.
- Review priority: Rewrite delete_project with concrete "Use when" trigger language and a clearer safe path.
- Tools needing description review: 16 of 16
- Findings to triage: 1 fail, 44 warn, 1 info
- Preferred rewrite shape: short, decisive `Use when` / `Returns` / `Do not use when` / `Safety`.

## Implementation Plan For Cursor/Claude

Feed this section to a coding agent as the concrete fix plan:

- [ ] Export the current MCP tools/list and keep this report plus the JSON audit as the baseline for future PR checks.
- [ ] Define the activation model: default-visible primary tools are `comment_on_task`, `complete_task`, `create_task`, `find_projects`, `get_project`, `get_user`, `list_project_tasks`, `list_users`, `raw_workspace_api`, `search_projects`, `search_tasks`, `update_task`; low-risk contextual follow-up tools are `confirm_task_update`, `reject_task_update`; contribution/submission gates are none; admin/destructive tools are `admin_export_workspace`, `delete_project`.
- [ ] Update server registration so contextual follow-up tools are only advertised after a pending action exists, or move them behind a separate admin/profile configuration if the client cannot do contextual exposure.
- [ ] For contribution/submission workflows, add draft/confirmation/posting completion metrics before introducing new safety gates.
- [ ] For every item in Actionable Tool Findings, apply the suggested name/description or an equivalent shorter rewrite with a decisive trigger, return shape, exclusion rule, and safety note.
- [ ] Resolve each Merge/Hide/Split recommendation by merging overlapping capabilities, renaming tools that compete for the same prompt, or making the boundary explicit in `Do not use when` wording.
- [ ] Add or update standard MCP ToolAnnotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) so safety is machine-readable instead of buried in prose.
- [ ] Wire warn-only CI on pull requests with a baseline audit so new tools, overlap, score regressions, and missing descriptions get an advisory PR comment before drift ships.
- [ ] Instrument proof metrics: initialized sessions, tools/list payload bytes, tools/call success/error, missed-prompt replay results, first-tool-call latency, and task completion turns.

## Actionable Tool Findings

### delete_project
- Exposure: Admin, maintenance, or destructive capability should not be exposed to every ordinary agent session by default. Preferred action: admin_profile.
- WARN description_too_short: Description is too short for reliable model selection.
- WARN weak_required_input: Required inputs need clearer descriptions or examples: projectId.
- FAIL unsafe_destructive_tool: Destructive tool lacks explicit confirmation, safety, or review wording.
- WARN tool_overlap: Overlaps heavily with get_project.
- WARN tool_overlap: Overlaps heavily with list_project_tasks.
- WARN tool_overlap: Overlaps heavily with create_task.
- Recommendation: Move to an admin profile unless ordinary users need this in the default surface.
- Current description:

```text
Delete a project.
```

- Suggested rewrite:

```text
Use when: an administrator intentionally needs delete_project maintenance.
Returns: the maintenance result.
Do not use when: serving ordinary user workflows or when a read-only inspection tool would be enough.
Safety: admin/destructive capability; keep out of the default user-facing profile and require explicit operator intent.
```

### confirm_task_update
- Exposure: Follow-up helper tools are useful after a pending action exists and reduce default-surface clutter without changing the primary completion path. Preferred action: contextual_exposure.
- WARN weak_required_input: Required inputs need clearer descriptions or examples: pendingId.
- WARN tool_overlap: Overlaps heavily with reject_task_update.
- Recommendation: Keep for safety, but consider contextual exposure only when there is a pending action.
- Current description:

```text
Confirm a pending task update.
```

- Suggested rewrite:

```text
Use when: a pending task_update action has already been shown to the user and the user explicitly confirmed it.
Returns: the confirmed result.
Do not use when: starting a new workflow, guessing user intent, or bypassing a preview/draft step.
Safety: confirmation helper; expose contextually only after there is a pending action.
```

### reject_task_update
- Exposure: Follow-up helper tools are useful after a pending action exists and reduce default-surface clutter without changing the primary completion path. Preferred action: contextual_exposure.
- WARN weak_required_input: Required inputs need clearer descriptions or examples: pendingId.
- WARN tool_overlap: Overlaps heavily with confirm_task_update.
- Recommendation: Keep for safety, but consider contextual exposure only when there is a pending action.
- Current description:

```text
Reject a pending task update.
```

- Suggested rewrite:

```text
Use when: a pending task_update action has been shown and the user rejects it or asks to discard it.
Returns: the canceled pending action.
Do not use when: starting a new workflow or silently canceling an action without user intent.
Safety: rejection helper; expose contextually only after there is a pending action.
```

### create_task
- WARN weak_required_input: Required inputs need clearer descriptions or examples: projectId, title.
- WARN unsafe_write_tool: Write-like tool lacks safety, draft, redaction, or explicit-confirmation wording.
- WARN tool_overlap: Overlaps heavily with delete_project.
- Recommendation: Prefer a verb plus concrete domain object in the name.
- Current description:

```text
Create a task in a project.
```

- Suggested rewrite:

```text
Use when: the user needs the task workflow.
Returns: the relevant result.
Do not use when: the task belongs to another workflow or no tool call is needed.
Safety: document whether this tool is read-only, writes data, calls external systems, or requires confirmation.
```

### search_tasks
- WARN weak_required_input: Required inputs need clearer descriptions or examples: query.
- WARN tool_overlap: Overlaps heavily with search_projects.
- WARN tool_overlap: Overlaps heavily with find_projects.
- WARN tool_overlap: Overlaps heavily with list_project_tasks.
- Recommendation: Prefer a verb plus concrete domain object in the name.
- Current description:

```text
Use when: the user needs to find tasks across projects by keyword, assignee, label, or status. Returns task ids, project ids, titles, status, and assignees.
```

- Suggested rewrite:

```text
Use when: the user needs the search workflow.
Returns: the relevant result.
Do not use when: the task belongs to another workflow or no tool call is needed.
Safety: document whether this tool is read-only, writes data, calls external systems, or requires confirmation.
```

### search_projects
- WARN tool_overlap: Overlaps heavily with find_projects.
- WARN tool_overlap: Overlaps heavily with get_project.
- WARN tool_overlap: Overlaps heavily with search_tasks.
- Recommendation: Prefer a verb plus concrete domain object in the name.
- Current description:

```text
Use when: the user needs to find projects by name, owner, status, or keyword. Returns project ids, names, owners, status, and short summaries.
```

- Suggested rewrite:

```text
Use when: the user needs the search workflow.
Returns: the relevant result.
Do not use when: the task belongs to another workflow or no tool call is needed.
Safety: document whether this tool is read-only, writes data, calls external systems, or requires confirmation.
```

### list_project_tasks
- WARN weak_required_input: Required inputs need clearer descriptions or examples: projectId.
- WARN tool_overlap: Overlaps heavily with get_project.
- WARN tool_overlap: Overlaps heavily with search_tasks.
- WARN tool_overlap: Overlaps heavily with list_users.
- WARN tool_overlap: Overlaps heavily with delete_project.
- Current description:

```text
Use when: the user needs tasks in a known project, optionally filtered by status or assignee.
```

- Suggested rewrite:

```text
Use when: the user needs the list project task workflow.
Returns: the relevant result.
Do not use when: the task belongs to another workflow or no tool call is needed.
Safety: document whether this tool is read-only, writes data, calls external systems, or requires confirmation.
```

### comment_on_task
- WARN weak_required_input: Required inputs need clearer descriptions or examples: taskId, body.
- WARN unsafe_write_tool: Write-like tool lacks safety, draft, redaction, or explicit-confirmation wording.
- WARN tool_overlap: Overlaps heavily with update_task.
- Current description:

```text
Use when: the user asks to add a comment or status note to an existing task. Returns the created comment id and task link.
```

- Suggested rewrite:

```text
Use when: the user needs the comment on task workflow.
Returns: the relevant result.
Do not use when: the task belongs to another workflow or no tool call is needed.
Safety: document whether this tool is read-only, writes data, calls external systems, or requires confirmation.
```

### find_projects
- WARN description_too_short: Description is too short for reliable model selection.
- WARN tool_overlap: Overlaps heavily with search_projects.
- WARN tool_overlap: Overlaps heavily with search_tasks.
- Current description:

```text
Find projects.
```

- Suggested rewrite:

```text
Use when: the user needs the find project workflow.
Returns: the relevant result.
Do not use when: the task belongs to another workflow or no tool call is needed.
Safety: document whether this tool is read-only, writes data, calls external systems, or requires confirmation.
```

### raw_workspace_api
- INFO implementation_oriented_description: Description is implementation-oriented instead of user-intent-oriented.
- WARN weak_required_input: Required inputs need clearer descriptions or examples: method, path.
- WARN unsafe_write_tool: Write-like tool lacks safety, draft, redaction, or explicit-confirmation wording.
- Current description:

```text
Call any workspace API endpoint.
```

- Suggested rewrite:

```text
Use when: the user needs the raw workspace api workflow.
Returns: the relevant result.
Do not use when: the task belongs to another workflow or no tool call is needed.
Safety: document whether this tool is read-only, writes data, calls external systems, or requires confirmation.
```

### update_task
- WARN weak_required_input: Required inputs need clearer descriptions or examples: taskId, fields.
- WARN unsafe_write_tool: Write-like tool lacks safety, draft, redaction, or explicit-confirmation wording.
- WARN tool_overlap: Overlaps heavily with comment_on_task.
- Current description:

```text
Use when: the user asks to edit an existing task's title, body, assignee, labels, status, or due date. Returns the updated task.
```

- Suggested rewrite:

```text
Use when: the user needs the update task workflow.
Returns: the relevant result.
Do not use when: the task belongs to another workflow or no tool call is needed.
Safety: document whether this tool is read-only, writes data, calls external systems, or requires confirmation.
```

### get_project
- WARN weak_required_input: Required inputs need clearer descriptions or examples: projectId.
- WARN tool_overlap: Overlaps heavily with search_projects.
- WARN tool_overlap: Overlaps heavily with list_project_tasks.
- WARN tool_overlap: Overlaps heavily with delete_project.
- Current description:

```text
Use when: the user has a project id and needs the current project summary, owner, status, milestones, and links.
```

- Suggested rewrite:

```text
Use when: the user needs the project workflow.
Returns: the relevant result.
Do not use when: the task belongs to another workflow or no tool call is needed.
Safety: document whether this tool is read-only, writes data, calls external systems, or requires confirmation.
```

### list_users
- WARN description_too_short: Description is too short for reliable model selection.
- WARN tool_overlap: Overlaps heavily with list_project_tasks.
- Current description:

```text
List users.
```

- Suggested rewrite:

```text
Use when: the user needs the list user workflow.
Returns: the relevant result.
Do not use when: the task belongs to another workflow or no tool call is needed.
Safety: document whether this tool is read-only, writes data, calls external systems, or requires confirmation.
```

### complete_task
- WARN weak_required_input: Required inputs need clearer descriptions or examples: taskId.
- WARN unsafe_write_tool: Write-like tool lacks safety, draft, redaction, or explicit-confirmation wording.
- Current description:

```text
Mark a task complete.
```

- Suggested rewrite:

```text
Use when: the user needs the complete task workflow.
Returns: the relevant result.
Do not use when: the task belongs to another workflow or no tool call is needed.
Safety: document whether this tool is read-only, writes data, calls external systems, or requires confirmation.
```

### get_user
- WARN weak_required_input: Required inputs need clearer descriptions or examples: userId.
- Current description:

```text
Use when: the user needs profile details for a known user id or email. Returns display name, email, team, and active status.
```

- Suggested rewrite:

```text
Use when: the user needs the user workflow.
Returns: the relevant result.
Do not use when: the task belongs to another workflow or no tool call is needed.
Safety: document whether this tool is read-only, writes data, calls external systems, or requires confirmation.
```

### admin_export_workspace
- Exposure: Admin, maintenance, or destructive capability should not be exposed to every ordinary agent session by default. Preferred action: admin_profile.
- Recommendation: Move to an admin profile unless ordinary users need this in the default surface.
- Current description:

```text
Export the entire workspace.
```

- Suggested rewrite:

```text
Use when: an administrator intentionally needs admin_export_workspace maintenance.
Returns: the maintenance result.
Do not use when: serving ordinary user workflows or when a read-only inspection tool would be enough.
Safety: admin/destructive capability; keep out of the default user-facing profile and require explicit operator intent.
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

### admin_export_workspace -> admin_export_workspace
Profile: admin; advisory priority (non-standard MCP hint, most clients ignore): 0.1

Use when: an administrator intentionally needs admin_export_workspace maintenance.
Returns: the maintenance result.
Do not use when: serving ordinary user workflows or when a read-only inspection tool would be enough.
Safety: admin/destructive capability; keep out of the default user-facing profile and require explicit operator intent.

### comment_on_task -> comment_on_task
Profile: core; advisory priority (non-standard MCP hint, most clients ignore): 0.7

Use when: the user needs the comment on task workflow.
Returns: the relevant result.
Do not use when: the task belongs to another workflow or no tool call is needed.
Safety: document whether this tool is read-only, writes data, calls external systems, or requires confirmation.

### complete_task -> complete_task
Profile: core; advisory priority (non-standard MCP hint, most clients ignore): 0.7

Use when: the user needs the complete task workflow.
Returns: the relevant result.
Do not use when: the task belongs to another workflow or no tool call is needed.
Safety: document whether this tool is read-only, writes data, calls external systems, or requires confirmation.

### confirm_task_update -> confirm_task_update
Profile: core; advisory priority (non-standard MCP hint, most clients ignore): 0.2

Use when: a pending task_update action has already been shown to the user and the user explicitly confirmed it.
Returns: the confirmed result.
Do not use when: starting a new workflow, guessing user intent, or bypassing a preview/draft step.
Safety: confirmation helper; expose contextually only after there is a pending action.

### create_task -> create_task
Profile: core; advisory priority (non-standard MCP hint, most clients ignore): 0.7

Use when: the user needs the task workflow.
Returns: the relevant result.
Do not use when: the task belongs to another workflow or no tool call is needed.
Safety: document whether this tool is read-only, writes data, calls external systems, or requires confirmation.

### delete_project -> delete_project
Profile: admin; advisory priority (non-standard MCP hint, most clients ignore): 0.1

Use when: an administrator intentionally needs delete_project maintenance.
Returns: the maintenance result.
Do not use when: serving ordinary user workflows or when a read-only inspection tool would be enough.
Safety: admin/destructive capability; keep out of the default user-facing profile and require explicit operator intent.

### find_projects -> find_projects
Profile: core; advisory priority (non-standard MCP hint, most clients ignore): 1

Use when: the user needs the find project workflow.
Returns: the relevant result.
Do not use when: the task belongs to another workflow or no tool call is needed.
Safety: document whether this tool is read-only, writes data, calls external systems, or requires confirmation.

### get_project -> get_project
Profile: core; advisory priority (non-standard MCP hint, most clients ignore): 1

Use when: the user needs the project workflow.
Returns: the relevant result.
Do not use when: the task belongs to another workflow or no tool call is needed.
Safety: document whether this tool is read-only, writes data, calls external systems, or requires confirmation.

### get_user -> get_user
Profile: core; advisory priority (non-standard MCP hint, most clients ignore): 1

Use when: the user needs the user workflow.
Returns: the relevant result.
Do not use when: the task belongs to another workflow or no tool call is needed.
Safety: document whether this tool is read-only, writes data, calls external systems, or requires confirmation.

### list_project_tasks -> list_project_tasks
Profile: core; advisory priority (non-standard MCP hint, most clients ignore): 1

Use when: the user needs the list project task workflow.
Returns: the relevant result.
Do not use when: the task belongs to another workflow or no tool call is needed.
Safety: document whether this tool is read-only, writes data, calls external systems, or requires confirmation.

### list_users -> list_users
Profile: core; advisory priority (non-standard MCP hint, most clients ignore): 1

Use when: the user needs the list user workflow.
Returns: the relevant result.
Do not use when: the task belongs to another workflow or no tool call is needed.
Safety: document whether this tool is read-only, writes data, calls external systems, or requires confirmation.

### raw_workspace_api -> raw_workspace_api
Profile: core; advisory priority (non-standard MCP hint, most clients ignore): 0.7

Use when: the user needs the raw workspace api workflow.
Returns: the relevant result.
Do not use when: the task belongs to another workflow or no tool call is needed.
Safety: document whether this tool is read-only, writes data, calls external systems, or requires confirmation.

### reject_task_update -> reject_task_update
Profile: core; advisory priority (non-standard MCP hint, most clients ignore): 0.2

Use when: a pending task_update action has been shown and the user rejects it or asks to discard it.
Returns: the canceled pending action.
Do not use when: starting a new workflow or silently canceling an action without user intent.
Safety: rejection helper; expose contextually only after there is a pending action.

### search_projects -> search_projects
Profile: core; advisory priority (non-standard MCP hint, most clients ignore): 1

Use when: the user needs the search workflow.
Returns: the relevant result.
Do not use when: the task belongs to another workflow or no tool call is needed.
Safety: document whether this tool is read-only, writes data, calls external systems, or requires confirmation.

### search_tasks -> search_tasks
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

- Hide or move `admin_export_workspace`: Admin, maintenance, or destructive capability should not be exposed to every ordinary agent session by default. Preferred action: admin_profile.
- Hide or move `confirm_task_update`: Follow-up helper tools are useful after a pending action exists and reduce default-surface clutter without changing the primary completion path. Preferred action: contextual_exposure.
- Hide or move `delete_project`: Admin, maintenance, or destructive capability should not be exposed to every ordinary agent session by default. Preferred action: admin_profile.
- Hide or move `reject_task_update`: Follow-up helper tools are useful after a pending action exists and reduce default-surface clutter without changing the primary completion path. Preferred action: contextual_exposure.
- task_update is split into preview/confirm/reject helpers. Preserve safety, but expose helpers contextually or behind a lower-priority profile. Tools: `confirm_task_update`, `reject_task_update`.

## Recommended Tool Set

Use this activation model to keep primary tools from competing with after-action helpers:

### core
Default surface for ordinary agent sessions. Read/feedback/contribution tools stay visible; confirm/reject helpers belong here too but should be exposed contextually, not in the default tools/list.

- `comment_on_task`
- `complete_task`
- `confirm_task_update` - contextual follow-up (reduces default-surface clutter)
- `create_task`
- `find_projects`
- `get_project`
- `get_user`
- `list_project_tasks`
- `list_users`
- `raw_workspace_api`
- `reject_task_update` - contextual follow-up (reduces default-surface clutter)
- `search_projects`
- `search_tasks`
- `update_task`

### admin
Maintenance and destructive capabilities should not compete with high-value default workflows.

- `admin_export_workspace`
- `delete_project`

## Secondary Summary And CI Metadata

- Tools exposed: 16
- Average discoverability score: 72.5
- Default-visible tools (shown in every session): 12
- Core profile: 14 (12 default-visible + 2 contextual helpers)
- Low-risk follow-up helpers: 2
- Contribution/submission gates to measure: 0
- Admin profile (kept out of the default surface): 2
- Workflow groups: 14
- tools/list payload: 6 KB
- Confirm/reject helpers: 2 (13%)
- Top recommendation: Rewrite delete_project with concrete "Use when" trigger language and a clearer safe path.
- CI status: FAIL
- CI findings: 1 fail, 44 warn, 1 info
- Recommended CI posture: advisory PR comment or warn-only check by default; strict failure only for teams that explicitly want blocking policy.

### Strict CI Failures

| Rule | Tool | Message |
| --- | --- | --- |
| unsafe_destructive_tool | `delete_project` | Destructive tool lacks explicit confirmation, safety, or review wording. |

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
| `admin_export_workspace` | admin_export_workspace | admin | 100 | 0 | 0 |  |
| `comment_on_task` | comment_on_task | write | 68 | 0 | 0 |  |
| `complete_task` | complete_task | write | 81 | 0 | 0 |  |
| `confirm_task_update` | task_update | confirm | 87 | 0 | 0 |  |
| `create_task` | task | write | 60 | 0 | 0 |  |
| `delete_project` | delete_project | destructive | 37 | 0 | 0 |  |
| `find_projects` | find_project | read | 68 | 0 | 0 |  |
| `get_project` | project | read | 71 | 0 | 0 |  |
| `get_user` | user | read | 95 | 0 | 0 |  |
| `list_project_tasks` | list_project_task | read | 63 | 0 | 0 |  |
| `list_users` | list_user | read | 76 | 0 | 0 |  |
| `raw_workspace_api` | raw_workspace_api | write | 68 | 0 | 0 |  |
| `reject_task_update` | task_update | reject | 87 | 0 | 0 |  |
| `search_projects` | search | read | 68 | 0 | 0 |  |
| `search_tasks` | search | read | 63 | 0 | 0 |  |
| `update_task` | update_task | write | 68 | 0 | 0 |  |

## Tool-Level Findings

### admin_export_workspace
- Recommendation: Move to an admin profile unless ordinary users need this in the default surface.

### comment_on_task
- WARN weak_required_input: Required inputs need clearer descriptions or examples: taskId, body.
- WARN unsafe_write_tool: Write-like tool lacks safety, draft, redaction, or explicit-confirmation wording.
- WARN tool_overlap: Overlaps heavily with update_task.

### complete_task
- WARN weak_required_input: Required inputs need clearer descriptions or examples: taskId.
- WARN unsafe_write_tool: Write-like tool lacks safety, draft, redaction, or explicit-confirmation wording.

### confirm_task_update
- WARN weak_required_input: Required inputs need clearer descriptions or examples: pendingId.
- WARN tool_overlap: Overlaps heavily with reject_task_update.
- Recommendation: Keep for safety, but consider contextual exposure only when there is a pending action.

### create_task
- WARN weak_required_input: Required inputs need clearer descriptions or examples: projectId, title.
- WARN unsafe_write_tool: Write-like tool lacks safety, draft, redaction, or explicit-confirmation wording.
- WARN tool_overlap: Overlaps heavily with delete_project.
- Recommendation: Prefer a verb plus concrete domain object in the name.

### delete_project
- WARN description_too_short: Description is too short for reliable model selection.
- WARN weak_required_input: Required inputs need clearer descriptions or examples: projectId.
- FAIL unsafe_destructive_tool: Destructive tool lacks explicit confirmation, safety, or review wording.
- WARN tool_overlap: Overlaps heavily with get_project.
- WARN tool_overlap: Overlaps heavily with list_project_tasks.
- WARN tool_overlap: Overlaps heavily with create_task.
- Recommendation: Move to an admin profile unless ordinary users need this in the default surface.

### find_projects
- WARN description_too_short: Description is too short for reliable model selection.
- WARN tool_overlap: Overlaps heavily with search_projects.
- WARN tool_overlap: Overlaps heavily with search_tasks.

### get_project
- WARN weak_required_input: Required inputs need clearer descriptions or examples: projectId.
- WARN tool_overlap: Overlaps heavily with search_projects.
- WARN tool_overlap: Overlaps heavily with list_project_tasks.
- WARN tool_overlap: Overlaps heavily with delete_project.

### get_user
- WARN weak_required_input: Required inputs need clearer descriptions or examples: userId.

### list_project_tasks
- WARN weak_required_input: Required inputs need clearer descriptions or examples: projectId.
- WARN tool_overlap: Overlaps heavily with get_project.
- WARN tool_overlap: Overlaps heavily with search_tasks.
- WARN tool_overlap: Overlaps heavily with list_users.
- WARN tool_overlap: Overlaps heavily with delete_project.

### list_users
- WARN description_too_short: Description is too short for reliable model selection.
- WARN tool_overlap: Overlaps heavily with list_project_tasks.

### raw_workspace_api
- INFO implementation_oriented_description: Description is implementation-oriented instead of user-intent-oriented.
- WARN weak_required_input: Required inputs need clearer descriptions or examples: method, path.
- WARN unsafe_write_tool: Write-like tool lacks safety, draft, redaction, or explicit-confirmation wording.

### reject_task_update
- WARN weak_required_input: Required inputs need clearer descriptions or examples: pendingId.
- WARN tool_overlap: Overlaps heavily with confirm_task_update.
- Recommendation: Keep for safety, but consider contextual exposure only when there is a pending action.

### search_projects
- WARN tool_overlap: Overlaps heavily with find_projects.
- WARN tool_overlap: Overlaps heavily with get_project.
- WARN tool_overlap: Overlaps heavily with search_tasks.
- Recommendation: Prefer a verb plus concrete domain object in the name.

### search_tasks
- WARN weak_required_input: Required inputs need clearer descriptions or examples: query.
- WARN tool_overlap: Overlaps heavily with search_projects.
- WARN tool_overlap: Overlaps heavily with find_projects.
- WARN tool_overlap: Overlaps heavily with list_project_tasks.
- Recommendation: Prefer a verb plus concrete domain object in the name.

### update_task
- WARN weak_required_input: Required inputs need clearer descriptions or examples: taskId, fields.
- WARN unsafe_write_tool: Write-like tool lacks safety, draft, redaction, or explicit-confirmation wording.
- WARN tool_overlap: Overlaps heavily with comment_on_task.

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
