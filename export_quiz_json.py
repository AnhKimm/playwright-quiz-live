#!/usr/bin/env python3
"""Export quiz questions → quiz_data.json (ưu tiên Word, fallback build script)."""

from __future__ import annotations

import ast
import json
import os
import re
from pathlib import Path

OUTPUT = Path(__file__).parent / "quiz_data.json"
QUIZ_DIR = Path(__file__).resolve().parent
REPO_ROOT = QUIZ_DIR.parent
DOCX = REPO_ROOT / "Quiz_Playwright_35_Cau_Python.docx"

_DEFAULT_BUILD = REPO_ROOT / "build_quiz_python_docx.py"
BUILD_SCRIPT = (
    Path(os.environ["QUIZ_BUILD_SCRIPT"])
    if os.getenv("QUIZ_BUILD_SCRIPT")
    else (_DEFAULT_BUILD if _DEFAULT_BUILD.is_file() else None)
)

Q_START = re.compile(r"^Câu\s+(\d+)\s*\[([^\]]+)\]\s*(.*)$", re.I)
OPT_LINE = re.compile(r"^([A-D])\.\s*(.*)$", re.I | re.DOTALL)
ANSWER_LINE = re.compile(r"^✅\s*Đáp án đúng:\s*([A-D])\s*$", re.I)
SECTION = re.compile(r"^✅\s+")


def _strip_option(text: str) -> str:
    return text.strip().lstrip("\n")


def export_from_docx(path: Path) -> list[dict]:
    from docx import Document

    doc = Document(path)
    questions: list[dict] = []
    current: dict | None = None
    last_opt: str | None = None

    def flush() -> None:
        nonlocal current, last_opt
        if current and current.get("answer"):
            row: dict = {
                "id": current["id"],
                "tag": current["tag"],
                "question": current["question"].strip(),
                "options": {k: _strip_option(v) for k, v in current["options"].items()},
                "answer": current["answer"],
            }
            if current.get("explanation"):
                row["explanation"] = current["explanation"].strip()
            questions.append(row)
        current = None
        last_opt = None

    for para in doc.paragraphs:
        t = para.text.strip()
        if not t:
            continue

        m = Q_START.match(t)
        if m:
            flush()
            current = {
                "id": int(m.group(1)),
                "tag": m.group(2).strip(),
                "question": m.group(3).strip(),
                "options": {},
                "answer": "",
                "explanation": "",
            }
            last_opt = None
            continue

        if not current:
            continue

        if SECTION.match(t) and not ANSWER_LINE.match(t):
            continue

        am = ANSWER_LINE.match(t)
        if am:
            current["answer"] = am.group(1).upper()
            current["explanation"] = ""
            last_opt = None
            continue

        if current.get("answer"):
            if t.startswith("※"):
                part = re.sub(r"^※\s*", "", t).strip()
                if part:
                    exp = current.get("explanation") or ""
                    current["explanation"] = f"{exp}\n{part}".strip() if exp else part
                continue
            if SECTION.match(t) and not ANSWER_LINE.match(t):
                continue

        om = OPT_LINE.match(t)
        if om:
            last_opt = om.group(1).upper()
            val = om.group(2)
            if last_opt in current["options"]:
                current["options"][last_opt] += "\n" + val
            else:
                current["options"][last_opt] = val
            continue

        if last_opt and not current["answer"]:
            current["options"][last_opt] += "\n" + t
        elif not current["options"]:
            current["question"] += "\n" + t

    flush()
    questions.sort(key=lambda q: q["id"])
    _merge_preserved_fields(questions)
    return questions


def _merge_preserved_fields(questions: list[dict]) -> None:
    """Giữ trường image (và tương lai) khi export lại từ Word."""
    if not OUTPUT.is_file():
        return
    try:
        old_list = json.loads(OUTPUT.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return
    old = {q["id"]: q for q in old_list if isinstance(q, dict) and "id" in q}
    for q in questions:
        prev = old.get(q["id"], {})
        if prev.get("image"):
            q["image"] = prev["image"]
        if prev.get("options_as_code"):
            q["options_as_code"] = prev["options_as_code"]


def _const(node: ast.AST):
    return node.value if isinstance(node, ast.Constant) else None


def export_from_build(path: Path) -> list[dict]:
    module = ast.parse(path.read_text(encoding="utf-8"))
    questions: list[dict] = []
    for node in ast.walk(module):
        if not isinstance(node, ast.Call):
            continue
        if not (isinstance(node.func, ast.Name) and node.func.id == "add_q"):
            continue
        if len(node.args) < 6:
            continue
        num = _const(node.args[1])
        tag = _const(node.args[2])
        question = _const(node.args[3])
        opts_node = node.args[4]
        answer = _const(node.args[5])
        explanation = _const(node.args[6]) if len(node.args) > 6 else None
        if num is None or question is None or not isinstance(opts_node, ast.List):
            continue
        opts: dict[str, str] = {}
        for elt in opts_node.elts:
            if isinstance(elt, ast.Tuple) and len(elt.elts) == 2:
                k, v = _const(elt.elts[0]), _const(elt.elts[1])
                if k is not None and v is not None:
                    opts[str(k)] = str(v)
        row = {
            "id": int(num),
            "tag": tag or "",
            "question": str(question),
            "options": opts,
            "answer": str(answer) if answer else "",
        }
        if explanation:
            row["explanation"] = str(explanation).strip()
        questions.append(row)
    questions.sort(key=lambda q: q["id"])
    _merge_preserved_fields(questions)
    return questions


def export() -> list[dict]:
    if DOCX.is_file():
        data = export_from_docx(DOCX)
        if data:
            return data
    if BUILD_SCRIPT is None or not BUILD_SCRIPT.is_file():
        raise SystemExit(
            "Không tìm thấy nguồn quiz.\n"
            f"  • Đặt file Word: {DOCX}\n"
            "  • Hoặc export QUIZ_BUILD_SCRIPT=/path/to/build_quiz_python_docx.py"
        )
    return export_from_build(BUILD_SCRIPT)


if __name__ == "__main__":
    data = export()
    if not data:
        raise SystemExit("No questions exported")
    OUTPUT.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Exported {len(data)} questions → {OUTPUT}")
