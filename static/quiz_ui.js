const OPTION_KEYS = ["A", "B", "C", "D"];

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function orderedOptionEntries(options) {
  return OPTION_KEYS.filter((k) => Object.prototype.hasOwnProperty.call(options, k)).map(
    (k) => [k, options[k]]
  );
}

function scoreThresholds(total) {
  return {
    minGood: Math.ceil(total * 0.8),
    minPass: Math.ceil(total * 0.6),
    minAvg: Math.ceil(total * 0.4),
  };
}

function getEvaluation(score, total) {
  const { minGood, minPass, minAvg } = scoreThresholds(total);
  if (score >= minGood) {
    return {
      icon: "🏆",
      label: "Tốt",
      detail: `≥ ${minGood} câu đúng (≥ 80%)`,
      className: "eval-good",
    };
  }
  if (score >= minPass) {
    return {
      icon: "✅",
      label: "Đạt",
      detail: `${minPass}–${minGood - 1} câu đúng (60–79%)`,
      className: "eval-pass",
    };
  }
  if (score >= minAvg) {
    return {
      icon: "🔶",
      label: "Trung bình",
      detail: `${minAvg}–${minPass - 1} câu đúng (40–59%)`,
      className: "eval-avg",
    };
  }
  return {
    icon: "❌",
    label: "Yếu",
    detail: `< ${minAvg} câu đúng (< 40%)`,
    className: "eval-weak",
  };
}

function formatEvalCell(score, total) {
  const ev = getEvaluation(score, total);
  return `<td class="eval-col ${ev.className}" title="${escapeHtml(ev.detail)}"><span class="eval-cell-icon">${ev.icon}</span> ${ev.label}</td>`;
}

function renderRankingTable(
  ranking,
  total,
  tbodyId,
  highlightId = "",
  nameHtmlFn,
  showEval = false
) {
  const el = document.getElementById(tbodyId);
  if (!el) return;
  const nameCell = nameHtmlFn || ((p) => escapeHtml(p.name));
  el.innerHTML = ranking
    .map((r, i) => {
      const me = highlightId && r.id === highlightId ? ' class="rank-me"' : "";
      const evalCell = showEval ? formatEvalCell(r.score, total) : "";
      return `<tr${me}><td>${i + 1}</td><td>${nameCell(r)}</td><td>${r.score}/${total}</td>${evalCell}</tr>`;
    })
    .join("");
}

function renderOptionsList(container, options, opts = {}) {
  const { correct = "", readonly = false, selected = "", onSelect = null } = opts;
  if (!container) return;
  container.innerHTML = "";
  for (const [key, text] of orderedOptionEntries(options)) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "opt-btn";
    if (readonly) btn.disabled = true;
    if (key === correct) btn.classList.add("opt-correct");
    if (key === selected) btn.classList.add("selected");
    btn.innerHTML = `<span class="opt-label">${key}.</span> ${escapeHtml(text)}`;
    if (!readonly && onSelect) {
      btn.onclick = () => onSelect(key, btn);
    }
    container.appendChild(btn);
  }
}
