# AUTO-001 Bootstrap State

- Branch: `automation/auto-001-bootstrap`
- Required starting SHA: `1d3ffb177f413c65cd98fbf1f73d14a33b0121b8`
- Scope: deterministic local smoke validation only
- Validation command: `node scripts/validate-smoke.js`
- Correction: MIME-like text is excluded only for static literals and CSS `url()` values; ordinary repository paths remain checkable.
- Validation result: PASS (2026-09-11; 30 local static references checked)
- Exit code: `0`
- Network: no external network access required
- Missing-reference regression: `node scripts/validate-smoke.js ..\auto-001-missing-reference-fixture` returned FAIL with exit code `1` and identified `assets\missing.png`.
- Missing-entry regression: `node scripts/validate-smoke.js ..\auto-001-missing-duonix-fixture` returned FAIL with exit code `1` and identified missing `duonix.html`.
- Control Tower disposition: Correction 1 independently reviewed; one feature-branch commit/push is authorized. PR and `main` changes are not authorized.
- Model routing policy approval: `APPROVED — GPT-5.3-Codex-Spark active utilization for DUONIX development automation`
- Policy approval boundary: model-routing approval only; it is not approval for individual game features, architecture changes, PR creation, or merge to `main`.
- AUTO-001 final completion: NOT YET APPROVED; genuine fresh-checkout Validation remains required by the current Control Tower disposition.
- Next resume point: independent Validation of exact feature-branch HEAD from a genuine fresh checkout; do not start AUTO-002 or new game-feature work before Control Tower disposition.

---

# DUONIX AI Model Routing Policy

Status: USER APPROVED / CONTROL TOWER RECORDED
Recorded: 2026-09-11
Applies to: DUONIX development automation, beginning with AUTO-001

## 1. Evidence priority and baseline rule

AI models are not selected by price alone. Select the least expensive model that has a high probability of successfully completing the task based on task difficulty and task shape.

Project state is not determined by chat memory. Evidence priority is:

1. actual GitHub `main` HEAD and the relevant working-branch HEAD,
2. latest official HANDOFF or state document,
3. Validation/Test evidence,
4. approved Decision/Architecture documents.

If evidence conflicts and cannot be reconciled directly, record the value as `미확인` rather than guessing.

## 2. GPT-5.3-Codex-Spark active utilization

`GPT-5.3-Codex-Spark` is the first-choice model for narrowly scoped work with a short feedback loop, including:

- repository exploration,
- analysis of a specific file,
- small feature implementation,
- localized code changes,
- clearly defined bug fixes,
- adding tests,
- smoke validation authoring,
- lint/validation error fixes,
- repetitive code cleanup,
- minor document/code synchronization,
- small Git diff analysis,
- rework where the failure cause is already clear.

Check Spark availability and execution environment at the beginning of each applicable task. If Spark is unavailable, do not record that as a model failure.

## 3. GPT-5.6 Luna role

`GPT-5.6 Luna` is the default low-cost model for multi-step autonomous work where a larger task context or repeated execution loop is expected, including:

- implementation across multiple files,
- repeated implementation → execution → analysis → correction → revalidation cycles,
- relatively long autonomous coding loops,
- tasks whose context is too large for Spark to be efficient,
- several small subtasks that must be connected to one completion condition.

Routing interpretation:

- short, clear, local task → Spark first,
- connected multi-step low-cost autonomous task → Luna first.

## 4. Escalation policy

Escalation path when objectively justified:

`Spark / Luna` → `GPT-5.6 Terra` → `GPT-5.6 Sol or higher`

Do not escalate automatically after a simple failure. First classify the failure as one of:

- `MODEL_CAPABILITY`
- `TASK_SCOPE`
- `TOOL_FAILURE`
- `ENVIRONMENT_FAILURE`
- `PERMISSION_FAILURE`
- `REQUIREMENT_AMBIGUITY`
- `USAGE_LIMIT`
- `UNKNOWN`

Consider model escalation only when objective evidence supports `MODEL_CAPABILITY`.

Important architecture changes or high-cost model use remain behind the applicable user/Control Tower approval boundary.

## 5. Events that are not model-capability failures

Do not classify the following as model-performance failures:

- GitHub permission problems,
- OS/browser problems,
- package-installation problems,
- wrong paths,
- CI infrastructure failures,
- network failures,
- usage limits,
- external-service failures,
- contradictory requirements,
- required software not being installed.

