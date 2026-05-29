const $ = (id) => document.getElementById(id);
const join = $("join");
const wait = $("wait");
const quiz = $("quiz");
const reveal = $("reveal");
const done = $("done");

let ws = null;
let playerId = "";
let myScore = 0;
let selected = "";

const params = new URLSearchParams(location.search);
if (params.get("code")) {
  $("codeInput").value = params.get("code").toUpperCase();
}

function wsUrl(path) {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}${path}`;
}

function show(el) {
  [join, wait, quiz, reveal, done].forEach((e) => e.classList.add("hidden"));
  el.classList.remove("hidden");
}

function setErr(msg) {
  $("err").textContent = msg || "";
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

$("btnJoin").onclick = () => {
  const code = $("codeInput").value.trim().toUpperCase();
  const name = $("nameInput").value.trim();
  if (!code || !name) {
    setErr("Nhập mã phòng và tên");
    return;
  }
  setErr("");
  ws = new WebSocket(wsUrl(`/ws/play/${code}`));
  ws.onopen = () => {
    ws.send(JSON.stringify({ action: "join", name }));
  };
  ws.onmessage = (ev) => handleMsg(JSON.parse(ev.data));
  ws.onclose = () => setErr("Mất kết nối");
};

document.addEventListener("visibilitychange", () => {
  if (document.hidden && ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ action: "focus_lost" }));
    $("focusWarn").classList.remove("hidden");
  }
});

document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && ["c", "v", "a"].includes(e.key.toLowerCase())) {
    e.preventDefault();
  }
});

function handleMsg(msg) {
  switch (msg.type) {
    case "joined":
      playerId = msg.player_id;
      show(wait);
      $("waitName").textContent = `Xin chào, ${$("nameInput").value.trim()}!`;
      break;
    case "question":
      show(quiz);
      selected = "";
      $("qMeta").textContent = `Câu ${msg.index + 1}/${msg.total} · [${msg.tag}]`;
      $("qText").textContent = msg.question;
      renderOptions(msg.options);
      updateTimer(msg.duration);
      break;
    case "tick":
      updateTimer(msg.remaining);
      break;
    case "reveal":
      show(reveal);
      $("revealAns").textContent = `Đáp án: ${msg.correct}`;
      const me = (msg.scores || []).find((s) => s.id === playerId);
      myScore = me ? me.score : myScore;
      $("myScore").textContent = `Điểm của bạn: ${myScore}/${msg.index + 1}`;
      break;
    case "finished":
      show(done);
      $("rankBody").innerHTML = (msg.ranking || [])
        .map(
          (r, i) =>
            `<tr><td>${i + 1}</td><td>${escapeHtml(r.name)}</td><td>${r.score}/${msg.total}</td></tr>`
        )
        .join("");
      break;
    case "error":
      setErr(msg.message);
      break;
  }
}

function renderOptions(options) {
  const box = $("options");
  box.innerHTML = "";
  for (const [key, text] of Object.entries(options)) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "opt-btn";
    btn.innerHTML = `<span class="opt-label">${key}.</span> ${escapeHtml(text)}`;
    btn.onclick = () => submitAnswer(key, btn);
    box.appendChild(btn);
  }
}

function submitAnswer(choice, btn) {
  if (selected || !ws || ws.readyState !== WebSocket.OPEN) return;
  selected = choice;
  document.querySelectorAll(".opt-btn").forEach((b) => {
    b.disabled = true;
    b.classList.remove("selected");
  });
  btn.classList.add("selected");
  ws.send(JSON.stringify({ action: "answer", choice }));
}

function updateTimer(sec) {
  const el = $("timer");
  el.textContent = String(sec);
  el.classList.remove("warn", "danger");
  if (sec <= 10) el.classList.add("danger");
  else if (sec <= 20) el.classList.add("warn");
}
