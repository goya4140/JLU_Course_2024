#!/usr/bin/env python3
"""Generate the Docsify sidebar from repository Markdown and PDF files."""

import re
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

OVERVIEW_FILES = [
    ROOT / "课程总览.md",
    ROOT / "大二下课程总览.md",
]

MICRO_COURSE_DIR = "2_2微机系统"
MICRO_TYPE_ORDER = {
    "复习资料": 0,
    "习题精讲": 1,
    "自学理解手册": 2,
}
MICRO_FILE_RE = re.compile(r"^(?P<number>\d+)_(?P<title>.+?)(?P<kind>习题精讲|自学理解手册)?$")

SEMESTER_NAMES = {
    "1_1": "大一上",
    "1_2": "大一下",
    "2_1": "大二上",
    "2_2": "大二下",
}


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
    title = display_name(name)
    if path.parent.name == "2_2概率论":
        title = re.sub(r"\s+复习资料$", "", title)
    return title


def display_name(name: str) -> str:
    return name.replace("_", " ").replace("  ", " ").strip()


def split_course_dir(directory: Path) -> tuple[str, str]:
    prefix = directory.name[:3]
    semester = SEMESTER_NAMES.get(prefix, "其他")
    course = directory.name[3:] if prefix in SEMESTER_NAMES else directory.name
    return semester, display_name(course)


def link_for(path: Path) -> str:
    relative = path.relative_to(ROOT).as_posix()
    encoded = quote(relative, safe="/")
    if path.suffix.lower() == ".pdf":
        return f"/{encoded} ':ignore'"
    return f"/{encoded}"


def build_sidebar() -> str:
    lines = [
        "- [首页](README.md)",
    ]

    for overview in OVERVIEW_FILES:
        if overview.exists() and should_include(overview):
            lines.append(f"- [{title_for(overview)}]({link_for(overview)})")

    lines.append("")

    semester_courses: dict[str, list[tuple[str, Path]]] = {}
    top_level_dirs = sorted(
        (
            item for item in ROOT.iterdir()
            if item.is_dir() and item.name not in EXCLUDED_DIRS
        ),
        key=lambda p: p.name.casefold(),
    )

    for directory in top_level_dirs:
        if not any(path.is_file() and should_include(path) for path in directory.rglob("*")):
            continue
        semester, course = split_course_dir(directory)
        semester_courses.setdefault(semester, []).append((course, directory))

    semester_order = [
        *SEMESTER_NAMES.values(),
        *sorted(
            name for name in semester_courses
            if name not in SEMESTER_NAMES.values()
        ),
    ]

    for semester in semester_order:
        courses = semester_courses.get(semester)
        if not courses:
            continue
        lines.append(f"- **{semester}**")
        for course, directory in courses:
            lines.append(f"  - **{course}**")
            append_directory(lines, directory, 2)
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def append_directory(lines: list[str], directory: Path, level: int) -> None:
    if directory.name == MICRO_COURSE_DIR:
        append_microcomputer_directory(lines, directory, level)
        return

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
        lines.append(f"{indent}- **{display_name(child_dir.name)}**")
        append_directory(lines, child_dir, level + 1)


def append_microcomputer_directory(lines: list[str], directory: Path, level: int) -> None:
    files = sorted(
        (path for path in directory.iterdir() if path.is_file() and should_include(path)),
        key=sort_key,
    )
    chapters: dict[str, dict[str, object]] = {}
    standalone: list[Path] = []

    for file_path in files:
        match = MICRO_FILE_RE.match(file_path.stem)
        if not match:
            standalone.append(file_path)
            continue

        number = match.group("number")
        kind = match.group("kind") or "复习资料"
        title = display_name(match.group("title"))
        chapter = chapters.setdefault(number, {"title": title, "items": []})
        if kind == "复习资料":
            chapter["title"] = title
        chapter["items"].append((kind, file_path))

    indent = "  " * level
    child_indent = "  " * (level + 1)
    for number in sorted(chapters, key=lambda value: int(value)):
        chapter = chapters[number]
        lines.append(f"{indent}- **第{number}章 {chapter['title']}**")
        items = sorted(
            chapter["items"],
            key=lambda item: (MICRO_TYPE_ORDER.get(item[0], 99), sort_key(item[1])),
        )
        for kind, file_path in items:
            lines.append(f"{child_indent}- [{kind}]({link_for(file_path)})")

    for file_path in standalone:
        lines.append(f"{indent}- [{title_for(file_path)}]({link_for(file_path)})")


if __name__ == "__main__":
    OUTPUT.write_text(build_sidebar(), encoding="utf-8")
