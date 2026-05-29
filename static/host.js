const $ = (id) => document.getElementById(id);
const login = $("login");
const setup = $("setup");
const lobby = $("lobby");
const live = $("live");
const reveal = $("reveal");
const done = $("done");
const status = $("status");

const HOST_AUTH_KEY = "quiz_host_auth_token";

let ws = null;
let hostToken = "";
let roomCode = "";
let hostAuthToken = sessionStorage.getItem(HOST_AUTH_KEY) || "";
let revealTimer = null;
let lastRevealTotal = 0;

function wsUrl(path) {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}${path}`;
}

function show(el) {
  [login, setup, lobby, live, reveal, done].forEach((e) => e.classList.add("hidden"));
  el.classList.remove("hidden");
}

function setStatus(msg) {
  status.textContent = msg;
}

function setLoginErr(msg) {
  $("loginErr").textContent = msg || "";
}

function saveHostAuth(token) {
  hostAuthToken = token;
  sessionStorage.setItem(HOST_AUTH_KEY, token);
}

function clearHostAuth() {
  hostAuthToken = "";
  sessionStorage.removeItem(HOST_AUTH_KEY);
}

async function apiHostLogin(password) {
  const res = await fetch("/api/host/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const d = data.detail;
    const msg = typeof d === "string" ? d : "Đăng nhập thất bại";
    throw new Error(msg);
  }
  return data;
}

async function apiCreateSession() {
  const res = await fetch("/api/sessions", {
    method: "POST",
    headers: { "X-Host-Token": hostAuthToken },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) {
      clearHostAuth();
      show(login);
    }
    throw new Error(
      typeof data.detail === "string" ? data.detail : "Không tạo được phòng"
    );
  }
  return data;
}

$("btnLogin").onclick = async () => {
  const password = $("hostPassword").value;
  if (!password) {
    setLoginErr("Nhập mã đăng nhập host");
    return;
  }
  setLoginErr("");
  $("btnLogin").disabled = true;
  try {
    const data = await apiHostLogin(password);
    saveHostAuth(data.host_auth_token);
    $("hostPassword").value = "";
    show(setup);
    setStatus("Đăng nhập host thành công");
  } catch (e) {
    setLoginErr(e.message);
  } finally {
    $("btnLogin").disabled = false;
  }
};

$("hostPassword").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("btnLogin").click();
});

$("btnLogout").onclick = () => {
  clearHostAuth();
  if (ws) {
    ws.close();
    ws = null;
  }
  show(login);
  setStatus("");
  setLoginErr("");
};

$("btnCreate").onclick = async () => {
  if (!hostAuthToken) {
    show(login);
    setLoginErr("Vui lòng đăng nhập host trước");
    return;
  }
  setStatus("Đang tạo phòng…");
  $("btnCreate").disabled = true;
  try {
    const data = await apiCreateSession();
    hostToken = data.host_token;
    roomCode = data.code;
    $("roomCode").textContent = roomCode;
    const playUrl = `${location.origin}/play.html?code=${roomCode}`;
    $("playLink").href = playUrl;
    $("playLink").textContent = playUrl;
    show(lobby);
    setStatus(`${data.questions} câu · ${data.seconds_per_question}s/câu`);

    ws = new WebSocket(
      wsUrl(`/ws/host/${roomCode}?token=${encodeURIComponent(hostToken)}`)
    );
    ws.onmessage = (ev) => handleMsg(JSON.parse(ev.data));
    ws.onclose = () => setStatus("Mất kết nối host");
  } catch (e) {
    setStatus(e.message);
    alert(e.message);
  } finally {
    $("btnCreate").disabled = false;
  }
};

$("btnStart").onclick = () => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ action: "start" }));
    $("btnStart").disabled = true;
  }
};

function playerNameCell(p) {
  const left = p.left ? ' <span class="badge-left">(đã rời)</span>' : "";
  return `${escapeHtml(p.name)}${left}`;
}

function renderPlayerScores(players, listEl, countEl) {
  if (countEl) countEl.textContent = String(players.length);
  listEl.innerHTML = players
    .map((p) => `<li>${playerNameCell(p)} <span class="badge">${p.score} đ</span></li>`)
    .join("");
}

function renderPlayers(players) {
  renderPlayerScores(players, $("playerList"), $("playerCount"));
}

function renderRanking(ranking, total) {
  renderRankingTable(ranking, total, "rankBody", "", playerNameCell, true);
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

function showReveal(msg) {
  show(reveal);
  lastRevealTotal = msg.total || lastRevealTotal;
  $("revealMeta").textContent = `Sau câu ${msg.index + 1}/${msg.total}`;
  $("revealQuestion").textContent = msg.question || "";
  renderOptionsList($("revealOptions"), msg.options || {}, {
    correct: msg.correct,
    readonly: true,
  });
  renderRankingTable(msg.ranking || [], msg.total, "revealRankBody", "", playerNameCell);
  startRevealCountdown(msg.reveal_seconds ?? 3);
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function handleMsg(msg) {
  switch (msg.type) {
    case "lobby":
    case "lobby_update":
      renderPlayers(msg.players || []);
      break;
    case "player_left":
      renderPlayers(msg.players || []);
      if (!reveal.classList.contains("hidden")) {
        const ranked = [...(msg.players || [])].sort(
          (a, b) => b.score - a.score || a.name.localeCompare(b.name)
        );
        renderRankingTable(ranked, lastRevealTotal, "revealRankBody", "", playerNameCell);
      }
      break;
    case "question":
      stopRevealCountdown();
      show(live);
      $("liveMeta").textContent = `Câu ${msg.index + 1}/${msg.total} · [${msg.tag}]`;
      $("liveQuestion").textContent = msg.question;
      renderOptionsList($("liveOptions"), msg.options || {}, { readonly: true });
      updateTimer(msg.duration);
      $("answeredStat").textContent = "";
      break;
    case "tick":
      updateTimer(msg.remaining);
      break;
    case "player_answered":
      $("answeredStat").textContent = `${msg.answered_count}/${msg.total_players} đã trả lời`;
      break;
    case "reveal":
      showReveal(msg);
      break;
    case "finished":
      stopRevealCountdown();
      show(done);
      renderRanking(msg.ranking || [], msg.total);
      setStatus("Quiz kết thúc");
      break;
    case "focus_warning":
      setStatus(`⚠ ${msg.name} rời tab (${msg.count} lần)`);
      break;
    case "error":
      alert(msg.message);
      break;
  }
}

function updateTimer(sec) {
  const el = $("liveTimer");
  el.textContent = String(sec);
  el.classList.remove("warn", "danger");
  if (sec <= 10) el.classList.add("danger");
  else if (sec <= 20) el.classList.add("warn");
}

async function init() {
  try {
    const cfg = await fetch("/api/host/config").then((r) => r.json());
    if (!cfg.login_required) {
      setLoginErr("Server chưa đặt QUIZ_HOST_PASSWORD — liên hệ admin.");
      return;
    }
  } catch {
    setLoginErr("Không kết nối server");
    return;
  }
  if (hostAuthToken) {
    show(setup);
    setStatus("Đã đăng nhập host (phiên trình duyệt)");
  } else {
    show(login);
  }
}

init();
