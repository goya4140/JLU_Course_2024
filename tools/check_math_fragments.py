#!/usr/bin/env python3
"""Report Markdown lines that may expose raw or incompatible LaTeX in Docsify."""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TARGET = ROOT
EXCLUDED_PARTS = {".git", ".github"}

RAW_LATEX_RE = re.compile(
    r"(?<!\$)\\(?:boxed|frac|sum|lim|left[{}]|right[{}]|begin\{|end\{)"
)
UNSUPPORTED_NOT_RE = re.compile(r"\\not\{[^{}]+\}")
MATRIX_ROW_COLLISION_RE = re.compile(r"\\begin\{matrix\}[^$\n]*\\\\[A-Za-z]")


def iter_markdown_files(target: Path) -> list[Path]:
    if target.is_file():
        return [target]
    return sorted(
        path for path in target.rglob("*.md")
        if not any(part in EXCLUDED_PARTS for part in path.relative_to(ROOT).parts)
    )


def check_file(path: Path) -> list[tuple[int, str]]:
    findings: list[tuple[int, str]] = []
    in_fenced_code = False
    in_display_math = False

    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        stripped = line.strip()
        if stripped.startswith("```"):
            in_fenced_code = not in_fenced_code
            continue
        if in_fenced_code:
            continue
        if stripped in {"$$", ">$$", "> $$"}:
            in_display_math = not in_display_math
            continue
        if in_display_math:
            if "$" in line and not stripped.startswith(("$$", ">$$", "> $$")):
                findings.append((line_number, f"nested-dollar-in-display: {line.strip()}"))
            continue
        if RAW_LATEX_RE.search(line) and "$" not in line:
            findings.append((line_number, f"raw-latex: {line.strip()}"))
        if UNSUPPORTED_NOT_RE.search(line):
            findings.append((line_number, f"unsupported-not: {line.strip()}"))
        if MATRIX_ROW_COLLISION_RE.search(line):
            findings.append((line_number, f"matrix-row-collision: {line.strip()}"))

    return findings


def main() -> int:
    target = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else DEFAULT_TARGET
    has_findings = False

    for path in iter_markdown_files(target):
        findings = check_file(path)
        if not findings:
            continue
        has_findings = True
        relative = path.relative_to(ROOT)
        for line_number, line in findings:
            print(f"{relative}:{line_number}: {line}")

    return 1 if has_findings else 0


if __name__ == "__main__":
    raise SystemExit(main())
