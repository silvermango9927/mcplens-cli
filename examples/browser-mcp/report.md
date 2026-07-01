# MCP Activation Audit

Purpose: prevent tool-surface drift. As an MCP server grows, overlapping tools, wordier descriptions, and unclear follow-up flows make agents less likely to call the right tool.

## Prevent Tool-Surface Drift

Start by deciding the activation model, then rewrite the concrete tool descriptions below. The score is secondary metadata; the main goal is to make each tool easy for an agent to choose, skip, or handle safely.

- Surface shape: 5 exposed tools collapse into 5 workflow groups.
- Primary surface: 5 default-visible tools; 0 follow-up/helper tools; 0 admin/destructive tools.
- Overlap diagnosis: 12 overlapping tool findings need merge, rename, or sharper boundaries.
- Flow diagnosis: 0 confirm/reject helper tools should be exposed after a pending action exists, not as primary choices.
- Follow-up distinction: 0 low-risk helper tools reduce default-surface clutter; 0 contribution/submission gate tools may reduce workflow completion.
- Observed activation: not measured yet; add initialize and tools/call logs to prove whether the drift fix increases usage.
- Review priority: Rewrite browser_navigate with concrete "Use when" trigger language and a clearer safe path.
- Tools needing description review: 5 of 5
- Findings to triage: 6 fail, 17 warn, 0 info
- Preferred rewrite shape: short, decisive `Use when` / `Returns` / `Do not use when` / `Safety`.

## Implementation Plan For Cursor/Claude

Feed this section to a coding agent as the concrete fix plan:

- [ ] Export the current MCP tools/list and keep this report plus the JSON audit as the baseline for future PR checks.
- [ ] Define the activation model: default-visible primary tools are `browser_click`, `browser_extract`, `browser_navigate`, `browser_screenshot`, `browser_type`; low-risk contextual follow-up tools are none; contribution/submission gates are none; admin/destructive tools are none.
- [ ] Update server registration so contextual follow-up tools are only advertised after a pending action exists, or move them behind a separate admin/profile configuration if the client cannot do contextual exposure.
- [ ] For contribution/submission workflows, add draft/confirmation/posting completion metrics before introducing new safety gates.
- [ ] For every item in Actionable Tool Findings, apply the suggested name/description or an equivalent shorter rewrite with a decisive trigger, return shape, exclusion rule, and safety note.
- [ ] For browser action tools, add explicit `Mutates`, `Preconditions`, and `Available afterward` lines so agents know what browser/session/page state changes, what must already be true, and what trace output they can inspect after the call.
- [ ] Resolve each Merge/Hide/Split recommendation by merging overlapping capabilities, renaming tools that compete for the same prompt, or making the boundary explicit in `Do not use when` wording.
- [ ] Add or update standard MCP ToolAnnotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) so safety is machine-readable instead of buried in prose.
- [ ] Wire warn-only CI on pull requests with a baseline audit so new tools, overlap, score regressions, and missing descriptions get an advisory PR comment before drift ships.
- [ ] Instrument proof metrics: initialized sessions, tools/list payload bytes, tools/call success/error, missed-prompt replay results, first-tool-call latency, and task completion turns.

## Browser MCP Profile

For browser action tools, state the operational contract before an agent calls the tool:

- `Mutates:` the browser state changed by the action, such as active session, page URL/history, DOM/application state, form values, cookies/auth, focus/scroll/viewport, or no page-state mutation.
- `Preconditions:` required active session, loaded page, prior observe call, known target element/selector, authenticated state, user gesture, or page-readiness state.
- `Available afterward:` trace output such as session id, final URL, replay URL, screenshot, action result, observation result, extracted structured payload, console logs, or network logs.

Examples:

- `navigate`: mutates current page URL/history; precondition: active session; trace: final URL, screenshot, session ID.
- `act`: mutates DOM/page/application state; precondition: page loaded and target/action known, ideally after observe; trace: action result, screenshot, replay.
- `extract`: does not mutate page state; precondition: page loaded; trace: extracted structured payload.

