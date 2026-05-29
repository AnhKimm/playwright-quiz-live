"""Tạo file HTML báo cáo trong thư mục report/."""

from __future__ import annotations

import html
import re
from datetime import datetime
from pathlib import Path
from typing import Any

OPTION_KEYS = ("A", "B", "C", "D")
REPORT_DIR = Path(__file__).parent / "report"


def ensure_report_dir() -> Path:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    return REPORT_DIR


def format_timestamp(when: datetime | None = None) -> str:
    return (when or datetime.now()).strftime("%Y%m%d_%H%M%S")


def format_display_time(when: datetime | None = None) -> str:
    return (when or datetime.now()).strftime("%d/%m/%Y %H:%M:%S")


def sanitize_filename(name: str, max_len: int = 48) -> str:
    s = re.sub(r"[^\w\s\-]", "", name.strip(), flags=re.UNICODE)
    s = re.sub(r"\s+", "_", s)
    s = s.strip("_") or "player"
    return s[:max_len]


def _esc(text: str) -> str:
    return html.escape(str(text or ""), quote=True)


def _option_body(text: str, as_code: bool) -> str:
    raw = str(text or "").strip()
    if as_code:
        return f'<pre class="code-block"><code class="language-python">{_esc(raw)}</code></pre>'
    return f'<span class="opt-text">{_esc(raw)}</span>'


def render_options_html(
    options: dict[str, str],
    correct: str,
    *,
    user_choice: str = "",
    options_as_code: bool = False,
) -> str:
    correct = str(correct or "").upper()
    user = str(user_choice or "").upper()
    parts: list[str] = []
    for key in OPTION_KEYS:
        if key not in options:
            continue
        classes = ["opt-btn"]
        if user:
            if key == correct:
                classes.append("opt-correct")
            elif key == user:
                classes.append("opt-wrong")
        elif key == correct:
            classes.append("opt-correct")
        parts.append(
            f'<div class="{" ".join(classes)}">'
            f'<span class="opt-label">{key}.</span>'
            f'{_option_body(options[key], options_as_code)}'
            f"</div>"
        )
    return f'<div class="options options-readonly">{"".join(parts)}</div>'


