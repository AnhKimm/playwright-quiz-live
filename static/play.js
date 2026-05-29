const $ = (id) => document.getElementById(id);
const join = $("join");
const wait = $("wait");
const quiz = $("quiz");
const reveal = $("reveal");
const done = $("done");
const review = $("review");

let ws = null;
let playerId = "";
let myScore = 0;
let selected = "";
let revealTimer = null;
let quizActive = false;
let serverClosedWithMessage = false;
let reviewData = null;

function showFocusWarn() {
  const el = $("focusWarn");
  if (el) el.classList.remove("hidden");
}

function hideFocusWarn() {
  const el = $("focusWarn");
  if (el) el.classList.add("hidden");
}

const params = new URLSearchParams(location.search);
if (params.get("code")) {
  $("codeInput").value = params.get("code").toUpperCase();
}

function wsUrl(path) {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}${path}`;
}

function show(el) {
  [join, wait, quiz, reveal, done, review].forEach((e) => {
    if (e) e.classList.add("hidden");
  });
  if (el) el.classList.remove("hidden");
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
  renderQuestionBlock(
    $("revealQuestion"),
    $("revealImageWrap"),
    $("revealImage"),
    msg.question,
    msg.image
  );
  renderOptionsList($("revealOptions"), msg.options || {}, {
    correct: msg.correct,
    readonly: true,
    selected: selected,
    optionsAsCode: !!msg.options_as_code,
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
  serverClosedWithMessage = false;
  setErr("");
  ws = new WebSocket(wsUrl(`/ws/play/${code}`));
  ws.onopen = () => {
    ws.send(JSON.stringify({ action: "join", name }));
  };
  ws.onmessage = (ev) => handleMsg(JSON.parse(ev.data));
  ws.onclose = () => {
    if (!serverClosedWithMessage) {
      setErr("Mất kết nối");
    }
    serverClosedWithMessage = false;
    ws = null;
  };
};

document.addEventListener("visibilitychange", () => {
  if (!document.hidden || !quizActive || !ws || ws.readyState !== WebSocket.OPEN) {
    return;
  }
  ws.send(JSON.stringify({ action: "focus_lost" }));
  showFocusWarn();
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
      quizActive = false;
      hideFocusWarn();
      show(wait);
      $("waitName").textContent = `Xin chào, ${$("nameInput").value.trim()}!`;
      break;
    case "question":
      stopRevealCountdown();
      hideFocusWarn();
      quizActive = true;
      show(quiz);
      selected = "";
      $("qMeta").textContent = `Câu ${msg.index + 1}/${msg.total}`;
      renderQuestionBlock($("qText"), $("qImageWrap"), $("qImage"), msg.question, msg.image);
      renderOptions(msg.options, !!msg.options_as_code);
      updateTimer(msg.duration);
      break;
    case "tick":
      updateTimer(msg.remaining);
      break;
    case "reveal":
      quizActive = false;
      showReveal(msg);
      break;
    case "finished":
      quizActive = false;
      stopRevealCountdown();
      if (msg.questions && msg.my_answers) {
        reviewData = { questions: msg.questions, myAnswers: msg.my_answers };
      }
      show(done);
      renderRankingTable(msg.ranking || [], msg.total, "rankBody", playerId, playerNameCell, true);
      const btnReview = $("btnReview");
      if (btnReview) {
        btnReview.classList.toggle("hidden", !reviewData);
      }
      showCelebrationPopup(msg.ranking || [], msg.total, playerId);
      break;
    case "error":
      serverClosedWithMessage = true;
      quizActive = false;
      show(join);
      setErr(msg.message);
      break;
  }
}

function renderOptions(options, optionsAsCode) {
  renderOptionsList($("options"), options, {
    selected,
    optionsAsCode: !!optionsAsCode,
    onSelect: (key) => submitAnswer(key),
  });
  document.querySelectorAll("#options .opt-btn").forEach((btn) => {
    const key = btn.querySelector(".opt-label")?.textContent?.replace(".", "");
    if (key) btn.dataset.choice = key.trim();
  });
}

function submitAnswer(choice) {
  if (!quizActive || !ws || ws.readyState !== WebSocket.OPEN) return;
  selected = choice;
  document.querySelectorAll("#options .opt-btn").forEach((b) => {
    b.classList.remove("selected");
    if (b.dataset.choice === choice) b.classList.add("selected");
  });
  ws.send(JSON.stringify({ action: "answer", choice }));
}

function openReview() {
  if (!reviewData) return;
  show(review);
  renderReviewPage($("reviewList"), $("reviewSummary"), reviewData.questions, reviewData.myAnswers);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

$("btnReview")?.addEventListener("click", openReview);
$("btnBackResults")?.addEventListener("click", () => show(done));

function updateTimer(sec) {
  const el = $("timer");
  el.textContent = String(sec);
  el.classList.remove("warn", "danger");
  if (sec <= 10) el.classList.add("danger");
  else if (sec <= 20) el.classList.add("warn");
}