## Actionable Tool Findings

### browser_navigate
- WARN description_too_short: Description is too short for reliable model selection.
- WARN weak_required_input: Required inputs need clearer descriptions or examples: url.
- FAIL browser_action_missing_mutation: Browser action tool does not state which browser state it mutates.
- FAIL browser_action_missing_preconditions: Browser action tool does not state preconditions that must be true before calling.
- FAIL browser_action_missing_artifact: Browser action tool does not state the trace or debug artifact available afterward.
- WARN tool_overlap: Overlaps heavily with browser_type.
- WARN tool_overlap: Overlaps heavily with browser_extract.
- WARN tool_overlap: Overlaps heavily with browser_screenshot.
- Current description:

```text
Navigate to a URL.
```

- Suggested rewrite:

```text
Use when: the agent must perform the browser navigate browser action in an existing browser session.
Mutates: state whether this changes the active session, page URL/history, DOM/application state, form values, cookies/auth, focus/scroll/viewport, or explicitly does not mutate page state.
Preconditions: state the required active session, loaded page, prior observe call, known target element/selector, authenticated state, user gesture, or page-readiness state before calling.
Available afterward: state the trace output, such as session id, final URL, replay URL, screenshot, action result, observation result, extracted structured payload, console logs, or network logs.
```

### browser_click
- WARN description_too_short: Description is too short for reliable model selection.
- WARN weak_required_input: Required inputs need clearer descriptions or examples: selector.
- FAIL browser_action_missing_mutation: Browser action tool does not state which browser state it mutates.
- FAIL browser_action_missing_preconditions: Browser action tool does not state preconditions that must be true before calling.
- FAIL browser_action_missing_artifact: Browser action tool does not state the trace or debug artifact available afterward.
- Current description:

```text
Click an element.
```

- Suggested rewrite:

```text
Use when: the agent must perform the browser click browser action in an existing browser session.
Mutates: state whether this changes the active session, page URL/history, DOM/application state, form values, cookies/auth, focus/scroll/viewport, or explicitly does not mutate page state.
Preconditions: state the required active session, loaded page, prior observe call, known target element/selector, authenticated state, user gesture, or page-readiness state before calling.
Available afterward: state the trace output, such as session id, final URL, replay URL, screenshot, action result, observation result, extracted structured payload, console logs, or network logs.
```

### browser_type
- WARN weak_required_input: Required inputs need clearer descriptions or examples: selector, text.
- WARN tool_overlap: Overlaps heavily with browser_navigate.
- WARN tool_overlap: Overlaps heavily with browser_extract.
- WARN tool_overlap: Overlaps heavily with browser_screenshot.
- Current description:

```text
Use when: the user needs to enter text into a focused or selected browser field. Mutates: DOM form values and focus state. Preconditions: active browser session, loaded page, and a known selector or focused input. Available afterward: session id, final URL, action result, and screenshot.
```

- Suggested rewrite:

```text
Use when: the user needs to enter text into a focused or selected browser field. Mutates: DOM form values and focus state. Preconditions: active browser session, loaded page, and a known selector or focused input. Available afterward: session id, final URL, action result, and screenshot.
```

### browser_extract
- WARN tool_overlap: Overlaps heavily with browser_navigate.
- WARN tool_overlap: Overlaps heavily with browser_type.
- WARN tool_overlap: Overlaps heavily with browser_screenshot.
- Current description:

```text
Use when: the user needs structured data from the currently loaded page. Mutates: no page state. Preconditions: active browser session and loaded page. Available afterward: extracted structured payload and source URL.
```

- Suggested rewrite:

```text
Use when: the user needs the browser extract workflow.
Returns: the relevant result.
Do not use when: the task belongs to another workflow or no tool call is needed.
Safety: document whether this tool is read-only, writes data, calls external systems, or requires confirmation.
```

### browser_screenshot
- WARN tool_overlap: Overlaps heavily with browser_navigate.
- WARN tool_overlap: Overlaps heavily with browser_type.
- WARN tool_overlap: Overlaps heavily with browser_extract.
- Current description:

