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

function looksLikePython(text) {
  const t = String(text || "").trim();
  if (!t) return false;
  if (/^(Cả |Không thể tương tác)/i.test(t)) return false;

  const hasCode =
    /\b(page|context|browser|locator|import|def|class|pytest|expect|fixture|dialog|sync_playwright|get_by_|wait_for|frame_|select_|browser_context_args|tracing|autouse)\b/i.test(
      t
    ) ||
    /@pytest\.fixture/.test(t) ||
    /^[\w.]+\(/.test(t) ||
    /\bassert\s/.test(t) ||
    /\.(click|fill|hover|dblclick|goto|check)\(/.test(t) ||
    /context\.tracing/.test(t);

  if (!hasCode) return false;
  if (/^(Actions, screenshots|Chỉ \.env)/i.test(t) && !/[();]/.test(t)) return false;
  if (/^Không vấn đề\s+—/i.test(t) && !/\w+\(/.test(t)) return false;
  return true;
}

function optionAsCodeText(text, forceCode) {
  const raw = String(text || "").trim();
  if (forceCode) {
    return raw.replace(/\s+—\s+/g, "\n# ");
  }
  if (!looksLikePython(raw)) return null;
  return raw.replace(/\s+—\s+/g, "\n# ");
}

function appendOptionContent(parent, text, forceCode) {
  const codeText = optionAsCodeText(text, forceCode);

  if (codeText !== null) {
    parent.classList.add("has-code");
    const pre = document.createElement("pre");
    pre.className = "code-block";
    const code = document.createElement("code");
    code.className = "language-python";
    code.textContent = codeText;
    pre.appendChild(code);
    parent.appendChild(pre);
    if (window.hljs) {
      hljs.highlightElement(code);
    }
  } else {
    const span = document.createElement("span");
    span.className = "opt-text";
    span.textContent = String(text);
    parent.appendChild(span);
  }
}

function renderQuestionBlock(textEl, imageWrapEl, imageEl, question, imageUrl) {
  if (textEl) {
    textEl.textContent = question || "";
    textEl.style.whiteSpace = "pre-line";
  }
  if (!imageWrapEl || !imageEl) return;
  if (imageUrl) {
    imageEl.src = imageUrl;
    imageEl.alt = "Minh họa câu hỏi";
    imageWrapEl.classList.remove("hidden");
  } else {
    imageEl.removeAttribute("src");
    imageWrapEl.classList.add("hidden");
  }
}

function renderOptionsList(container, options, opts = {}) {
  const {
    correct = "",
    readonly = false,
    selected = "",
    onSelect = null,
    optionsAsCode = false,
    reviewUserChoice = "",
  } = opts;
  if (!container) return;
  container.innerHTML = "";
  const user = String(reviewUserChoice || "").toUpperCase();
  const ans = String(correct || "").toUpperCase();
  for (const [key, text] of orderedOptionEntries(options)) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "opt-btn";
    if (readonly) btn.disabled = true;
    if (user) {
      if (key === ans) btn.classList.add("opt-correct");
      if (key === user && user !== ans) btn.classList.add("opt-wrong");
    } else {
      if (key === correct) btn.classList.add("opt-correct");
      if (key === selected) btn.classList.add("selected");
    }

    const label = document.createElement("span");
    label.className = "opt-label";
    label.textContent = `${key}.`;
    btn.appendChild(label);
    appendOptionContent(btn, text, optionsAsCode);

    if (!readonly && onSelect) {
      btn.onclick = () => onSelect(key, btn);
    }
    container.appendChild(btn);
  }
}

function renderReviewPage(listEl, summaryEl, questions, myAnswers) {
  if (!listEl) return;
  listEl.innerHTML = "";
  let correctCount = 0;
  (questions || []).forEach((q, idx) => {
    const userChoice = String((myAnswers && myAnswers[idx]) || "").toUpperCase();
    const correct = String(q.answer || "").toUpperCase();
    if (userChoice && userChoice === correct) correctCount += 1;

    const card = document.createElement("article");
    card.className = "card review-card";

    const meta = document.createElement("p");
    meta.className = "q-meta";
    const status =
      !userChoice
        ? " · Chưa trả lời"
        : userChoice === correct
          ? " · ✓ Đúng"
          : " · ✗ Sai";
    meta.textContent = `Câu ${idx + 1}/${questions.length} · ${q.tag || ""}${status}`;
    card.appendChild(meta);

    const qText = document.createElement("p");
    qText.className = "q-text";
    qText.style.whiteSpace = "pre-line";
    qText.textContent = q.question || "";
    card.appendChild(qText);

    if (q.image) {
      const wrap = document.createElement("div");
      wrap.className = "q-image-wrap";
      const img = document.createElement("img");
      img.className = "q-image";
      img.src = q.image;
      img.alt = "Minh họa câu hỏi";
      img.draggable = false;
      wrap.appendChild(img);
      card.appendChild(wrap);
    }

    const opts = document.createElement("div");
    opts.className = "options options-readonly";
    renderOptionsList(opts, q.options || {}, {
      readonly: true,
      correct: q.answer,
      reviewUserChoice: userChoice,
      optionsAsCode: !!q.options_as_code,
    });
    card.appendChild(opts);

    if (q.explanation) {
      const box = document.createElement("div");
      box.className = "review-explanation";
      const title = document.createElement("p");
      title.className = "review-explanation-title";
      title.textContent = "Giải thích";
      box.appendChild(title);
      const body = document.createElement("p");
      body.className = "review-explanation-body";
      body.textContent = q.explanation;
      box.appendChild(body);
      card.appendChild(box);
    }

    listEl.appendChild(card);
  });

  if (summaryEl) {
    summaryEl.textContent = `Bạn trả lời đúng ${correctCount}/${questions.length} câu.`;
  }
}
