#!/usr/bin/env python3
"""Export quiz questions from build_quiz_python_docx.py → quiz_data.json."""

from __future__ import annotations

import ast
import json
from pathlib import Path

OUTPUT = Path(__file__).parent / "quiz_data.json"

# Repo độc lập: trỏ QUIZ_BUILD_SCRIPT tới file build (tuỳ chọn)
# VD: export QUIZ_BUILD_SCRIPT=../build_quiz_python_docx.py
import os

BUILD_SCRIPT = Path(os.environ["QUIZ_BUILD_SCRIPT"]) if os.getenv("QUIZ_BUILD_SCRIPT") else None


def _const(node: ast.AST):
    return node.value if isinstance(node, ast.Constant) else None


def export() -> list[dict]:
    if BUILD_SCRIPT is None or not BUILD_SCRIPT.is_file():
        raise SystemExit(
            "Chưa có QUIZ_BUILD_SCRIPT.\n"
            "  • Sửa trực tiếp quiz_data.json, hoặc\n"
            "  • export QUIZ_BUILD_SCRIPT=/path/to/build_quiz_python_docx.py"
        )
    module = ast.parse(BUILD_SCRIPT.read_text(encoding="utf-8"))
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
        if num is None or question is None or not isinstance(opts_node, ast.List):
            continue
        opts: dict[str, str] = {}
        for elt in opts_node.elts:
            if isinstance(elt, ast.Tuple) and len(elt.elts) == 2:
                k, v = _const(elt.elts[0]), _const(elt.elts[1])
                if k is not None and v is not None:
                    opts[str(k)] = str(v)
        questions.append(
            {
                "id": int(num),
                "tag": tag or "",
                "question": str(question),
                "options": opts,
                "answer": str(answer) if answer else "",
            }
        )
    questions.sort(key=lambda q: q["id"])
    return questions


if __name__ == "__main__":
    data = export()
    if not data:
        raise SystemExit("No questions exported")
    OUTPUT.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Exported {len(data)} questions → {OUTPUT}")
