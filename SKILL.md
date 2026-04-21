---
name: qr-coding-grounded-theory-skill
description: 专用于处理长篇访谈文本的质性分析工具。通过扎根理论三级编码，自动提炼核心范畴与理论结构。当用户提供长文本并要求进行深度质性分析、提炼主题或理论建模时触发调用。
metadata: {"openclaw":{"display_name":"QR-coding-grounded-theory-skill","manifest":"./openclaw/manifest.json","input_schema":"./openclaw/input.schema.json","output_schema":"./openclaw/output.schema.json","workflow_binding":"./openclaw/workflow.binding.json"}}
---

# QR Coding Grounded Theory Skill

## Overview

Use this skill when the user provides a long interview transcript, fieldnote, observation log, or other qualitative text and asks for deep qualitative analysis rather than a simple summary. The task is to build an interpretable grounded-theory result through open coding, axial coding, and selective coding.

Read [references/grounded_theory_protocol.md]({baseDir}/references/grounded_theory_protocol.md) when you need the detailed coding rules, memoing heuristics, or output quality checklist.
Use `scripts/prepare_hybrid_segments.py` and `scripts/validate_lossless_coverage.py` for the Node A hybrid slicing path when the workflow can invoke local scripts.

## Required Inputs

- `interview_text` is required and should be treated as the primary evidence base.
- `analysis_method` is optional but recommended. Supported values are `grounded_theory` and `thematic_analysis`.
  - If omitted, default to `grounded_theory`.
  - If the user explicitly asks for thematic analysis, honor that request rather than forcing grounded theory.
- `research_focus` is optional.
  - Under `grounded_theory`, it should only guide the final selective-coding emphasis and must not suppress unexpected but important concepts emerging from the data.
  - Under `thematic_analysis`, it may be used more directly to focus theme construction and reporting.
- `user_framework` is optional and only applies when `analysis_method` is `thematic_analysis`.
  - Under `grounded_theory`, a user-specified framework may be treated as a sensitizing concept at most, but it must not be imposed as the coding scaffold from the start.
  - Under `thematic_analysis`, a user-specified framework may be used as the organizing lens for coding, theme grouping, and final interpretation.

## Execution Workflow

1. Treat the source as a long-form qualitative corpus rather than as a passage to summarize.
2. Determine the analytic path first:
   - If `analysis_method = grounded_theory`, use the grounded-theory path below.
   - If `analysis_method = thematic_analysis`, use the thematic-analysis path below.
3. Prepare deterministic atomic units before semantic slicing. Use `scripts/prepare_hybrid_segments.py` to produce ordered atomic units with exact source spans and suggested LLM work batches.
4. Let Node A perform semantic slicing on top of those atomic units rather than on raw text directly. Node A must preserve every atomic unit id and may only regroup adjacent units without dropping or rewriting source text.
5. Persist every node output as a full intermediate artifact set. The runtime must retain and expose the atomic units, the full sliced corpus, the coding corpus, the axial or thematic aggregation, the memo log, and the final synthesis package.
6. After Node A completes, run `scripts/validate_lossless_coverage.py` to verify that the ordered Node A slices reconstruct the original source text and that every atomic unit is used exactly once. If any unit is missing, duplicated, or altered, the workflow must fail rather than continue.
7. Run slice-level coding on every numbered slice. Each coded record must carry the original slice id, the atomic unit ids, the original text span, and the generated code set so the mapping remains lossless and auditable.
8. After Node B completes, verify that every slice produced by Node A appears exactly once in the coding output. If any slice is absent, duplicated unexpectedly, or truncated, the workflow must fail rather than continue.
9. If `analysis_method = grounded_theory`:
   - Run open coding first.
   - Run axial coding next. Group dispersed codes into higher-order categories, explain relations among categories, and surface conditions, actions, interactions, and consequences.
   - Run selective coding last. Identify one core category that best explains the full set of relationships, then narrate a coherent theoretical storyline around it.
   - Use constant comparison throughout. Compare incidents with incidents, incidents with codes, and codes with categories.
10. If `analysis_method = thematic_analysis`:
   - Run initial coding first.
   - Group codes into candidate themes and subthemes.
   - Review and refine themes against the full corpus.
   - Name and define themes clearly, then produce a thematic narrative.
   - If the user provides a theoretical framework, that framework may be used as the organizing structure for themes, interpretation, and presentation.
11. Keep brief analytic memos while coding. Note candidate mechanisms, ambiguities, rival explanations, and why a code, category, or theme was merged, split, or elevated.
12. Return the final result in the structure defined by `{baseDir}/openclaw/output.schema.json`, including artifact locations and coverage reports.

