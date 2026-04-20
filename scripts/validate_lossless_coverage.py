#!/usr/bin/env python3
"""
Validate that Node A semantic slices reconstruct the original text exactly and
use every atomic unit exactly once.

Usage:
    validate_lossless_coverage.py \
      --input input.txt \
      --atomic-units atomic_units.json \
      --slices slices_full.json \
      --output node_a_validation_report.json
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="Path to the raw interview text file.")
    parser.add_argument("--atomic-units", required=True, help="Path to atomic units JSON.")
    parser.add_argument("--slices", required=True, help="Path to Node A semantic slices JSON.")
    parser.add_argument("--output", required=True, help="Path to write validation report JSON.")
    return parser.parse_args()


def load_json(path: str) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def find_missing_spans(source_text: str, reconstructed_text: str) -> list[str]:
    if source_text == reconstructed_text:
        return []

    mismatch_index = 0
    max_common = min(len(source_text), len(reconstructed_text))
    while mismatch_index < max_common and source_text[mismatch_index] == reconstructed_text[mismatch_index]:
        mismatch_index += 1

    source_tail = source_text[mismatch_index:]
    preview = source_tail[:120]
    return [f"mismatch_from_char_{mismatch_index}: {preview!r}"]


def main() -> int:
    args = parse_args()
    source_text = Path(args.input).read_text(encoding="utf-8")
    atomic_payload = load_json(args.atomic_units)
    slices_payload = load_json(args.slices)

    atomic_units = atomic_payload["atomic_units"]
    slices = slices_payload["slices"] if "slices" in slices_payload else slices_payload

    known_unit_ids = [unit["unit_id"] for unit in atomic_units]
    known_unit_set = set(known_unit_ids)

    used_unit_ids: list[str] = []
    reconstructed_text_parts: list[str] = []
    unknown_unit_ids: list[str] = []

    for slice_item in slices:
        atomic_unit_ids = slice_item.get("atomic_unit_ids", [])
        used_unit_ids.extend(atomic_unit_ids)
        reconstructed_text_parts.append(slice_item.get("source_text", ""))
        for unit_id in atomic_unit_ids:
            if unit_id not in known_unit_set:
                unknown_unit_ids.append(unit_id)

    reconstructed_text = "".join(reconstructed_text_parts)
    missing_spans = find_missing_spans(source_text, reconstructed_text)

    usage_counter = Counter(used_unit_ids)
    duplicate_unit_ids = sorted([unit_id for unit_id, count in usage_counter.items() if count > 1])
    missing_unit_ids = sorted([unit_id for unit_id in known_unit_ids if usage_counter[unit_id] == 0])

    pass_status = (
        not missing_spans
        and not duplicate_unit_ids
        and not missing_unit_ids
        and not unknown_unit_ids
        and reconstructed_text == source_text
    )

    report = {
        "source_length": len(source_text),
        "slice_count": len(slices),
        "node_a_coverage_status": "pass" if pass_status else "fail",
        "node_a_missing_spans": missing_spans,
        "node_a_duplicate_unit_ids": duplicate_unit_ids,
        "node_a_missing_unit_ids": missing_unit_ids,
        "node_a_unknown_unit_ids": sorted(set(unknown_unit_ids)),
        "verification_notes": (
            "Validated exact reconstruction from Node A semantic slices and "
            "one-time usage of all deterministic atomic units."
        ),
    }

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    return 0 if pass_status else 1


if __name__ == "__main__":
    raise SystemExit(main())
