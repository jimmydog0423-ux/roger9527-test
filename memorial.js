
(() => {
  "use strict";

  const config = window.APP_CONFIG || {};
  const workerUrl = String(config.workerUrl || "").replace(/\/+$/, "");
  const $ = (selector) => document.querySelector(selector);
  const numberText = (value) => Number(value).toLocaleString("zh-TW");
  const VISITOR_KEY = "rogerPrayVisitorId"; // 和原網站共用匿名訪客
  const LAST_PRAY_KEY = "roger_pray_last_time"; // 和原網站共用冷卻時間
  const FISH_KEY = "roger_memorial_woodfish_count";
  const SOUND_KEY = "roger_memorial_sound_off";
  const COOLDOWN = 60 * 1000;
  let prayPending = false;
  let statsLoading = false;
  let audioContext = null;
  let toastTimer = null;
  let soundEnabled = readStorage(SOUND_KEY) !== "1";
  let knockCount = Math.max(0, Number(readStorage(FISH_KEY)) || 0);

  function readStorage(key) {
    try { return localStorage.getItem(key); } catch (_) { return null; }
  }
  function writeStorage(key, value) {
    try { localStorage.setItem(key, String(value)); } catch (_) { /* private mode */ }
  }
  function visitorId() {
    let id = readStorage(VISITOR_KEY);
    if (!id) {
      id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID().replaceAll("-", "_")
        : "visitor_" + Date.now() + "_" + Math.random().toString(36).slice(2);
      writeStorage(VISITOR_KEY, id);
    }
    return id;
  }
  function toast(message) {
    const el = $("#toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 3500);
  }
  function updateStats(data) {
    if (!data || data.success !== true) throw new Error("統計服務回傳格式不正確");
    if (![data.totalCount, data.totalVisitors].every((v) => Number.isFinite(Number(v)) && Number(v) >= 0)) {
      throw new Error("統計服務未回傳正確人數");
    }
    $("#totalVisitors").textContent = numberText(data.totalVisitors);
    $("#totalIncense").textContent = numberText(data.totalCount);
    $("#myIncense").textContent = numberText(data.visitorCount || 0);
    $("#statsStatus").textContent = "全站即時香火統計 · 每 30 秒更新";
  }
  async function fetchStats() {
    if (!workerUrl || statsLoading || prayPending) return;
    statsLoading = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const resp = await fetch(workerUrl + "/pray/stats?visitorId=" + encodeURIComponent(visitorId()), {
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: controller.signal
      });
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      updateStats(await resp.json());
    } catch (err) {
      console.warn("無法取得上香人數：", err);
      if ($("#totalVisitors").textContent === "—") {
        $("#statsStatus").textContent = "暫時無法連線統計服務，請稍後重新整理";
      } else {
        $("#statsStatus").textContent = "統計服務暫時無法更新，顯示上次結果";
      }
    } finally {
      clearTimeout(timer);
      statsLoading = false;
    }
  }

  function incenseStick() {
    const holder = $("#incenseSticks");
    const stick = document.createElement("span");
    const smoke = document.createElement("span");
    stick.className = "joss";
    smoke.className = "stick-smoke";
    stick.style.setProperty("--pos", (21 + Math.random() * 56) + "%");
    stick.style.setProperty("--tilt", (-9 + Math.random() * 18) + "deg");
    smoke.style.animationDelay = (-Math.random() * 3) + "s";
    stick.appendChild(smoke);
    holder.appendChild(stick);
    while (holder.children.length > 9) holder.firstElementChild.remove();
  }
  function paperBurst(x, y, count = 14) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const layer = $("#effectLayer");
    for (let i = 0; i < count; i++) {
      const piece = document.createElement("span");
      piece.className = "effect-paper";
      piece.style.left = (x + (Math.random() - .5) * 35) + "px";
      piece.style.top = y + "px";
      piece.style.setProperty("--fly-x", ((Math.random() - .5) * 460) + "px");
      piece.style.setProperty("--fly-y", (-100 - Math.random() * 250) + "px");
      piece.style.setProperty("--spin", ((Math.random() - .5) * 820) + "deg");
      piece.style.animationDelay = (Math.random() * .18) + "s";
      layer.appendChild(piece);
      setTimeout(() => piece.remove(), 2300);
    }
  }
  function floatingText(x, y, label) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const text = document.createElement("span");
    text.className = "floating-blessing";
    text.textContent = label;
    text.style.left = x + "px";
    text.style.top = y + "px";
    $("#effectLayer").appendChild(text);
    setTimeout(() => text.remove(), 1600);
  }
  function audio() {
    if (!soundEnabled) return null;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!audioContext) audioContext = new Ctx();
    if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
    return audioContext;
  }
  function tone(freq, duration, type = "sine", volume = .18) {
    const ctx = audio();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * .53), now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(.001, now + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + .02);
  }
  function playMokugyo() {
    tone(185, .17, "triangle", .27);
    tone(310, .08, "sine", .095);
  }
  function playBell() {
    tone(780, 1.1, "sine", .085);
    tone(1160, .75, "sine", .04);
  }
  function showCooldown() {
    const button = $("#prayBtn");
    if (prayPending) {
      button.disabled = true;
      button.textContent = "香火紀錄中…";
      return;
    }
    const left = COOLDOWN - (Date.now() - (Number(readStorage(LAST_PRAY_KEY)) || 0));
    if (left > 0) {
      button.disabled = true;
      button.textContent = "請 " + Math.ceil(left / 1000) + " 秒後再上香";
    } else {
      button.disabled = false;
      button.textContent = "誠心上香 · 敬獻一炷";
    }
  }
  async function pray() {
    if (prayPending) return;
    const remaining = COOLDOWN - (Date.now() - (Number(readStorage(LAST_PRAY_KEY)) || 0));
    if (remaining > 0) {
      toast("一分鐘只能上香一次，請再等 " + Math.ceil(remaining / 1000) + " 秒");
      return;
    }
    prayPending = true;
    showCooldown();
    incenseStick();
    const rect = $("#prayBtn").getBoundingClientRect();
    paperBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, 17);
    const urnRect = $("#incenseUrn").getBoundingClientRect();
    floatingText(urnRect.left + urnRect.width / 2, urnRect.top, "一路好走，下次記得開台");
    playBell();

    if (!workerUrl) {
      toast("香已點燃，但尚未設定線上統計服務");
      prayPending = false;
      showCooldown();
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const resp = await fetch(workerUrl + "/pray", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ visitorId: visitorId() }),
        signal: controller.signal
      });
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      const result = await resp.json();
      updateStats(result);
      writeStorage(LAST_PRAY_KEY, Date.now());
      toast("上香成功！願羅傑下輩子別再買在最高點");
    } catch (err) {
      console.warn("上香統計失敗：", err);
      toast("香已點燃，但線上紀錄失敗，請稍後再試");
      $("#statsStatus").textContent = "上香紀錄未確認，請稍後再試";
    } finally {
      clearTimeout(timer);
      prayPending = false;
      showCooldown();
    }
  }

  function hitWoodfish() {
    knockCount += 1;
    writeStorage(FISH_KEY, knockCount);
    $("#woodfishCount").textContent = numberText(knockCount);
    const button = $("#woodfishBtn");
    button.classList.remove("hit");
    void button.offsetWidth;
    button.classList.add("hit");
    setTimeout(() => button.classList.remove("hit"), 240);
    const rect = button.getBoundingClientRect();
    floatingText(rect.left + rect.width / 2, rect.top + 22, "功德 +1");
    playMokugyo();
    if (knockCount === 83) toast("功德 83！羅傑的智商也剛好是 83");
    else if (knockCount % 100 === 0) {
      paperBurst(rect.left + rect.width / 2, rect.top + 20, 20);
      toast("木魚百連擊！功德無量，開台機率仍然未知");
    }
  }

  async function share() {
    const data = { title: "羅傑 Roger9527 線上追思靈堂", text: "來替羅傑上香，敲一下木魚。純屬惡搞創作！", url: window.location.href };
    try {
      if (navigator.share) {
        await navigator.share(data);
      } else if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(data.url);
        toast("靈堂網址已複製，快請好傑寶來上香");
      } else {
        toast("請複製瀏覽器網址分享給朋友");
      }
    } catch (err) {
      if (err.name !== "AbortError") toast("分享未成功，請直接複製網址");
    }
  }

  $("#prayBtn").addEventListener("click", pray);
  $("#woodfishBtn").addEventListener("click", hitWoodfish);
  $("#shareBtn").addEventListener("click", share);
  $("#soundToggle").addEventListener("click", () => {
    soundEnabled = !soundEnabled;
    writeStorage(SOUND_KEY, soundEnabled ? "0" : "1");
    $("#soundToggle").textContent = soundEnabled ? "音效：開" : "音效：關";
    $("#soundToggle").setAttribute("aria-pressed", String(soundEnabled));
    if (soundEnabled) playMokugyo();
  });
  $("#soundToggle").textContent = soundEnabled ? "音效：開" : "音效：關";
  $("#soundToggle").setAttribute("aria-pressed", String(soundEnabled));
  $("#woodfishCount").textContent = numberText(knockCount);
  showCooldown();
  fetchStats();
  setInterval(showCooldown, 1000);
  setInterval(fetchStats, 30000);
  window.addEventListener("focus", fetchStats);
})();