## Source Provenance Contract

All multi-file runs must use a normalized, stable source-identity contract. This is required because viewer-side heuristic matching from short bracket tags such as `历史-转段` or `匡院-物理` is not reliable enough to distinguish multiple files from the same discipline, year, or status.

- Every source file in `source/` must receive a stable `source_file_id` such as `src-001`, `src-002`, and so on.
- Every source file must also retain a human-readable `source_file_label` derived from the interview or open-coding filename.
- `source_file_id` is the canonical identifier used by Node B, Node C, Node D, Node E, the viewer, and any downstream audit tooling. Human-readable short tags may be shown to users, but they must never be the only provenance key.
- If two files belong to the same discipline, year, or status, they must still remain distinct by `source_file_id`. The workflow must not collapse them under a shared shorthand such as `历史-转段` or `物理-匡院`.
- Provenance must remain lossless from Node B onward. Any evidence item elevated into axial coding or selective coding must still point back to exactly one `source_file_id`.
- If a quote, open code, memo, or representative case cannot be traced back to one specific `source_file_id`, it must be marked as provenance-incomplete and must not silently inherit the nearest-matching file.

The canonical structured evidence object is:

```json
{
  "evidence_id": "ev-000001",
  "source_file_id": "src-001",
  "source_file_label": "大四-历史-转段",
  "open_code_file": "大四-历史-转段_开放编码.md",
  "raw_source_path": "source/大四 历史（转段）.docx",
  "quote_excerpt": "有peer pressure，会羡慕那些有灵气、有天分的同学",
  "citation_tag": "历史-转段-I-096",
  "grounded_code_ref": "I2a",
  "discipline": "历史",
  "year": "大四",
  "status": "转段"
}
```

When backward compatibility requires a string field such as `source_codes`, that string may remain as a display field, but it must be generated from the structured evidence objects above rather than serving as the primary source-tracing mechanism.

## OpenClaw Binding Contract

- Manifest: `{baseDir}/openclaw/manifest.json`
- Input schema: `{baseDir}/openclaw/input.schema.json`
- Output schema: `{baseDir}/openclaw/output.schema.json`
- Workflow binding: `{baseDir}/openclaw/workflow.binding.json`

When the runtime supports workflow binding, pass `interview_text` to the slicing source field on Node A and pass `research_focus` into the prompt variable for Node E.

The workflow must also expose a browsable run artifact directory containing complete intermediate files for each node. At minimum, retain the source manifest, open-coding inventory, axial network draft, memo log, selective-coding synthesis, and machine-readable reports.
For hybrid slicing, also retain the deterministic atomic-unit file, the suggested batch file, and the Node A validation report.

## Canonical Run Layout

Write each execution to `runs/run-YYYY-MM-DD-NNN/` and keep the artifact layout aligned with the current native viewer structure. The canonical run directory is:

```text
runs/run-YYYY-MM-DD-NNN/
├── FINAL_REPORT.md
├── PROGRESS_REPORT.md
├── node_b/
│   └── open_codes_full.json
├── node_c_axial_network.json
├── node_d/
│   └── memo_aggregation.json
├── node_e_selective_coding.json
├── source/
│   ├── *.docx
│   └── 可选的源文本汇总或清单文件
└── verification/
    └── 可选的校验报告
```

In addition, the following files are strongly recommended because they make auditing and visualization stable:

- `source/source_manifest.json`: the canonical source registry for the run. It should enumerate every `source_file_id`, label, original path, open-coding path, discipline, year, and status.
- `node_c_axial_network.json`: the canonical axial-coding object used by the viewer. It must preserve structured evidence references for every subcategory.
- `node_e_selective_coding.json`: the canonical selective-coding object used by the viewer. It must preserve integrated model, phases, loops, pathways, and theoretical storyline.
- `node_d/memo_aggregation.json`: the canonical memo aggregation file used by the viewer.

If compatibility exports are needed for older tooling, they must be written as secondary artifacts only. Examples include:

- `source_snapshot.txt`
- `final_output.json`
- `framework_integration.json`
- `node_a/atomic_units.json`
- `node_a/batch_plan.json`
- `node_a/slices.json`
- `node_a/node_a_validation_report.json`
- `node_b/open_codes.json`
- `node_c/axial_network.json`
- `node_d/memos.json`
- `node_e/selective_coding.json`

These compatibility files must never be treated as the canonical source for viewer rendering when the native files listed above are available.

## Native Viewer Requirements

