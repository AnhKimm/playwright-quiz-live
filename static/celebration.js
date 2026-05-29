/** Popup chúc mừng + pháo hoa + đánh giá kết quả (thí sinh). */

function getWinners(ranking) {
  if (!ranking.length) return [];
  const top = ranking[0].score;
  return ranking.filter((r) => r.score === top);
}

let fireworksAnim = null;

function startFireworks(canvas) {
  if (!canvas) return () => {};
  const ctx = canvas.getContext("2d");
  let w = 0;
  let h = 0;
  let raf = 0;
  const particles = [];

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }

  function burst(x, y) {
    const colors = ["#3dd68c", "#f0b429", "#4a8fd4", "#f56565", "#e8edf4"];
    const n = 36 + Math.floor(Math.random() * 24);
    for (let i = 0; i < n; i++) {
      const angle = (Math.PI * 2 * i) / n + Math.random() * 0.2;
      const speed = 2 + Math.random() * 4;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 50 + Math.random() * 30,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 2 + Math.random() * 2,
      });
    }
  }

  resize();
  window.addEventListener("resize", resize);
  burst(w * 0.5, h * 0.35);
  const burstTimer = setInterval(() => {
    burst(Math.random() * w * 0.8 + w * 0.1, Math.random() * h * 0.45 + h * 0.1);
  }, 700);

  function frame() {
    ctx.fillStyle = "rgba(15, 20, 25, 0.22)";
    ctx.fillRect(0, 0, w, h);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.06;
      p.life -= 1;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = Math.min(1, p.life / 40);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    clearInterval(burstTimer);
    window.removeEventListener("resize", resize);
    ctx.clearRect(0, 0, w, h);
  };
}

function stopFireworks() {
  if (fireworksAnim) {
    fireworksAnim();
    fireworksAnim = null;
  }
}

function showCelebrationPopup(ranking, total, currentPlayerId) {
  const overlay = document.getElementById("celebrationOverlay");
  const winnerEl = document.getElementById("celebrationWinner");
  const evalEl = document.getElementById("celebrationMyEval");
  const canvas = document.getElementById("fireworksCanvas");
  if (!overlay || !winnerEl || !evalEl) return;

  const winners = getWinners(ranking);
  const winnerNames = winners.map((w) => w.name).join(", ");
  const iWon = winners.some((w) => w.id === currentPlayerId);
  const me = ranking.find((r) => r.id === currentPlayerId);
  const myScore = me ? me.score : 0;
  const ev = getEvaluation(myScore, total);

  winnerEl.innerHTML = winners.length
    ? `<span class="celebration-trophy">🏆</span> <strong>${escapeHtml(winnerNames)}</strong> — Hạng 1 với <strong>${winners[0].score}/${total}</strong> câu đúng!${
        iWon ? '<br><span class="celebration-you-win">Bạn là người chiến thắng!</span>' : ""
      }`
    : "Quiz đã kết thúc.";

  evalEl.className = `celebration-eval ${ev.className}`;
  evalEl.innerHTML = `
    <p class="eval-title">Kết quả của bạn</p>
    <p class="eval-score">${myScore}/${total} câu đúng</p>
    <p class="eval-badge"><span class="eval-icon">${ev.icon}</span> <strong>${ev.label}</strong></p>
  `;

  // const legendEl = document.getElementById("evalLegend");
  // if (legendEl) {
  //   const { minGood, minPass, minAvg } = scoreThresholds(total);
  //   legendEl.innerHTML = `
  //     <li><span>🏆</span> Tốt: ≥ ${minGood} câu đúng (≥ 80%)</li>
  //     <li><span>✅</span> Đạt: ${minPass}–${minGood - 1} câu đúng (60–79%)</li>
  //     <li><span>🔶</span> Trung bình: ${minAvg}–${minPass - 1} câu đúng (40–59%)</li>
  //     <li><span>❌</span> Yếu: &lt; ${minAvg} câu đúng (&lt; 40%)</li>
  //   `;
  // }

  overlay.classList.remove("hidden");
  document.body.classList.add("celebration-open");
  stopFireworks();
  fireworksAnim = startFireworks(canvas);
}

function hideCelebrationPopup() {
  const overlay = document.getElementById("celebrationOverlay");
  if (overlay) overlay.classList.add("hidden");
  document.body.classList.remove("celebration-open");
  stopFireworks();
}

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("btnCloseCelebration");
  if (btn) btn.addEventListener("click", hideCelebrationPopup);
});
