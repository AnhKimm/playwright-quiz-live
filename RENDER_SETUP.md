# Deploy Quiz Live lên Render (Free)

Một URL public cho cả **Host** và **thí sinh** — không cần cùng mạng công ty.

Ví dụ sau deploy: `https://playwright-quiz-live.onrender.com`

---

## Điều kiện

- Repo GitHub **riêng** chỉ chứa thư mục `quiz_live` (root repo = nội dung quiz_live)
- Tài khoản [Render](https://render.com) (đăng nhập bằng GitHub)
- File `quiz_live/quiz_data.json` đã có nội dung câu hỏi (commit lên Git)

---

## Cách A — Blueprint (khuyến nghị, nhanh)

1. Push repo GitHub mới (root có `server.py`, `Dockerfile`, `render.yaml`, `quiz_data.json`).

2. [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint**.

3. Chọn repo **quiz-live** → Render đọc `render.yaml` ở root → **Apply**.

4. Khi tạo service, Render hỏi biến môi trường:
   - **`QUIZ_HOST_PASSWORD`** → nhập mã host (vd. `BraveSoft-Host-2025`) — **không** gửi cho thí sinh.

5. Đợi **Build** + **Deploy** xong (5–10 phút lần đầu).

6. Mở URL Render (vd. `https://playwright-quiz-live.onrender.com`):
   - Host: `https://<tên-app>.onrender.com/host.html`
   - Thí sinh: `https://<tên-app>.onrender.com/play.html`

---

## Cách B — Tạo Web Service thủ công

1. **New** → **Web Service** → chọn repo GitHub.

2. Cấu hình:

   | Mục | Giá trị |
   |-----|---------|
   | Name | `playwright-quiz-live` |
   | Region | Singapore (gần VN) hoặc Oregon |
   | Branch | `main` |
   | Runtime | **Docker** |
   | Dockerfile Path | `Dockerfile` |
   | Docker Context | `.` (root repo) |
   | Plan | **Free** |

3. **Environment Variables**:

   | Key | Value |
   |-----|--------|
   | `QUIZ_HOST_PASSWORD` | Mã đăng nhập host (bí mật) |

   (Render tự gán `PORT` — không cần sửa.)

4. **Health Check Path**: `/health`

5. **Create Web Service** → đợi deploy.

---

## Sau khi deploy — checklist buổi thi

1. Host mở URL **5 phút trước** (free tier có thể **ngủ**, lần đầu load ~30–60s).
2. `host.html` → nhập **QUIZ_HOST_PASSWORD** → **Tạo phòng mới**.
3. Gửi thí sinh link: `https://<app>.onrender.com/play.html` + **mã phòng** (6 ký tự).
4. Host bấm **Bắt đầu** khi đủ người.

---

## Cập nhật câu hỏi

1. Sửa `quiz_live/quiz_data.json` (hoặc export từ `build_quiz_python_docx.py`).
2. `git commit` + `git push`.
3. Render **tự deploy lại** (Auto-Deploy bật mặc định).

---

## Giới hạn Render Free (cần biết)

| Hạng mục | Ảnh hưởng |
|----------|-----------|
| **Sleep** | ~15 phút không traffic → service ngủ; lần mở sau chậm |
| **RAM / CPU** | Đủ cho ~20–30 người quiz text; nhiều hơn nên test trước |
| **WebSocket** | Hỗ trợ — quiz realtime chạy được |
| **Restart** | Deploy/restart → **mất phòng đang chơi** |
| **HTTPS** | Có sẵn `https://` |
| **Thời hạn URL** | Miễn phí đến khi bạn xóa service / hết quota Render |

Buổi thi quan trọng: host vào sớm; hoặc cân nhắc **Starter plan** (~$7/tháng) để không sleep.

---

## Lỗi thường gặp

**Build failed — không thấy quiz_data.json**

- Đảm bảo file `tests_python/quiz_live/quiz_data.json` đã commit lên Git.

**Host báo “chưa cấu hình QUIZ_HOST_PASSWORD”**

- Vào Render → Service → **Environment** → thêm `QUIZ_HOST_PASSWORD` → **Save** → **Manual Deploy**.

**Thí sinh không kết nối WebSocket**

- Dùng đúng URL `https://` (không mix http).
- Kiểm tra service **Live** (xanh) trên Render dashboard.

**502 / timeout lần đầu**

- Free tier đang wake up — đợi 1 phút, refresh.

---

## Link nội bộ team (mẫu gửi Slack)

```
Quiz Playwright — Buổi test

Thí sinh: https://playwright-quiz-live.onrender.com/play.html
(Mã phòng host gửi khi bắt đầu)

Host: https://playwright-quiz-live.onrender.com/host.html
(Mã host: chỉ trainer — không share)
```

Đổi domain theo tên app thực tế trên Render.
