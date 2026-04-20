---
name: qr-coding-grounded-theory-skill
description: 专用于处理长篇访谈文本的质性分析工具。通过扎根理论三级编码，自动提炼核心范畴与理论结构。当用户提供长文本并要求进行深度质性分析、提炼主题或理论建模时触发调用。
metadata: {"openclaw":{"display_name":"QR-coding-grounded-theory-skill","manifest":"./openclaw/manifest.json","input_schema":"./openclaw/input.schema.json","output_schema":"./openclaw/output.schema.json","workflow_binding":"./openclaw/workflow.binding.json"}}
---

# QR Coding Grounded Theory Skill

## Overview

Use this skill when the user provides a long interview transcript, fieldnote, observation log, or other qualitative text and asks for deep qualitative analysis rather than a simple summary. The task is to build an interpretable grounded-theory result through open coding, axial coding, and selective coding.

Read [references/grounded_theory_protocol.md]({baseDir}/references/grounded_theory_protocol.md) when you need the detailed coding rules, memoing heuristics, or output quality checklist.

## Required Inputs

- `interview_text` is required and should be treated as the primary evidence base.
- `research_focus` is optional and should only guide the final selective-coding emphasis. It must not suppress unexpected but important concepts emerging from the data.

## Execution Workflow

1. Treat the source as a long-form qualitative corpus rather than as a passage to summarize.
2. Break the source into meaningful units before analysis. Preserve contradictions, tensions, and negative cases.
3. Persist every node output as a full intermediate artifact set. The runtime must retain and expose the full sliced corpus, the full open-coding corpus, the full axial-coding aggregation, the memo log, and the final selective-coding package.
4. After Node A completes, verify that the union of all numbered slices fully covers the original source text without omission. If any segment is missing, the workflow must fail rather than continue.
5. Run open coding on every numbered slice. Each coded record must carry the original slice id, the original text span, and the generated initial codes so the mapping remains lossless and auditable.
6. After Node B completes, verify that every slice produced by Node A appears exactly once in the open-coding output. If any slice is absent, duplicated unexpectedly, or truncated, the workflow must fail rather than continue.
7. Run axial coding next. Group dispersed codes into higher-order categories, explain relations among categories, and surface conditions, actions, interactions, and consequences.
8. Run selective coding last. Identify one core category that best explains the full set of relationships, then narrate a coherent theoretical storyline around it.
9. Use constant comparison throughout. Compare incidents with incidents, incidents with codes, and codes with categories.
10. Keep brief analytic memos while coding. Note candidate mechanisms, ambiguities, rival explanations, and why a code was merged, split, or elevated.
11. Return the final result in the structure defined by `{baseDir}/openclaw/output.schema.json`, including artifact locations and coverage reports.

## OpenClaw Binding Contract

- Manifest: `{baseDir}/openclaw/manifest.json`
- Input schema: `{baseDir}/openclaw/input.schema.json`
- Output schema: `{baseDir}/openclaw/output.schema.json`
- Workflow binding: `{baseDir}/openclaw/workflow.binding.json`

When the runtime supports workflow binding, pass `interview_text` to the slicing source field on Node A and pass `research_focus` into the prompt variable for Node E.

The workflow must also expose a browsable run artifact directory containing complete intermediate files for each node. At minimum, retain the original source snapshot, numbered slices, open-coding records, axial network draft, memo log, selective-coding synthesis, and machine-readable coverage reports.

## Output Rules

- `core_theory` must contain both the core category and a complete theory storyline written as a coherent explanation.
- `axial_codes` must be a serialized JSON string representing the axial-category network, not a prose paragraph.
- `artifacts_root_dir` must point to the run directory where every node artifact is preserved and exposed.
- `intermediate_artifacts` must enumerate the concrete artifact files produced by each node so the caller can inspect the full trail.
- `coverage_report` must summarize the coverage checks for Node A and Node B and must explicitly report failure if any original text span was lost.
- If the source text is too short, fragmented, or missing, say that grounded-theory coding cannot be completed reliably and explain the limitation.
