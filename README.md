# Qualitative Research Coding Skill

This project packages a qualitative-research coding skill for long-form analysis, plus local tooling for hybrid segmentation, strict coverage validation, run artifact inspection, and browser-based visualization.

简短说明：该项目用于对访谈、观察、田野笔记等质性材料进行编码分析，支持扎根理论与主题分析法，能够保留完整中间产物、校验文本覆盖，并通过网页查看跨层级编码关系与运行结果。

## What It Contains

- `SKILL.md`: skill trigger and execution instructions for the agent/runtime
- `openclaw/`: manifest, input schema, output schema, and workflow binding
- `scripts/`: helper programs for deterministic pre-segmentation and lossless validation
- `references/`: grounded-theory method notes
- `runs/`: execution outputs organized by run directory
- `viewer/`: standalone HTML viewer for browsing run artifacts and coding relationships

## Expected Run Structure

Each execution should be written under:

```text
runs/run-YYYY-MM-DD-NNN/
```

Each run is expected to follow the current structure:

```text
runs/run-2026-04-20-001/
├── source_snapshot.txt
├── final_output.json
├── framework_integration.json
├── node_a/
│   ├── atomic_units.json
│   ├── batch_plan.json
│   ├── node_a_validation_report.json
│   └── slices.json
├── node_b/
│   └── open_codes.json
├── node_c/
│   └── axial_network.json
├── node_d/
│   └── memos.json
└── node_e/
    └── selective_coding.json
```

The included viewer assumes future run directories keep this same structure.

## Viewer

Open:

```text
viewer/index.html
```

Usage:

1. Open the HTML file directly in a browser.
2. Click the folder picker.
3. Select either:
   - the `runs` directory, or
   - the whole `qualitative-research-coding-skill` directory
4. Browse the imported runs, node artifacts, atomic units, and three-level coding relationships.

The viewer does not require a generated manifest or local web server for basic use.

## Scripts

### Hybrid Segmentation Preprocessor

```bash
python3 ./scripts/prepare_hybrid_segments.py \
  --input input.txt \
  --output atomic_units.json \
  --batch-output batch_plan.json
```

This generates deterministic atomic units with exact source spans and suggested LLM batch groupings.

### Lossless Coverage Validator

```bash
python3 ./scripts/validate_lossless_coverage.py \
  --input input.txt \
  --atomic-units atomic_units.json \
  --slices slices.json \
  --output node_a_validation_report.json
```

This checks that Node A slices reconstruct the original text exactly and use each atomic unit exactly once.

## Notes

- `runs/` is ignored by git in `.gitignore`.
- `*.zip` archives are also ignored.
- The viewer is designed for auditability: it exposes all node outputs, final outputs, framework mapping, cross-layer links, and atomic-unit level evidence.
