# Deploy Playwright Quiz Live

Mọi người cần cùng truy cập **một URL** (host + thí sinh). Server dùng **WebSocket** — chỉ chạy **1 instance** (không scale nhiều replica, session lưu trong RAM).

---

## Cách 1 — Cùng mạng văn phòng (nhanh nhất, không cần cloud)

Trên máy host (laptop trainer):

```bash
cd tests_python
source .venv_quiz/bin/activate   # hoặc venv của bạn
pip install -r quiz_live/requirements.txt
uvicorn quiz_live.server:app --host 0.0.0.0 --port 8765
```

Lấy IP máy host:

- macOS: `ipconfig getifaddr en0` (Wi‑Fi) hoặc System Settings → Network  
- Windows: `ipconfig`  
- Linux: `hostname -I`

Thí sinh mở trình duyệt:

- Trang chủ: `http://<IP-host>:8765`
- Host: `http://<IP-host>:8765/host.html`
- Thi: `http://<IP-host>:8765/play.html`

**Lưu ý:** Firewall máy host phải cho phép port **8765**. Cùng Wi‑Fi/LAN; VPN có thể chặn.

---

## Cách 2 — Tunnel (demo nhanh, có link public)

Không deploy server, chỉ expose máy local ra internet.

### Cloudflare Tunnel (miễn phí)

```bash
# Cài cloudflared, sau đó:
cloudflared tunnel --url http://localhost:8765
```

Copy URL `https://....trycloudflare.com` gửi team. Host mở `.../host.html`, thí sinh `.../play.html`.

### ngrok

```bash
ngrok http 8765
```

Dùng URL `https://xxxx.ngrok-free.app` tương tự.

**Lưu ý:** Máy host phải bật uvicorn suốt buổi thi; ngắt tunnel = mất kết nối.

---

## Cách 3 — Docker trên VPS (Ubuntu, DigitalOcean, AWS EC2, …)

Trên server Linux (có Docker):

```bash
cd tests_python
# Đảm bảo quiz_data.json đã đúng nội dung trước khi build
docker build -f quiz_live/Dockerfile -t playwright-quiz .
docker run -d --name quiz -p 8765:8765 --restart unless-stopped playwright-quiz
```

Mở firewall port **8765** (hoặc 80 nếu dùng Nginx proxy bên dưới).

Truy cập: `http://<IP-server>:8765`

### HTTPS + domain (khuyến nghị cho production)

Dùng **Nginx** + **Let's Encrypt** reverse proxy tới `127.0.0.1:8765`.

Nginx cần header WebSocket:

```nginx
location / {
    proxy_pass http://127.0.0.1:8765;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

Sau đó team dùng `https://quiz.congty.com`.

---

## Cách 4 — Render.com (free tier) — khuyến nghị

**Hướng dẫn chi tiết từng bước:** [RENDER_SETUP.md](./RENDER_SETUP.md)

Tóm tắt:

1. Push repo GitHub (có `render.yaml` ở root repo + `tests_python/quiz_live/`)
2. Render → **Blueprint** hoặc **Web Service** (Docker)
3. Đặt env **`QUIZ_HOST_PASSWORD`**
4. URL: `https://<tên-app>.onrender.com` — host + thí sinh truy cập từ mọi nơi có internet

**Web Service** hỗ trợ WebSocket. Free tier có **sleep** sau ~15 phút idle.

---

## Cách 5 — Railway / Fly.io

Tương tự Render: 1 service, expose port, WebSocket enabled.

**Fly.io** ví dụ:

```bash
cd tests_python
fly launch
# Dockerfile: quiz_live/Dockerfile
fly deploy
```

---

## Biến môi trường bắt buộc (Host)

| Biến | Mô tả |
|------|--------|
| `QUIZ_HOST_PASSWORD` | Mã đăng nhập trên `/host.html` — chỉ trainer |

Ví dụ Docker:

```bash
docker run -d -p 8765:8765 -e QUIZ_HOST_PASSWORD="BraveSoft2025!" playwright-quiz
```

Thí sinh vào `/play.html` **không** cần mã này.

---

## Trước khi deploy — checklist data

1. Chỉnh câu hỏi trong `quiz_live/quiz_data.json` (hoặc export từ `build_quiz_python_docx.py`)  
2. Kiểm tra mỗi câu có `options` A–D và `answer` đúng  
3. **Build lại image / restart process** sau mỗi lần đổi JSON (server đọc file lúc khởi động)

```bash
python quiz_live/export_quiz_json.py   # nếu sửa build_quiz_python_docx.py
docker build ... && docker run ...      # hoặc restart uvicorn
```

---

## Buổi thi thực tế

| Vai trò | URL |
|--------|-----|
| Trainer (host) | `https://your-domain/host.html` → **Tạo phòng** → copy mã |
| Thí sinh | `https://your-domain/play.html` → nhập **mã phòng** + tên |

- Mỗi buổi host **tạo phòng mới** (mã 6 ký tự).  
- Thí sinh chỉ join khi host **chưa** bấm Bắt đầu.  
- Không cần cài app — chỉ trình duyệt.

---

## Giới hạn hiện tại

| Hạng mục | Ghi chú |
|----------|---------|
| Session | RAM — restart server = mất phòng đang chơi |
| Scale | 1 instance; không load-balance nhiều pod |
| Chống AI | Giám sát phòng + 10s/câu; không proctoring video |
| Auth | Chưa có mật khẩu phòng — ai có mã đều vào được |

Có thể bổ sung sau: mật khẩu host, PIN phòng, export CSV kết quả.