Stop the affected work and record the actual cause accurately.

## 6. Spark failure handling

If Spark fails, do not immediately hand the same task to a higher model.

First determine the failure class. When practical, split the task into a smaller, equivalent-scope unit. Escalate to Luna or a suitable higher model only when repeated failure on the smaller scope provides evidence of insufficient model capability.

Do not waste model retries on tool, environment, permission, or usage-limit failures.

## 7. Deterministic-tool preference

Prefer deterministic tools rather than AI for:

- Git commands,
- HEAD/SHA verification,
- build,
- unit tests,
- smoke tests,
- lint,
- file-existence checks,
- static validation,
- exit-code evaluation,
- checksums,
- structural diff checks.

Use AI when interpretation, root-cause analysis, or code modification is required.

## 8. DUONIX environment boundary

DUONIX currently uses a web-project baseline. Unless a specific need is established, do not run or create/modify work in:

- Unity Editor,
- Unity Hub,
- Unity projects,
- Blender,
- other game engines,
- external development environments unrelated to DUONIX.

Do not launch installed programs merely to explore them during Validation. If a need arises, first report why the program/environment is necessary.

## 9. AUTO-001 application

AUTO-001 validates a low-cost development-automation loop; it is not approval for game-feature expansion.

Do not change existing game logic, content, balance, images, or audio as part of AUTO-001.

Prefer Spark for suitably small tasks.

AUTO-001 evaluation must include:

- instruction compliance,
- out-of-scope file changes,
- actual execution of required validation commands,
- PASS/FAIL reproducibility,
- accuracy of post-failure classification,
- retry count,
- wall time,
- model usage,
- Git checkpoint accuracy,
- HANDOFF/state-record accuracy.

Code generation alone is not success. Record PASS only after the completion condition is verified with actual execution evidence.

## 10. Model performance record

Accumulate model-level performance evidence from AUTO-001 onward. Minimum fields:

| MODEL | TASK_ID | TASK_TYPE | RESULT | ATTEMPTS | WALL_TIME | FAILURE_CLASS | VALIDATION_RESULT | SCOPE_VIOLATION | ESCALATED_TO | 비고 |
|---|---|---|---|---:|---|---|---|---|---|---|
| `GPT-5.6 Sol` | `AUTO-001-POLICY-ROUTING-01` | policy/state update | PASS | 2 | `미확인` | first attempt `PERMISSION_FAILURE`; second attempt NONE | repository write + post-write Git verification required | NO | NONE | First write attempt returned GitHub 403; user reauthorized repository access before successful retry. Exact token/credit use: `미확인`. |

If exact token/credit usage cannot be read from the system, record `미확인`; do not estimate it.

Future routing changes must be based on accumulated evidence rather than subjective impressions.

## 11. Usage-limit handling

When any model reaches a usage limit, do not leave project state dependent on that model session. Before stopping, preserve as much of the following as possible:

- current Git HEAD,
- last validation PASS,
- current `TASK_ID`,
- completed steps,
- incomplete steps,
- failure cause,
- exact `NEXT_STEP`.

The next model/session must verify these directly before continuing. Do not repeat work that has already been independently verified as complete.

## 12. Git safety rules

Automation experiments should not be performed directly on `main` by default. Use a working branch, such as `automation/auto-001-bootstrap`.

Without explicit user or Control Tower approval, do not perform:

- forced modification of `main`,
- force push,
- mass deletion of already validated files,
- architecture changes,
- game-design changes,
- large refactors,
- replacement of existing assets.

After work is complete, verify the actual diff and Validation result before checkpointing.

## 13. State-document rule

Before creating automation state documents, locate the existing official HANDOFF/state/Decision Ledger locations.

If an existing canonical state document exists, use it. Do not create an arbitrary new `HANDOFF.md`, `CURRENT_STATE.md`, or equivalent and declare it the Source of Truth while canonical status is unresolved.

If no canonical automation state document can be confirmed, report:

`미확인 — canonical automation state document not established`

and let Control Tower decide the location.

## 14. Approval boundary

Current user approval:

`APPROVED — GPT-5.3-Codex-Spark active utilization for DUONIX development automation`

This authorizes the model-routing policy only. It does not authorize individual feature implementation, architecture changes, PR creation, merge to `main`, or expansion beyond AUTO-001 preparation.
