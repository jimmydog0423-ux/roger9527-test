(() => {
  "use strict";

  // 兩個市場各一張「原網站持倉加權總市值」走勢。
  // 頁面上的 -700,000 TWD 與 -50,000 USD 是使用者指定的固定追思設定，
  // 不由行情計算、也不應被當成真實投資損益。
  const config = window.APP_CONFIG || {};
  const api = window.APP_WORKER;
  const holdings = Array.isArray(config.holdings) ? config.holdings : [];
  const $ = (selector) => document.querySelector(selector);
  const panels = [
    { market: "TWD", canvas: "#taiwanTrend", status: "#twTrendStatus", time: "#twTrendTime" },
    { market: "USD", canvas: "#usaTrend", status: "#usTrendStatus", time: "#usTrendTime" }
  ];
  const chartInstances = {};
  let refreshing = false;

  const money = (value, currency) => new Intl.NumberFormat("zh-TW", {
    style: "currency", currency, maximumFractionDigits: currency === "TWD" ? 0 : 2
  }).format(value);

  function validPositive(value) {
    return value !== null && value !== "" && Number.isFinite(Number(value)) && Number(value) > 0;
  }
  function normalizeHistory(data) {
    if (!Array.isArray(data)) return [];
    const unique = new Map();
    for (const point of data) {
      if (!validPositive(point?.time) || !validPositive(point?.price)) continue;
      unique.set(Number(point.time), Number(point.price));
    }
    return [...unique].sort((a, b) => a[0] - b[0]).map(([time, price]) => ({ time, price }));
  }
  function historicalPriceAt(history, time) {
    // 使用「截至該時間的最近報價」，在每檔的第一筆歷史資料之前則使用其第一筆。
    let left = 0;
    let right = history.length - 1;
    let chosen = history[0].price;
    while (left <= right) {
      const middle = (left + right) >>> 1;
      if (history[middle].time <= time) {
        chosen = history[middle].price;
        left = middle + 1;
      } else {
        right = middle - 1;
      }
    }
    return chosen;
  }
  function buildPortfolioSeries(market, quotes) {
    const marketHoldings = holdings.filter(h => h.currency === market && validPositive(h.qty));
    const available = marketHoldings.map(h => {
      const quote = quotes?.[h.apiSymbol];
      const history = quote?.success ? normalizeHistory(quote.history) : [];
      return { ...h, history };
    }).filter(h => h.history.length >= 2);
    const missing = marketHoldings.length - available.length;
    if (available.length === 0) return { series: [], available: 0, total: marketHoldings.length, missing };

    // 避免將資料不完整的股票當作零元；缺漏持倉直接排除並明確提示。
    const times = [...new Set(available.flatMap(h => h.history.map(p => p.time)))]
      .sort((a, b) => a - b);
    const series = times.map(time => ({
      time,
      value: available.reduce((sum, h) => sum + historicalPriceAt(h.history, time) * Number(h.qty), 0)
    })).filter(p => Number.isFinite(p.value) && p.value > 0);
    // 去除跨時區/不同開市時間造成的少數跳價異常；只保留真實報價計算值。
    // 不修改價格曲線、不插入隨機或示意資料。
    return { series, available: available.length, total: marketHoldings.length, missing };
  }
  function shortTime(epochSeconds) {
    return new Date(epochSeconds * 1000).toLocaleString("zh-TW", {
      month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false
    });
  }
  function draw(panel, quotes) {
    const el = $(panel.status);
    const result = buildPortfolioSeries(panel.market, quotes);
    if (result.series.length < 2 || typeof Chart === "undefined") {
      if (chartInstances[panel.market]) {
        chartInstances[panel.market].destroy();
        delete chartInstances[panel.market];
      }
      el.textContent = typeof Chart === "undefined"
        ? "圖表程式載入失敗，請重新整理"
        : "目前無足夠有效歷史行情，無法繪製真實走勢";
      $(panel.time).textContent = "—";
      return;
    }

    const items = result.series;
    const labels = items.map(item => shortTime(item.time));
    const values = items.map(item => item.value);
    const goingDown = values[values.length - 1] < values[0];
    const stroke = goingDown ? "#cb5552" : "#caa15e";
    const ctx = $(panel.canvas).getContext("2d");
    const fill = ctx.createLinearGradient(0, 0, 0, 230);
    fill.addColorStop(0, goingDown ? "rgba(177,53,58,.32)" : "rgba(203,166,98,.28)");
    fill.addColorStop(1, "rgba(15,12,10,0)");

    const old = chartInstances[panel.market];
    if (old) old.destroy();
    chartInstances[panel.market] = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: panel.market === "TWD" ? "台股持倉加權市值" : "美股持倉加權市值",
          data: values,
          borderColor: stroke,
          backgroundColor: fill,
          borderWidth: 2.5,
          tension: .21,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHitRadius: 14,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 550 },
        interaction: { intersect: false, mode: "index" },
        plugins: {
          legend: { display: false },
          tooltip: {
            displayColors: false,
            callbacks: { label: ctx => "持倉加權總市值：" + money(ctx.parsed.y, panel.market) }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: { color: "#b2a38c", maxTicksLimit: 4, maxRotation: 0 }
          },
          y: {
            position: "right",
            border: { display: false },
            grid: { color: "rgba(223,191,138,.09)" },
            ticks: { color: "#b2a38c", maxTicksLimit: 5,
              callback: value => new Intl.NumberFormat("zh-TW", {
                notation: "compact", maximumFractionDigits: 1
              }).format(value)
            }
          }
        }
      }
    });
    el.textContent = result.missing
      ? "僅納入 " + result.available + "/" + result.total + " 檔有有效歷史報價的原持股"
      : "已納入原網站全部 " + result.available + " 檔持股";
    $(panel.time).textContent = labels[0] + " — " + labels[labels.length - 1];
  }

  async function refresh() {
    if (refreshing) return;
    refreshing = true;
    const btn = $("#trendRefreshBtn");
    btn.disabled = true;
    btn.textContent = "更新中…";
    for (const panel of panels) $(panel.status).textContent = "正在讀取最新行情…";

    try {
      const symbols = [...new Set(holdings.filter(h => h.currency === "USD" || h.currency === "TWD")
        .map(h => h.apiSymbol).filter(Boolean))];
      if (symbols.length === 0) throw new Error("原網站沒有持倉設定");
      const { data, source } = await api.getMarket(symbols);
      for (const panel of panels) draw(panel, data.data);
      $("#trendUpdatedAt").textContent = "最近更新：" +
        new Date().toLocaleTimeString("zh-TW", { hour12: false }) +
        " · " + source + " Worker";
    } catch (error) {
      console.warn("整體持倉走勢更新失敗：", error);
      for (const panel of panels) {
        if (!chartInstances[panel.market]) {
          $(panel.status).textContent = "真實行情暫不可用，請稍後再試";
          $(panel.time).textContent = "—";
        } else {
          $(panel.status).textContent = "行情暫時無法更新，保留上次成功資料";
        }
      }
      $("#trendUpdatedAt").textContent = "行情更新失敗";
    } finally {
      refreshing = false;
      btn.disabled = false;
      btn.textContent = "更新走勢";
    }
  }

  $("#trendRefreshBtn").addEventListener("click", refresh);
  refresh();
})();
