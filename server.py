#!/usr/bin/env python3
"""
Playwright Quiz Live — realtime session host + players.
Run: uvicorn quiz_live.server:app --reload --host 0.0.0.0 --port 8765
"""

from __future__ import annotations

import asyncio
import json
import os
import random
import secrets
import string
import time
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Header, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

QUESTION_SECONDS = 45
REVEAL_SECONDS = 3
STATIC_DIR = Path(__file__).parent / "static"
QUIZ_JSON = Path(__file__).parent / "quiz_data.json"

app = FastAPI(title="Playwright Quiz Live")
sessions: dict[str, Session] = {}
# host_auth_token -> expiry unix timestamp
host_auth_tokens: dict[str, float] = {}
HOST_AUTH_TTL_SECONDS = 8 * 3600


def get_host_password() -> str:
    """Mật khẩu host — đặt biến môi trường QUIZ_HOST_PASSWORD khi deploy."""
    pwd = os.getenv("QUIZ_HOST_PASSWORD") or os.getenv("HOST_PASSWORD") or ""
    return pwd.strip()


def verify_host_password(password: str) -> bool:
    expected = get_host_password()
    if not expected:
        return False
    return secrets.compare_digest(password.encode(), expected.encode())


def require_host_auth(authorization: str | None = None, x_host_token: str | None = None) -> None:
    token = ""
    if x_host_token:
        token = x_host_token.strip()
    elif authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
    if not token or token not in host_auth_tokens:
        raise HTTPException(401, "Chưa đăng nhập host hoặc phiên hết hạn")
    if host_auth_tokens[token] < time.time():
        host_auth_tokens.pop(token, None)
        raise HTTPException(401, "Phiên host hết hạn — đăng nhập lại")


class HostLoginBody(BaseModel):
    password: str


def load_questions() -> list[dict]:
    if not QUIZ_JSON.exists():
        raise RuntimeError("quiz_data.json missing. Run: python quiz_live/export_quiz_json.py")
    return json.loads(QUIZ_JSON.read_text(encoding="utf-8"))


QUESTIONS = load_questions()


def new_code(length: int = 6) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def shuffle_options(options: dict[str, str]) -> tuple[list[str], dict[str, str]]:
    """Return display order and map display_key -> original_key."""
    keys = list(options.keys())
    random.shuffle(keys)
    return keys, {k: k for k in keys}


