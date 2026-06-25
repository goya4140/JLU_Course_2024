#!/usr/bin/env python3
"""Generate the Docsify sidebar from repository Markdown and PDF files."""

from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "_sidebar.md"

EXCLUDED_DIRS = {
    ".git",
    ".github",
    "tools",
}

EXCLUDED_FILE_PARTS = {
    "instruction",
    "prompt",
}

INCLUDED_SUFFIXES = {".md", ".pdf"}


def should_include(path: Path) -> bool:
    relative = path.relative_to(ROOT)
    parts = relative.parts
    if any(part in EXCLUDED_DIRS for part in parts):
        return False
    if path.name in {"README.md", "_sidebar.md"} and len(parts) == 1:
        return False
    name = path.name.lower()
    if any(part in name for part in EXCLUDED_FILE_PARTS):
        return False
    return path.suffix.lower() in INCLUDED_SUFFIXES


def sort_key(path: Path) -> tuple[str, ...]:
    return tuple(part.casefold() for part in path.relative_to(ROOT).parts)


def title_for(path: Path) -> str:
    name = path.stem if path.suffix.lower() in INCLUDED_SUFFIXES else path.name
    return name.replace("_", " ")


def link_for(path: Path) -> str:
    relative = path.relative_to(ROOT).as_posix()
    encoded = quote(relative, safe="/")
    if path.suffix.lower() == ".pdf":
        return f"{encoded} ':ignore'"
    return f"/{encoded}"


def build_sidebar() -> str:
    lines = [
        "- [首页](README.md)",
        "",
    ]

    top_level_dirs = [
        item for item in sorted(ROOT.iterdir(), key=lambda p: p.name.casefold())
        if item.is_dir() and item.name not in EXCLUDED_DIRS
    ]

    for directory in top_level_dirs:
        if not any(path.is_file() and should_include(path) for path in directory.rglob("*")):
            continue

        lines.append(f"- **{directory.name}**")
        append_directory(lines, directory, 1)
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def append_directory(lines: list[str], directory: Path, level: int) -> None:
    files = sorted(
        (path for path in directory.iterdir() if path.is_file() and should_include(path)),
        key=sort_key,
    )
    child_dirs = sorted(
        (
            path for path in directory.iterdir()
            if path.is_dir()
            and path.name not in EXCLUDED_DIRS
            and any(child.is_file() and should_include(child) for child in path.rglob("*"))
        ),
        key=lambda path: path.name.casefold(),
    )

    indent = "  " * level
    for file_path in files:
        lines.append(f"{indent}- [{title_for(file_path)}]({link_for(file_path)})")

    for child_dir in child_dirs:
        lines.append(f"{indent}- **{child_dir.name}**")
        append_directory(lines, child_dir, level + 1)


if __name__ == "__main__":
    OUTPUT.write_text(build_sidebar(), encoding="utf-8")