```text
Use when: the user needs a visual trace of the current page. Mutates: no page state. Preconditions: active browser session and loaded page. Available afterward: screenshot artifact, session id, and current URL.
```

- Suggested rewrite:

```text
Use when: the user needs a visual trace of the current page. Mutates: no page state. Preconditions: active browser session and loaded page. Available afterward: screenshot artifact, session id, and current URL.
```

## Recommended Description Format

Use this structure for tool descriptions, especially for write, destructive, public-posting, or workflow-helper tools:

```text
Use when: the concrete user situation or agent state that should trigger this tool.
Returns: the result shape or decision the agent can expect.
Do not use when: nearby tasks where another tool or no tool is a better choice.
Safety: side effects, confirmation requirements, redaction rules, auth scope, or why the tool is read-only.
```

For browser action tools, use this browser-specific structure:

```text
Use when: the concrete browser interaction the agent should perform.
Mutates: session, URL/history, DOM/application state, form values, cookies/auth, or explicitly no page-state mutation.
Preconditions: active session, loaded page, prior observe call, known target element, authenticated state, or other readiness requirements.
Available afterward: session id, final URL, replay URL, screenshot, action result, observation result, extracted data, console logs, or network logs.
```

## Rewritten Tool Descriptions

Keep these rewrites short and activation-oriented. Avoid implementation detail unless it helps the agent choose the correct tool.

### browser_click -> browser_click
Profile: core; advisory priority (non-standard MCP hint, most clients ignore): 0.7

Use when: the agent must perform the browser click browser action in an existing browser session.
Mutates: state whether this changes the active session, page URL/history, DOM/application state, form values, cookies/auth, focus/scroll/viewport, or explicitly does not mutate page state.
Preconditions: state the required active session, loaded page, prior observe call, known target element/selector, authenticated state, user gesture, or page-readiness state before calling.
Available afterward: state the trace output, such as session id, final URL, replay URL, screenshot, action result, observation result, extracted structured payload, console logs, or network logs.

### browser_extract -> browser_extract
Profile: core; advisory priority (non-standard MCP hint, most clients ignore): 0.7

Use when: the user needs the browser extract workflow.
Returns: the relevant result.
Do not use when: the task belongs to another workflow or no tool call is needed.
Safety: document whether this tool is read-only, writes data, calls external systems, or requires confirmation.

### browser_navigate -> browser_navigate
Profile: core; advisory priority (non-standard MCP hint, most clients ignore): 0.7

Use when: the agent must perform the browser navigate browser action in an existing browser session.
Mutates: state whether this changes the active session, page URL/history, DOM/application state, form values, cookies/auth, focus/scroll/viewport, or explicitly does not mutate page state.
Preconditions: state the required active session, loaded page, prior observe call, known target element/selector, authenticated state, user gesture, or page-readiness state before calling.
Available afterward: state the trace output, such as session id, final URL, replay URL, screenshot, action result, observation result, extracted structured payload, console logs, or network logs.

### browser_screenshot -> browser_screenshot
Profile: core; advisory priority (non-standard MCP hint, most clients ignore): 0.7

Use when: the user needs a visual trace of the current page. Mutates: no page state. Preconditions: active browser session and loaded page. Available afterward: screenshot artifact, session id, and current URL.

### browser_type -> browser_type
Profile: core; advisory priority (non-standard MCP hint, most clients ignore): 0.7

Use when: the user needs to enter text into a focused or selected browser field. Mutates: DOM form values and focus state. Preconditions: active browser session, loaded page, and a known selector or focused input. Available afterward: session id, final URL, action result, and screenshot.

## Merge/Hide/Split Recommendations

- No high-confidence hide or merge recommendations.

## Recommended Tool Set

Use this activation model to keep primary tools from competing with after-action helpers:

### core
Default surface for ordinary agent sessions. Read/feedback/contribution tools stay visible; confirm/reject helpers belong here too but should be exposed contextually, not in the default tools/list.

