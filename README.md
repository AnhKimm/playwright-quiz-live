# Playwright Quiz Live

Ứng dụng quiz **realtime** cho training Playwright Python: host điều khiển cả phòng, **45 giây/câu**, đồng bộ qua WebSocket.

Phù hợp buổi kiểm tra nội bộ — thí sinh chỉ cần trình duyệt, không cần cùng mạng LAN khi deploy lên cloud.

## Tính năng

- Host tạo phòng, thí sinh join bằng mã 6 ký tự
- Timer **45s/câu** do server điều khiển (không chỉnh trên client)
- Đăng nhập **Host** bằng mã `QUIZ_HOST_PASSWORD` (thí sinh không cần)
- Bảng xếp hạng cuối buổi
- Cảnh báo khi thí sinh rời tab quiz
- Deploy **Render Free** / Docker / chạy local

## Quick start (local)

```bash
git clone https://github.com/<your-org>/playwright-quiz-live.git
cd playwright-quiz-live

python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

export QUIZ_HOST_PASSWORD="your-host-secret"
uvicorn server:app --host 0.0.0.0 --port 8765
```

| Vai trò | URL |
|--------|-----|
| Trang chủ | http://localhost:8765 |
| Host (trainer) | http://localhost:8765/host.html |
| Thí sinh | http://localhost:8765/play.html |

## Buổi thi (workflow)

1. **Host** mở `/host.html` → đăng nhập mã host → **Tạo phòng mới**
2. Gửi thí sinh link `/play.html` + **mã phòng**
3. Thí sinh nhập tên, chờ trong lobby
4. Host bấm **Bắt đầu quiz** khi đủ người
5. Mỗi câu 45 giây → hiện đáp án → câu tiếp theo
6. Kết thúc: bảng xếp hạng

## Cập nhật câu hỏi

Sửa file **`quiz_data.json`** (mảng JSON: `question`, `options`, `answer`), rồi commit / redeploy.

```json
{
  "id": 1,
  "tag": "Script cơ bản",
  "question": "Nội dung câu hỏi?",
  "options": { "A": "...", "B": "...", "C": "...", "D": "..." },
  "answer": "A"
}
```

Export từ script build monorepo (tuỳ chọn):

```bash
export QUIZ_BUILD_SCRIPT=/path/to/build_quiz_python_docx.py
python export_quiz_json.py
```

## Deploy (Render Free)

1. Push repo lên GitHub
2. [Render](https://render.com) → **Blueprint** → chọn repo này
3. Thêm env: `QUIZ_HOST_PASSWORD`
4. URL public: `https://playwright-quiz-live.onrender.com` (tên có thể khác)

Chi tiết: **[RENDER_SETUP.md](./RENDER_SETUP.md)**

## Cấu trúc project

```
├── server.py          # FastAPI + WebSocket
├── quiz_data.json     # Ngân hàng câu hỏi
├── static/            # host.html, play.html, JS, CSS
├── Dockerfile
├── render.yaml        # Render Blueprint
├── requirements.txt
└── RENDER_SETUP.md
```

## Biến môi trường

| Biến | Bắt buộc | Mô tả |
|------|----------|--------|
| `QUIZ_HOST_PASSWORD` | Có | Mã đăng nhập trang Host |
| `PORT` | Render tự set | Port HTTP (mặc định 8765 local) |

Xem `.env.example`.

## Lưu ý

- Không chặn 100% AI — nên giám sát trực tiếp trong buổi thi
- Render **free** có thể **ngủ** sau ~15 phút idle → host vào sớm 5 phút trước buổi thi
- Restart server = mất phòng quiz đang chơi (tạo phòng mới)

## License

Internal training use — BraveSoft / team QA.
