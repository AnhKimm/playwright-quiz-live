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
let revealTimer = null;

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

function playerNameCell(p) {
  const left = p.left ? ' <span class="badge-left">(đã rời)</span>' : "";
  return `${escapeHtml(p.name)}${left}`;
}

function stopRevealCountdown() {
  if (revealTimer) {
    clearInterval(revealTimer);
    revealTimer = null;
  }
}

function startRevealCountdown(seconds) {
  stopRevealCountdown();
  const el = $("revealCountdown");
  if (!el) return;
  let left = seconds;
  el.textContent = String(left);
  revealTimer = setInterval(() => {
    left -= 1;
    if (left <= 0) {
      stopRevealCountdown();
      el.textContent = "0";
      return;
    }
    el.textContent = String(left);
  }, 1000);
}

function renderRevealRanking(ranking, total) {
  renderRankingTable(ranking, total, "revealRankBody", playerId, playerNameCell);
}

function showReveal(msg) {
  show(reveal);
  $("revealMeta").textContent = `Sau câu ${msg.index + 1}/${msg.total}`;
  $("revealQuestion").textContent = msg.question || "";
  renderOptionsList($("revealOptions"), msg.options || {}, {
    correct: msg.correct,
    readonly: true,
    selected: selected,
  });
  const me = (msg.ranking || []).find((s) => s.id === playerId);
  myScore = me ? me.score : myScore;
  $("myScore").textContent = `Điểm của bạn: ${myScore}/${msg.total}`;
  renderRevealRanking(msg.ranking || [], msg.total);
  startRevealCountdown(msg.reveal_seconds ?? 3);
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
      stopRevealCountdown();
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
      showReveal(msg);
      break;
    case "finished":
      stopRevealCountdown();
      show(done);
      renderRankingTable(msg.ranking || [], msg.total, "rankBody", playerId, playerNameCell, true);
      showCelebrationPopup(msg.ranking || [], msg.total, playerId);
      break;
    case "error":
      setErr(msg.message);
      break;
  }
}

function renderOptions(options) {
  renderOptionsList($("options"), options, {
    selected,
    onSelect: (key, btn) => submitAnswer(key, btn),
  });
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
