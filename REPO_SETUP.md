# Repo riêng cho Quiz Live

Tách khỏi `playwright_demo` — chỉ deploy/quản lý quiz realtime.

## Tạo repo GitHub mới

1. GitHub → **New repository** → tên vd. `playwright-quiz-live` → Public/Private → **không** tạo README (đã có sẵn).

2. Trên máy local (đã có git init trong thư mục này):

```bash
cd tests_python/quiz_live   # hoặc clone sau khi push lần đầu

git remote add origin https://github.com/<org>/playwright-quiz-live.git
git branch -M main
git push -u origin main
```

## Cấu trúc repo (root)

```
playwright-quiz-live/
├── server.py
├── quiz_data.json
├── Dockerfile
├── render.yaml
├── requirements.txt
├── static/
├── README.md
├── RENDER_SETUP.md
└── ...
```

## Render

Dùng `render.yaml` trong **root** repo này (không dùng `render.yaml` ở monorepo `playwright_demo`).

## Cập nhật câu hỏi

Sửa trực tiếp `quiz_data.json` → commit → push → Render auto-deploy.

Hoặc export từ monorepo (nếu vẫn có file build):

```bash
export QUIZ_BUILD_SCRIPT=/path/to/playwright_demo/tests_python/build_quiz_python_docx.py
python export_quiz_json.py
```

## Monorepo `playwright_demo`

Nếu không muốn trùng code, có thể xóa `tests_python/quiz_live/` khỏi monorepo sau khi repo riêng đã ổn (commit riêng trên monorepo).