- `browser_click`
- `browser_extract`
- `browser_navigate`
- `browser_screenshot`
- `browser_type`

### admin
Maintenance and destructive capabilities should not compete with high-value default workflows.


## Secondary Summary And CI Metadata

- Tools exposed: 5
- Average discoverability score: 56
- Default-visible tools (shown in every session): 5
- Core profile: 5 (5 default-visible + 0 contextual helpers)
- Low-risk follow-up helpers: 0
- Contribution/submission gates to measure: 0
- Admin profile (kept out of the default surface): 0
- Workflow groups: 5
- tools/list payload: 2 KB
- Confirm/reject helpers: 0 (0%)
- Top recommendation: Rewrite browser_navigate with concrete "Use when" trigger language and a clearer safe path.
- CI status: FAIL
- CI findings: 6 fail, 17 warn, 0 info
- Recommended CI posture: advisory PR comment or warn-only check by default; strict failure only for teams that explicitly want blocking policy.

### Strict CI Failures

| Rule | Tool | Message |
| --- | --- | --- |
| browser_action_missing_mutation | `browser_click` | Browser action tool does not state which browser state it mutates. |
| browser_action_missing_preconditions | `browser_click` | Browser action tool does not state preconditions that must be true before calling. |
| browser_action_missing_artifact | `browser_click` | Browser action tool does not state the trace or debug artifact available afterward. |
| browser_action_missing_mutation | `browser_navigate` | Browser action tool does not state which browser state it mutates. |
| browser_action_missing_preconditions | `browser_navigate` | Browser action tool does not state preconditions that must be true before calling. |
| browser_action_missing_artifact | `browser_navigate` | Browser action tool does not state the trace or debug artifact available afterward. |

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
| `browser_click` | browser_click | write | 43 | 0 | 0 |  |
| `browser_extract` | browser_extract | write | 76 | 0 | 0 |  |
| `browser_navigate` | browser_navigate | write | 19 | 0 | 0 |  |
| `browser_screenshot` | browser_screenshot | write | 76 | 0 | 0 |  |
| `browser_type` | browser_type | write | 66 | 0 | 0 |  |

## Tool-Level Findings

### browser_click
- WARN description_too_short: Description is too short for reliable model selection.
- WARN weak_required_input: Required inputs need clearer descriptions or examples: selector.
- FAIL browser_action_missing_mutation: Browser action tool does not state which browser state it mutates.
- FAIL browser_action_missing_preconditions: Browser action tool does not state preconditions that must be true before calling.
- FAIL browser_action_missing_artifact: Browser action tool does not state the trace or debug artifact available afterward.

### browser_extract
- WARN tool_overlap: Overlaps heavily with browser_navigate.
- WARN tool_overlap: Overlaps heavily with browser_type.
- WARN tool_overlap: Overlaps heavily with browser_screenshot.

### browser_navigate
- WARN description_too_short: Description is too short for reliable model selection.
- WARN weak_required_input: Required inputs need clearer descriptions or examples: url.
- FAIL browser_action_missing_mutation: Browser action tool does not state which browser state it mutates.
- FAIL browser_action_missing_preconditions: Browser action tool does not state preconditions that must be true before calling.
- FAIL browser_action_missing_artifact: Browser action tool does not state the trace or debug artifact available afterward.
- WARN tool_overlap: Overlaps heavily with browser_type.
- WARN tool_overlap: Overlaps heavily with browser_extract.
- WARN tool_overlap: Overlaps heavily with browser_screenshot.

### browser_screenshot
- WARN tool_overlap: Overlaps heavily with browser_navigate.
- WARN tool_overlap: Overlaps heavily with browser_type.
- WARN tool_overlap: Overlaps heavily with browser_extract.

### browser_type
- WARN weak_required_input: Required inputs need clearer descriptions or examples: selector, text.
- WARN tool_overlap: Overlaps heavily with browser_navigate.
- WARN tool_overlap: Overlaps heavily with browser_extract.
- WARN tool_overlap: Overlaps heavily with browser_screenshot.

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