The local viewer at `{baseDir}/viewer/index.html` is defined against the canonical native run layout above.

- The viewer must prioritize `node_c_axial_network.json`, `node_e_selective_coding.json`, `node_b/open_codes_full.json`, `PROGRESS_REPORT.md`, `FINAL_REPORT.md`, and the `source/` directory.
- The viewer must treat each source file as an independent case object. It must not reconstruct source cases by reading compatibility-layer slices or synthetic snapshots.
- The viewer must show explicit provenance status. If a source file has no structured evidence references in Node C or Node E, the UI should say that provenance was not retained upstream rather than simply showing `无`.
- The viewer must not silently guess source ownership when multiple files share the same discipline or status labels. If structured provenance is missing, it should prefer a visible warning over a misleading auto-match.
- The viewer may still expose compatibility artifacts in the raw file browser, but they are not the primary analytic layer.

## Grounded Theory Framework Rules

The final framework must be established through grounded-theory logic rather than imposed in advance.

- Open coding must begin from the source material and preserve incident-level diversity. Do not start from a fixed theory template.
- Axial coding must group and relate the emergent codes into higher-order categories, explicitly documenting conditions, phenomena, context, actions/interactions, and consequences.
- Selective coding must identify one core category or core mechanism that integrates the axial categories into a single explanatory storyline.
- A named framework such as `L-I-V` may be used in the final integration only if the workflow explicitly demonstrates how that framework was grounded in the accumulated axial categories and memos.
- If a sensitizing concept or predefined lens is used, the run must distinguish:
  - data-grounded categories that emerged from coding
  - final integrative dimensions or framework labels used for theoretical synthesis
- The final framework must preserve rival explanations, boundary conditions, and partial or failed pathways. It must not flatten contradictory cases into one success narrative.
- Representative cases, feedback loops, and policy/practice implications must all remain traceable to grounded categories and ultimately to source-level provenance.

## Thematic Analysis Framework Rules

Thematic analysis is a separate analytic mode and must not be mislabeled as grounded theory.

- The workflow may use a user-specified theoretical framework, codebook, or sensitizing lens as the organizing scaffold when `analysis_method = thematic_analysis`.
- Themes may be constructed deductively, inductively, or through a hybrid approach, but the run must state which strategy was used.
- The final thematic structure should distinguish:
  - coding units or coded excerpts
  - candidate themes and subthemes
  - the interpretive framework used for organizing those themes
- If a user-specified framework is used, the output must say so explicitly rather than presenting the framework as though it emerged entirely from the data.
- Thematic analysis outputs should still preserve provenance, negative or disconfirming material, and enough intermediate artifacts for auditability.

## Output Rules

- `core_theory` must contain both the core category and a complete theory storyline written as a coherent explanation.
- `axial_codes` must be a serialized JSON string representing the axial-category network, not a prose paragraph.
- `artifacts_root_dir` must point to the run directory where every node artifact is preserved and exposed.
- `intermediate_artifacts` must enumerate the concrete artifact files produced by each node so the caller can inspect the full trail.
- `coverage_report` must summarize the coverage checks for Node A and Node B and must explicitly report failure if any original text span was lost.
- The output must explicitly state which method was used: `grounded_theory` or `thematic_analysis`.
- If `grounded_theory` is used, the final framework must be described as having been built through open coding, axial coding, and selective coding rather than as a preloaded template.
- If `thematic_analysis` is used and the user has specified a framework, the output may organize themes with that framework, but it must clearly mark the framework as user-specified or externally supplied.
- If the source text is too short, fragmented, or missing, say that grounded-theory coding cannot be completed reliably and explain the limitation.

## Script Resources

- `scripts/prepare_hybrid_segments.py`: deterministic preprocessor for Node A. It converts raw text into ordered atomic units and suggested LLM batches while preserving exact source spans.
- `scripts/validate_lossless_coverage.py`: strict verifier for Node A outputs. It checks exact reconstruction of the original text and enforces one-time usage of every atomic unit.

## Viewer

This skill bundle includes a local visualization page at `{baseDir}/viewer/index.html`.

- Open the HTML file directly in a browser.
- Use the page's folder picker to select either the `runs` directory or the whole skill directory.
- The viewer will read the current run structure directly from local files without requiring a prebuilt index.
- The viewer is intended to expose the native source cases, evidence excerpts, subcategories, axial categories, selective-coding objects, and the progressive relations across open coding, axial coding, and selective coding.
- The viewer should be assumed to work against the canonical native run layout, with compatibility-layer files treated as secondary exports only.
