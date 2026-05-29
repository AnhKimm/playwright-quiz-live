# Playwright Quiz Live

Tool quiz **realtime** cho training: 35 câu từ `Quiz_Playwright_35_Cau_Python.docx`, **45 giây/câu**, host điều khiển cả phòng.

## Cài đặt

```bash
cd tests_python
python3 -m venv .venv_quiz
source .venv_quiz/bin/activate
pip install -r quiz_live/requirements.txt
python quiz_live/export_quiz_json.py
```

## Chạy server

```bash
cd tests_python
# Đặt mã host (chỉ trainer biết) — thí sinh không cần
export QUIZ_HOST_PASSWORD="ma-host-cua-team"

uvicorn quiz_live.server:app --host 0.0.0.0 --port 8765
```

Copy `quiz_live/.env.example` và export biến trước khi chạy (hoặc đặt trên Render/Docker env).

Mở trình duyệt: **http://localhost:8765**

## Cách dùng trong buổi training

1. **Host (trainer)** → http://localhost:8765/host.html → **Đăng nhập Host** (mã `QUIZ_HOST_PASSWORD`) → **Tạo phòng mới**
2. Chia **mã phòng** hoặc link `play.html?code=XXXXXX` cho thí sinh
3. Thí sinh vào **play.html**, nhập tên → chờ lobby
4. Host bấm **Bắt đầu quiz** khi đủ người
5. Mọi người làm **cùng lúc**, timer 45s/câu (server điều khiển)
6. Cuối buổi: bảng xếp hạng trên màn host + thí sinh

## Tính năng chống gian lận (mức cơ bản)

| Tính năng | Mô tả |
|-----------|--------|
| Timer server | 45s/câu do server tính, không sửa trên client |
| Khóa sau khi bắt đầu | Không join giữa chừng |
| Chống copy | `user-select: none`, chặn Ctrl+C trên trang thi |
| Cảnh báo rời tab | `visibilitychange` → host thấy cảnh báo |
| Log thời gian trả lời | Lưu trên server (mở rộng export CSV sau) |

**Lưu ý:** Không chặn 100% AI/điện thoại — nên kèm **giám sát trực tiếp** trong phòng họp.

## Cập nhật câu hỏi

Sửa `build_quiz_python_docx.py` rồi chạy:

```bash
python quiz_live/export_quiz_json.py
```

Restart server.

## Mạng nội bộ (cùng WiFi)

Host chạy với `--host 0.0.0.0`, thí sinh truy cập `http://<IP-máy-host>:8765/play.html?code=...`

## Deploy cho cả team (internet / văn phòng)

Xem **[RENDER_SETUP.md](./RENDER_SETUP.md)** (Render free — từng bước) hoặc **[DEPLOY.md](./DEPLOY.md)** (LAN, Docker, VPS, tunnel).