class Session:
    def __init__(self, code: str, host_token: str) -> None:
        self.code = code
        self.host_token = host_token
        self.phase = "lobby"  # lobby | question | reveal | finished
        self.current_index = -1
        self.players: dict[str, dict] = {}
        self.host_ws: WebSocket | None = None
        self.player_ws: dict[str, WebSocket] = {}
        self.question_deadline: float = 0
        self.reveal_deadline: float = 0
        self._timer_task: asyncio.Task | None = None
        self.per_question_order: dict[int, list[str]] = {}

    def player_list(self) -> list[dict]:
        return [
            {"id": pid, "name": p["name"], "score": p["score"]}
            for pid, p in self.players.items()
        ]

    async def broadcast(self, message: dict, *, host: bool = True, players: bool = True) -> None:
        dead: list[str] = []
        if host and self.host_ws:
            try:
                await self.host_ws.send_json(message)
            except Exception:
                pass
        if players:
            for pid, ws in list(self.player_ws.items()):
                try:
                    await ws.send_json(message)
                except Exception:
                    dead.append(pid)
        for pid in dead:
            self.player_ws.pop(pid, None)

    def question_payload(self, index: int) -> dict:
        q = QUESTIONS[index]
        order = list(q["options"].keys())
        random.shuffle(order)
        self.per_question_order[index] = order
        return {
            "type": "question",
            "index": index,
            "total": len(QUESTIONS),
            "id": q["id"],
            "tag": q["tag"],
            "question": q["question"],
            "options": {k: q["options"][k] for k in order},
            "duration": QUESTION_SECONDS,
            "deadline": self.question_deadline,
        }

    async def start_quiz(self) -> None:
        if not self.players:
            raise ValueError("Chưa có người tham gia")
        self.current_index = 0
        await self._begin_question()

    async def _begin_question(self) -> None:
        self.phase = "question"
        self.question_deadline = time.time() + QUESTION_SECONDS
        if self._timer_task and not self._timer_task.done():
            self._timer_task.cancel()
        payload = self.question_payload(self.current_index)
        await self.broadcast(payload)
        self._timer_task = asyncio.create_task(self._question_timer())

    async def _question_timer(self) -> None:
        try:
            while self.phase == "question":
                remaining = max(0, int(self.question_deadline - time.time()))
                await self.broadcast(
                    {"type": "tick", "remaining": remaining, "index": self.current_index},
                    host=True,
                    players=True,
                )
                if remaining <= 0:
                    break
                await asyncio.sleep(1)
            await self._reveal_and_advance()
        except asyncio.CancelledError:
            pass

    async def _reveal_and_advance(self) -> None:
        self.phase = "reveal"
        q = QUESTIONS[self.current_index]
        correct = q["answer"]
        for pid, p in self.players.items():
            ans = p["answers"].get(self.current_index)
            if ans == correct:
                p["score"] += 1
        await self.broadcast(
            {
                "type": "reveal",
                "index": self.current_index,
                "correct": correct,
                "scores": self.player_list(),
            }
        )
        self.reveal_deadline = time.time() + REVEAL_SECONDS
        await asyncio.sleep(REVEAL_SECONDS)
        if self.current_index + 1 >= len(QUESTIONS):
            await self._finish()
        else:
            self.current_index += 1
            await self._begin_question()

    async def _finish(self) -> None:
        self.phase = "finished"
        if self._timer_task and not self._timer_task.done():
            self._timer_task.cancel()
        ranked = sorted(self.player_list(), key=lambda x: (-x["score"], x["name"]))
        await self.broadcast({"type": "finished", "ranking": ranked, "total": len(QUESTIONS)})

    async def submit_answer(self, player_id: str, choice: str) -> None:
        if self.phase != "question":
            return
        if player_id not in self.players:
            return
        idx = self.current_index
        if idx < 0:
            return
        self.players[player_id]["answers"][idx] = choice
        self.players[player_id]["answer_times"][idx] = round(
            QUESTION_SECONDS - max(0, self.question_deadline - time.time()), 2
        )
        await self.broadcast(
            {
                "type": "player_answered",
                "player_id": player_id,
                "name": self.players[player_id]["name"],
                "answered_count": sum(
                    1 for p in self.players.values() if idx in p["answers"]
                ),
                "total_players": len(self.players),
            },
            host=True,
            players=False,
        )


def get_session(code: str) -> Session:
    code = code.upper().strip()
    if code not in sessions:
        raise HTTPException(404, "Mã phòng không tồn tại")
    return sessions[code]


@app.post("/api/host/login")
def host_login(body: HostLoginBody) -> dict:
    if not get_host_password():
        raise HTTPException(
            503,
            "Server chưa cấu hình QUIZ_HOST_PASSWORD. Liên hệ admin.",
        )
    if not verify_host_password(body.password):
        raise HTTPException(401, "Mã đăng nhập host không đúng")
    token = secrets.token_urlsafe(32)
    host_auth_tokens[token] = time.time() + HOST_AUTH_TTL_SECONDS
    return {"host_auth_token": token, "expires_in": HOST_AUTH_TTL_SECONDS}


@app.get("/api/host/config")
def host_config() -> dict:
    return {"login_required": bool(get_host_password())}


@app.post("/api/sessions")
def create_session(
    x_host_token: str | None = Header(default=None, alias="X-Host-Token"),
    authorization: str | None = Header(default=None),
) -> dict:
    if not get_host_password():
        raise HTTPException(
            503,
            "Server chưa cấu hình QUIZ_HOST_PASSWORD. Liên hệ admin.",
        )
    require_host_auth(authorization, x_host_token)
    code = new_code()
    host_token = secrets.token_urlsafe(16)
    while code in sessions:
        code = new_code()
    sessions[code] = Session(code, host_token)
    return {
        "code": code,
        "host_token": host_token,
        "questions": len(QUESTIONS),
        "seconds_per_question": QUESTION_SECONDS,
        "host_url": f"/host.html?code={code}",
        "play_url": f"/play.html?code={code}",
    }


