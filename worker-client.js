/*
 * Cloudflare Worker 雙站備援。
 * GET 可安全嘗試另一台；POST 如結果不明則不自動重送，避免 D1 重複計數。
 * 兩台 Worker 必須各自具備相應 API 路由、CORS 與 D1 綁定。
 */
(() => {
  "use strict";
  const C = window.APP_CONFIG || {};
  const workers = [...new Set([C.workerUrl, C.workerUrl2].filter(url => typeof url === "string" && /^https:\/\//i.test(url)).map(url => url.replace(/\/+$/, "")))];
  const active = { stats: null, market: null };

  function queue(kind) {
    const chosen = active[kind];
    return chosen && workers.includes(chosen)
      ? [chosen, ...workers.filter(url => url !== chosen)]
      : [...workers];
  }

  async function request(base, path, options = {}, timeout = 9000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(base + path, {
        cache: "no-store",
        ...options,
        signal: controller.signal
      });
      // HTTP 狀態必須先檢查，再解析 JSON，避免將 Worker 錯誤訊息當成有效資料。
      if (!response.ok) {
        const err = new Error("Worker HTTP " + response.status);
        err.httpStatus = response.status;
        throw err;
      }
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  function validateStats(json) {
    return json && json.success === true &&
      Number.isFinite(Number(json.totalVisitors)) && Number(json.totalVisitors) >= 0 &&
      Number.isFinite(Number(json.totalCount)) && Number(json.totalCount) >= 0;
  }

  async function safeGet(kind, path, validator) {
    if (!workers.length) throw new Error("沒有設定 Cloudflare Worker 網址");
    const errors = [];
    for (const base of queue(kind)) {
      try {
        const data = await request(base, path, {
          headers: { Accept: "application/json" }
        });
        if (!validator(data)) throw new Error("Worker 回傳格式不符合預期");
        active[kind] = base;
        return { data, source: base === workers[0] ? "主要" : "備援", base };
      } catch (error) {
        console.warn("Worker GET 失敗，嘗試其他來源：", base, error);
        errors.push(error.message);
      }
    }
    throw new Error("主要與備援 Worker 均無法連線：" + errors.join(" / "));
  }

  function getPrayStats(visitorId) {
    const path = "/pray/stats?visitorId=" + encodeURIComponent(visitorId);
    return safeGet("stats", path, validateStats);
  }

  function getMarket(symbols) {
    const path = "/?symbols=" + encodeURIComponent(symbols.join(",")) + "&t=" + Date.now();
    return safeGet("market", path, json => json && json.data && typeof json.data === "object" &&
      symbols.some(symbol => json.data[symbol]?.success &&
        Array.isArray(json.data[symbol]?.history) && json.data[symbol].history.length >= 2));
  }

  async function postPray(visitorId) {
    // 首先確認哪台 Worker 有可用的 D1 上香資料庫，避免發送至只支援行情的備援 Worker。
    if (!active.stats) await getPrayStats(visitorId);
    const first = active.stats;
    const path = "/pray";
    const options = {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ visitorId })
    };
    try {
      const data = await request(first, path, options);
      if (!validateStats(data)) throw new Error("上香寫入回傳格式不符合預期");
      return { data, source: first === workers[0] ? "主要" : "備援" };
    } catch (error) {
      // 404/405 能明確判斷路由不存在且沒有寫入，才允許備援重試。
      // Timeout/CORS/500 可能已經寫入，絕對不可自動重送相同的 POST。
      if (error.httpStatus !== 404 && error.httpStatus !== 405) throw error;
      for (const base of workers.filter(url => url !== first)) {
        try {
          const check = await request(base, "/pray/stats?visitorId=" + encodeURIComponent(visitorId),
            { headers: { Accept: "application/json" } });
          if (!validateStats(check)) continue;
          const data = await request(base, path, options);
          if (!validateStats(data)) throw new Error("備援上香寫入回傳格式不符");
          active.stats = base;
          return { data, source: "備援" };
        } catch (fallbackError) {
          console.warn("備援 Worker 上香失敗：", fallbackError);
        }
      }
      throw new Error("兩個 Worker 均無法完成上香寫入");
    }
  }

  window.APP_WORKER = { getPrayStats, getMarket, postPray };
})();