def _page_shell(title: str, body: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{_esc(title)}</title>
  <link rel="stylesheet" href="/static/style.css" />
</head>
<body>
  <div class="container report-page">
{body}
  </div>
</body>
</html>"""


def build_wrong_stats_html(
    *,
    room_code: str,
    finished_at: datetime,
    wrong_stats: list[dict[str, Any]],
    ranking: list[dict],
    total: int,
) -> str:
    blocks: list[str] = []
    blocks.append(
        f"<h1>Thống kê câu sai nhiều nhất</h1>"
        f'<p class="sub">Phòng <strong>{_esc(room_code)}</strong> · '
        f"Kết thúc: {_esc(format_display_time(finished_at))} · {total} câu</p>"
    )

    if ranking:
        rows = "".join(
            f"<tr><td>{i + 1}</td><td>{_esc(r.get('name', ''))}</td>"
            f"<td>{r.get('score', 0)}/{total}</td></tr>"
            for i, r in enumerate(ranking)
        )
        blocks.append(
            "<div class=\"card\"><h2>Bảng xếp hạng</h2>"
            "<table class=\"rank-table\"><thead><tr><th>#</th><th>Tên</th><th>Điểm</th></tr></thead>"
            f"<tbody>{rows}</tbody></table></div>"
        )

    for rank, item in enumerate(wrong_stats, start=1):
        names_html = ""
        if item.get("wrong_players"):
            lis = "".join(
                f"<li>{_esc(wp.get('name', ''))}"
                f'<span class="wrong-choice">'
                f" ({'chọn ' + _esc(wp['choice']) if wp.get('choice') else 'chưa trả lời'})"
                f"</span></li>"
                for wp in item["wrong_players"]
            )
            names_html = (
                '<div class="wrong-names-box">'
                '<p class="wrong-names-title">Thí sinh trả lời sai:</p>'
                f'<ul class="wrong-names-list">{lis}</ul></div>'
            )
        else:
            names_html = (
                '<div class="wrong-names-box">'
                '<p class="wrong-names-title">Tất cả thí sinh trả lời đúng</p></div>'
            )

        img_html = ""
        if item.get("image"):
            img_html = f'<div class="q-image-wrap"><img class="q-image" src="{_esc(item["image"])}" alt="" /></div>'

        opts_html = render_options_html(
            item.get("options") or {},
            item.get("answer", ""),
            options_as_code=bool(item.get("options_as_code")),
        )
        blocks.append(
            f'<article class="card wrong-stats-card">'
            f'<p class="q-meta">#{rank} · Câu {item["index"] + 1} · {_esc(item.get("tag", ""))} · '
            f'{item.get("wrong_count", 0)} người sai</p>'
            f'<p class="q-text" style="white-space:pre-line">{_esc(item.get("question", ""))}</p>'
            f"{img_html}"
            f"{opts_html}"
            f"{names_html}"
            f"</article>"
        )

    return _page_shell(f"Thống kê câu sai — {room_code}", "\n".join(blocks))


def build_player_review_html(
    *,
    player_name: str,
    finished_at: datetime,
    questions: list[dict[str, Any]],
    my_answers: list[str],
    score: int,
    total: int,
) -> str:
    cards: list[str] = []
    for idx, q in enumerate(questions):
        user = str((my_answers[idx] if idx < len(my_answers) else "") or "").upper()
        correct = str(q.get("answer", "")).upper()
        status = (
            " · Chưa trả lời"
            if not user
            else (" · ✓ Đúng" if user == correct else " · ✗ Sai")
        )
        img_html = ""
        if q.get("image"):
            img_html = f'<div class="q-image-wrap"><img class="q-image" src="{_esc(q["image"])}" alt="" /></div>'
        expl_html = ""
        if q.get("explanation"):
            expl_html = (
                '<div class="review-explanation">'
                '<p class="review-explanation-title">Giải thích</p>'
                f'<p class="review-explanation-body">{_esc(q["explanation"])}</p></div>'
            )
        opts_html = render_options_html(
            q.get("options") or {},
            correct,
            user_choice=user,
            options_as_code=bool(q.get("options_as_code")),
        )
        cards.append(
            f'<article class="card review-card">'
            f'<p class="q-meta">Câu {idx + 1}/{total} · {_esc(q.get("tag", ""))}{status}</p>'
            f'<p class="q-text" style="white-space:pre-line">{_esc(q.get("question", ""))}</p>'
            f"{img_html}"
            f"{opts_html}"
            f"{expl_html}"
            f"</article>"
        )

    header = (
        f"<h1>Bài làm — {_esc(player_name)}</h1>"
        f'<p class="sub">Kết thúc: {_esc(format_display_time(finished_at))} · '
        f"Đúng {score}/{total} câu</p>"
    )
    return _page_shell(f"Bài làm — {player_name}", header + "\n".join(cards))


def save_session_reports(
    session: Any,
    *,
    wrong_stats: list[dict[str, Any]],
    review_questions: list[dict[str, Any]],
    ranking: list[dict],
    finished_at: datetime | None = None,
) -> dict[str, Any]:
    """Lưu HTML vào report/; trả về URL path cho host và từng player."""
    when = finished_at or datetime.now()
    ts = format_timestamp(when)
    out_dir = ensure_report_dir()
    total = len(review_questions)

    host_name = f"wrong_stats_{ts}.html"
    host_path = out_dir / host_name
    host_path.write_text(
        build_wrong_stats_html(
            room_code=session.code,
            finished_at=when,
            wrong_stats=wrong_stats,
            ranking=ranking,
            total=total,
        ),
        encoding="utf-8",
    )
    host_url = f"/reports/{host_name}"

    used_bases: dict[str, int] = {}
    player_urls: dict[str, str] = {}

    for pid, p in session.players.items():
        base = sanitize_filename(p.get("name", "player"))
        n = used_bases.get(base, 0)
        used_bases[base] = n + 1
        file_base = f"{base}_{ts}" if n == 0 else f"{base}_{pid[:6]}_{ts}"
        fname = f"{file_base}.html"
        my_answers = [
            str((p.get("answers") or {}).get(i, "") or "").upper()
            for i in range(total)
        ]
        (out_dir / fname).write_text(
            build_player_review_html(
                player_name=p.get("name", "Thí sinh"),
                finished_at=when,
                questions=review_questions,
                my_answers=my_answers,
                score=p.get("score", 0),
                total=total,
            ),
            encoding="utf-8",
        )
        player_urls[pid] = f"/reports/{fname}"

    return {"host_report": host_url, "player_reports": player_urls, "finished_at": ts}