@app.get("/api/sessions/{code}/info")
def session_info(code: str) -> dict:
    s = get_session(code)
    return {
        "code": s.code,
        "phase": s.phase,
        "players": len(s.players),
        "current_index": s.current_index,
        "total": len(QUESTIONS),
    }


@app.websocket("/ws/host/{code}")
async def ws_host(websocket: WebSocket, code: str, token: str = "") -> None:
    await websocket.accept()
    code = code.upper()
    if code not in sessions or sessions[code].host_token != token:
        await websocket.send_json({"type": "error", "message": "Token host không hợp lệ"})
        await websocket.close()
        return
    session: Session = sessions[code]
    session.host_ws = websocket
    await websocket.send_json(
        {
            "type": "lobby",
            "code": code,
            "players": session.player_list(),
            "total_questions": len(QUESTIONS),
            "seconds_per_question": QUESTION_SECONDS,
        }
    )
    try:
        while True:
            msg = await websocket.receive_json()
            action = msg.get("action")
            if action == "start":
                try:
                    await session.start_quiz()
                except ValueError as e:
                    await websocket.send_json({"type": "error", "message": str(e)})
            elif action == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        session.host_ws = None


@app.websocket("/ws/play/{code}")
async def ws_play(websocket: WebSocket, code: str) -> None:
    await websocket.accept()
    code = code.upper()
    if code not in sessions:
        await websocket.send_json({"type": "error", "message": "Mã phòng không tồn tại"})
        await websocket.close()
        return
    session = sessions[code]
    player_id: str | None = None
    try:
        hello = await websocket.receive_json()
        if hello.get("action") != "join":
            await websocket.close()
            return
        name = (hello.get("name") or "").strip()[:40]
        if not name:
            await websocket.send_json({"type": "error", "message": "Vui lòng nhập tên"})
            await websocket.close()
            return
        if session.phase != "lobby":
            await websocket.send_json(
                {"type": "error", "message": "Quiz đã bắt đầu — không thể tham gia"}
            )
            await websocket.close()
            return
        player_id = secrets.token_hex(8)
        session.players[player_id] = {
            "name": name,
            "score": 0,
            "answers": {},
            "answer_times": {},
            "joined_at": time.time(),
            "focus_lost": 0,
        }
        session.player_ws[player_id] = websocket
        await websocket.send_json(
            {
                "type": "joined",
                "player_id": player_id,
                "code": code,
                "rules": [
                    "Mỗi câu 45 giây — hết giờ không gửi được đáp án",
                    "Không dùng AI / không tra cứu — tự làm",
                    "Không copy câu hỏi; giữ tab quiz đang mở",
                ],
            }
        )
        await session.broadcast(
            {"type": "lobby_update", "players": session.player_list()},
            host=True,
            players=False,
        )
        while True:
            msg = await websocket.receive_json()
            action = msg.get("action")
            if action == "answer" and player_id:
                await session.submit_answer(player_id, str(msg.get("choice", "")).upper())
            elif action == "focus_lost" and player_id:
                session.players[player_id]["focus_lost"] += 1
                await session.broadcast(
                    {
                        "type": "focus_warning",
                        "player_id": player_id,
                        "name": session.players[player_id]["name"],
                        "count": session.players[player_id]["focus_lost"],
                    },
                    host=True,
                    players=False,
                )
    except WebSocketDisconnect:
        pass
    finally:
        if player_id:
            session.player_ws.pop(player_id, None)
            session.players.pop(player_id, None)
            await session.broadcast(
                {"type": "lobby_update", "players": session.player_list()},
                host=True,
                players=False,
            )


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "questions": len(QUESTIONS)}


@app.get("/")
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/{page}.html")
def html_pages(page: str) -> FileResponse:
    path = STATIC_DIR / f"{page}.html"
    if not path.exists():
        raise HTTPException(404)
    return FileResponse(path)
