#!/usr/bin/env python3
"""
Prepare deterministic atomic units for hybrid program + LLM segmentation.

Usage:
    prepare_hybrid_segments.py --input input.txt --output atomic_units.json
    prepare_hybrid_segments.py --input input.txt --output atomic_units.json --batch-output batch_plan.json
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="Path to the raw interview text file.")
    parser.add_argument("--output", required=True, help="Path to write atomic units JSON.")
    parser.add_argument(
        "--batch-output",
        required=False,
        help="Optional path to write suggested LLM batch groups JSON.",
    )
    parser.add_argument(
        "--target-batch-chars",
        type=int,
        default=3000,
        help="Approximate character budget for each suggested LLM batch.",
    )
    return parser.parse_args()


def paragraph_spans(text: str) -> list[tuple[int, int]]:
    spans: list[tuple[int, int]] = []
    start = 0
    text_length = len(text)

    while start < text_length:
        boundary = re.search(r"\n\s*\n", text[start:])
        if boundary is None:
            spans.append((start, text_length))
            break

        sep_start = start + boundary.start()
        sep_end = start + boundary.end()
        next_start = sep_end

        while next_start < text_length and text[next_start].isspace():
            next_start += 1

        spans.append((start, next_start))
        start = next_start

    if not spans and text:
        spans.append((0, text_length))

    return [(span_start, span_end) for span_start, span_end in spans if span_end > span_start]


def build_atomic_units(text: str) -> list[dict]:
    units: list[dict] = []

    for index, (start, end) in enumerate(paragraph_spans(text), start=1):
        source_text = text[start:end]
        unit_id = f"u{index:05d}"
        units.append(
            {
                "unit_id": unit_id,
                "order": index,
                "source_text": source_text,
                "source_span_start": start,
                "source_span_end": end,
                "char_length": len(source_text),
            }
        )

    return units


def build_batches(units: list[dict], target_batch_chars: int) -> list[dict]:
    batches: list[dict] = []
    current_units: list[dict] = []
    current_length = 0
    batch_index = 1

    for unit in units:
        projected_length = current_length + unit["char_length"]
        if current_units and projected_length > target_batch_chars:
            batches.append(make_batch(batch_index, current_units))
            batch_index += 1
            current_units = []
            current_length = 0

        current_units.append(unit)
        current_length += unit["char_length"]

    if current_units:
        batches.append(make_batch(batch_index, current_units))

    return batches


def make_batch(batch_index: int, units: list[dict]) -> dict:
    return {
        "batch_id": f"b{batch_index:03d}",
        "unit_ids": [unit["unit_id"] for unit in units],
        "source_span_start": units[0]["source_span_start"],
        "source_span_end": units[-1]["source_span_end"],
        "char_length": sum(unit["char_length"] for unit in units),
        "source_text": "".join(unit["source_text"] for unit in units),
    }


def dump_json(path: str, payload: dict) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    args = parse_args()
    text = Path(args.input).read_text(encoding="utf-8")
    atomic_units = build_atomic_units(text)

    payload = {
        "source_length": len(text),
        "unit_count": len(atomic_units),
        "atomic_units": atomic_units,
    }
    dump_json(args.output, payload)

    if args.batch_output:
        batch_payload = {
            "source_length": len(text),
            "batch_count": 0,
            "batches": [],
        }
        batches = build_batches(atomic_units, args.target_batch_chars)
        batch_payload["batch_count"] = len(batches)
        batch_payload["batches"] = batches
        dump_json(args.batch_output, batch_payload)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
