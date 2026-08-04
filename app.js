(() => {
  "use strict";

  const C = window.APP_CONFIG;
  if (!C) throw new Error("找不到 APP_CONFIG，請確認 config.js 已正確載入。");
  const PRAY_API_URL = C.workerUrl;
  const state = {
    prices: Object.fromEntries(
      C.holdings.map(h => [
        h.id,
        h.fallbackPrice
      ])
    ),
  
    histories: Object.fromEntries(
      C.holdings.map(h => [
        h.id,
        []
      ])
    ),
  
    charts: {},
  
    totalChart: null,
  
    fxHistory: [],
  
    usdTwd: C.fallbackUsdTwd,
    sound: true,
    countdown: C.refreshSeconds,
  
    autoRefresh:
      localStorage.getItem("autoRefresh") !== "false",
  
    refreshing: false,
    lastSuccessAt: null
  };

  const $ = selector => document.querySelector(selector);
  const money = (value, currency = "TWD") => new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "TWD" ? 0 : 2
  }).format(Number(value) || 0);
  const num = value => new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 2 }).format(Number(value) || 0);
  const signed = value => `${value >= 0 ? "+" : "-"}${money(Math.abs(value), "TWD")}`;

  function holdingData(h) {
    const price = Number(state.prices[h.id] ?? h.fallbackPrice);
    const pnlOriginal = (price - h.cost) * h.qty;
    const fx = h.currency === "USD" ? state.usdTwd : 1;
    return {
      ...h,
      price,
      pnlOriginal,
      pnlTwd: pnlOriginal * fx,
      costTwd: h.cost * h.qty * fx,
      valueTwd: price * h.qty * fx
    };
  }

  function render() {
  const data = C.holdings.map(holdingData);

  const totalPnl = data.reduce(
    (sum, holding) => sum + holding.pnlTwd,
    0
  );

  const totalCost = data.reduce(
    (sum, holding) => sum + holding.costTwd,
    0
  );

  const totalPercent = totalCost
    ? totalPnl / totalCost * 100
    : 0;

  const totalPnlElement =
    document.querySelector("#totalPnl");

  const totalPnlPercentElement =
    document.querySelector("#totalPnlPct");

  const totalCostElement =
    document.querySelector("#totalCost");

  const usdTwdElement =
    document.querySelector("#usdTwd");

  if (totalPnlElement) {
    totalPnlElement.textContent =
      signed(totalPnl);
  }

  if (totalPnlPercentElement) {
    totalPnlPercentElement.textContent =
      `${totalPercent >= 0 ? "+" : ""}` +
      `${totalPercent.toFixed(2)}%`;
  }

  if (totalCostElement) {
    totalCostElement.textContent =
      money(totalCost, "TWD");
  }

  if (usdTwdElement) {
    usdTwdElement.textContent =
      Number(state.usdTwd).toFixed(3);
  }

  const totalCard =
    document.querySelector(".summary-card.total");

  if (totalCard) {
    totalCard.classList.toggle(
      "loss",
      totalPnl < 0
    );

    totalCard.classList.toggle(
      "profit",
      totalPnl >= 0
    );
  }

  const taiwanHoldings = data.filter(
    holding =>
      holding.currency === "TWD" ||
      holding.market === "TW"
  );

  const usHoldings = data.filter(
    holding =>
      holding.currency === "USD" ||
      holding.market === "US"
  );

  const twPortfolio =
    document.querySelector("#twPortfolio");

  const usPortfolio =
    document.querySelector("#usPortfolio");

  if (twPortfolio) {
    twPortfolio.innerHTML =
      taiwanHoldings
        .map(createStockCard)
        .join("");
  }

  if (usPortfolio) {
    usPortfolio.innerHTML =
      usHoldings
        .map(createStockCard)
        .join("");
  }

  const tickerHtml = data
    .map(holding => {
      const className =
        holding.pnlTwd < 0
          ? "down"
          : "up";

      return `
        <span class="${className}">
          ${holding.ticker}
          ${money(
            holding.price,
            holding.currency
          )}
          ·
          ${signed(holding.pnlTwd)}
        </span>
      `;
    })
    .join("");

  const ticker =
    document.querySelector("#ticker");

  if (ticker) {
    ticker.innerHTML =
      tickerHtml + tickerHtml;
  }

  renderRanking(data);

  document
    .querySelectorAll(".stock-card")
    .forEach(card => {
      card.addEventListener(
        "click",
        () => cardEvent(card)
      );
    });

  if (typeof renderCharts === "function") {
    renderCharts(data);
    renderTotalPortfolioChart(data);
  }
}
function createStockCard(holding) {
  const isLoss = holding.pnlTwd < 0;

  const priceDifference =
    holding.price - holding.cost;

  const statusText =
    holding.market === "MANUAL"
      ? "手動估值"
      : "Yahoo API";

  const fixedSoundText =
    holding.id === "mrvl"
      ? `<div class="fixed-sound-note">
           點擊固定播放 MRVL 專屬音效
         </div>`
      : "";

  return `
    <article
      class="stock-card"
      data-id="${holding.id}"
      style="--glow:${
        isLoss
          ? "var(--red)"
          : "var(--green)"
      }"
    >
      <div class="card-top">
        <div>
          <div class="ticker-code">
            ${holding.ticker}
          </div>

          <h3>${holding.name}</h3>
        </div>

        <span class="status-badge">
          ${statusText}
        </span>
      </div>

      <div class="price">
        ${money(
          holding.price,
          holding.currency
        )}
      </div>

      <div class="currency">
        最新現價 · ${holding.currency}
      </div>

      <div class="card-stats">
        <div class="stat">
          <span>入場成本</span>

          <b>
            ${money(
              holding.cost,
              holding.currency
            )}
          </b>
        </div>

        <div class="stat">
          <span>持有數量</span>

          <b>
            ${num(holding.qty)} 股
          </b>
        </div>

        <div class="stat">
          <span>每股價差</span>

          <b>
            ${priceDifference >= 0 ? "+" : ""}
            ${num(priceDifference)}
          </b>
        </div>
      </div>

      <div
        class="pnl ${
          isLoss
            ? "loss"
            : "profit"
        }"
      >
        ${
          isLoss
            ? "賠"
            : "賺"
        }

        ${money(
          Math.abs(holding.pnlOriginal),
          holding.currency
        )}

        <br />

        <small>
          約 ${signed(holding.pnlTwd)}
        </small>
      </div>

      ${fixedSoundText}

      <div class="chart-wrap">
        <canvas
          id="chart-${holding.id}"
        ></canvas>
      </div>

      ${
        holding.note
          ? `
            <div class="manual-note">
              ${holding.note}
            </div>
          `
          : ""
      }
    </article>
  `;
}
  function renderRanking(data) {
  if (!Array.isArray(data) || data.length === 0) {
    return;
  }

  const sorted = [...data].sort(
    (a, b) => a.pnlTwd - b.pnlTwd
  );

  const worst = sorted[0];
  const best = sorted[sorted.length - 1];

  const worstHolding =
    document.querySelector("#worstHolding");

  const worstPnl =
    document.querySelector("#worstPnl");

  const bestHolding =
    document.querySelector("#bestHolding");

  const bestPnl =
    document.querySelector("#bestPnl");

  if (worstHolding) {
    worstHolding.textContent =
      `${worst.name} (${worst.ticker})`;
  }

  if (worstPnl) {
    worstPnl.textContent =
      signed(worst.pnlTwd);
  }

  if (bestHolding) {
    bestHolding.textContent =
      `${best.name} (${best.ticker})`;
  }

  if (bestPnl) {
    bestPnl.textContent =
      signed(best.pnlTwd);
  }
}

  function renderCharts(holdings) {
    if (typeof Chart === "undefined") {
      console.warn("Chart.js 尚未載入");
      return;
    }

    for (const holding of holdings) {
      const canvas = document.getElementById(`chart-${holding.id}`);
      if (!canvas) continue;

      const history = normalizeHistory(
        state.histories[holding.id]
      );
      if (state.charts[holding.id]) {
        state.charts[holding.id].destroy();
        delete state.charts[holding.id];
      }

      if (history.length < 2) {
        continue;
      }

      const labels = history.map(item =>
        new Date(item.time * 1000).toLocaleTimeString("zh-TW", {
          hour: "2-digit", minute: "2-digit", hour12: false
        })
      );
      const prices = history.map(item => item.price);
      const isUp = prices[prices.length - 1] >= prices[0];

      state.charts[holding.id] = new Chart(canvas, {
        type: "line",
        data: {
          labels,
          datasets: [{
            data: prices,
            borderColor: isUp ? "#38f29a" : "#ff385c",
            backgroundColor: isUp ? "rgba(56,242,154,.12)" : "rgba(255,56,92,.12)",
            fill: true,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { intersect: false, mode: "index" },
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: context => money(context.parsed.y, holding.currency) } }
          },
          scales: {
            x: { display: false, grid: { display: false } },
            y: { display: false, grid: { display: false } }
          }
        }
      });
    }
  }
  function renderTotalPortfolioChart(holdings) {
  if (typeof Chart === "undefined") {
    console.warn("Chart.js 尚未載入");
    return;
  }

  const canvas =
    document.querySelector(
      "#totalPortfolioChart"
    );
  const currentValueElement =
    document.querySelector("#currentPortfolioValue");
  if (!canvas) {
    return;
  }

  const timeline =
    buildPortfolioTimeline(holdings);

  if (state.totalChart) {
    state.totalChart.destroy();
    state.totalChart = null;
  }

  if (timeline.length === 0) {
    const context =
      canvas.getContext("2d");

    context.clearRect(
      0,
      0,
      canvas.width,
      canvas.height
    );

    context.font =
      "15px Noto Sans TC";

    context.textAlign =
      "center";

    context.fillStyle =
      "rgba(255,255,255,.5)";

    context.fillText(
      "目前沒有足夠的總資產走勢資料",
      canvas.width / 2,
      100
    );

    return;
  }

  const labels =
    timeline.map(item =>
      formatChartDate(item.time)
    );

  const values =
    timeline.map(item =>
      item.totalValueTwd
    );

  const firstValue =
    values[0];

  const lastValue =
    values[values.length - 1];

  const isUp =
    lastValue >= firstValue;

 const currentPortfolioValue =
  holdings.reduce(
    (total, holding) => {
      const price =
        isValidNumber(holding.price)
          ? Number(holding.price)
          : 0;

      const quantity =
        Number(holding.qty) || 0;

      const exchangeRate =
        holding.currency === "USD"
          ? (
              isValidNumber(state.usdTwd)
                ? Number(state.usdTwd)
                : Number(C.fallbackUsdTwd)
            )
          : 1;

      return total +
        price *
        quantity *
        exchangeRate;
    },
    0
  );

if (currentValueElement) {
  currentValueElement.textContent =
    money(
      currentPortfolioValue,
      "TWD"
    );
}

  const startDateElement =
    document.querySelector(
      "#totalChartStartDate"
    );

  const endDateElement =
    document.querySelector(
      "#totalChartEndDate"
    );

  if (startDateElement) {
    startDateElement.textContent =
      formatFullDate(
        timeline[0].time
      );
  }

  if (endDateElement) {
    endDateElement.textContent =
      formatFullDate(
        timeline[timeline.length - 1].time
      );
  }

  const context =
    canvas.getContext("2d");

  const gradient =
    context.createLinearGradient(
      0,
      0,
      0,
      300
    );

  if (isUp) {
    gradient.addColorStop(
      0,
      "rgba(56,242,154,.32)"
    );

    gradient.addColorStop(
      1,
      "rgba(56,242,154,0)"
    );
  } else {
    gradient.addColorStop(
      0,
      "rgba(255,56,92,.32)"
    );

    gradient.addColorStop(
      1,
      "rgba(255,56,92,0)"
    );
  }

  state.totalChart =
    new Chart(canvas, {
      type: "line",

      data: {
        labels,

        datasets: [
          {
            label: "全資產總市值",
            data: values,

            borderColor:
              isUp
                ? "#38f29a"
                : "#ff385c",

            backgroundColor:
              gradient,

            fill: true,
            borderWidth: 3,
            pointRadius: 0,
            pointHoverRadius: 6,
            pointHitRadius: 12,
            tension: 0.25
          }
        ]
      },

      options: {
        responsive: true,
        maintainAspectRatio: false,

        animation: {
          duration: 650
        },

        interaction: {
          mode: "index",
          intersect: false
        },

        plugins: {
          legend: {
            display: false
          },

          tooltip: {
            displayColors: false,

            callbacks: {
              title(items) {
                const index =
                  items[0].dataIndex;

                return formatFullDateTime(
                  timeline[index].time
                );
              },

              label(context) {
                return (
                  "總市值：" +
                  money(
                    context.parsed.y,
                    "TWD"
                  )
                );
              },

              afterLabel(context) {
                if (
                  context.dataIndex === 0
                ) {
                  return "";
                }

                const current =
                  values[
                    context.dataIndex
                  ];

                const previous =
                  values[
                    context.dataIndex - 1
                  ];

                const difference =
                  current - previous;

                return (
                  "較前一筆：" +
                  signed(difference)
                );
              }
            }
          }
        },

        scales: {
          x: {
            grid: {
              display: false
            },

            ticks: {
              color:
                "rgba(255,255,255,.55)",

              maxTicksLimit: 8,

              maxRotation: 0,
              autoSkip: true
            }
          },

          y: {
            position: "right",

            grid: {
              color:
                "rgba(255,255,255,.07)"
            },

            ticks: {
              color:
                "rgba(255,255,255,.55)",

              callback(value) {
                return formatCompactTwd(
                  value
                );
              }
            }
          }
        }
      }
    });
}
 function buildPortfolioTimeline(holdings) {
  const allTimes = new Set();
  const preparedHistories = {};

  // 先整理所有股票歷史資料
  for (const holding of holdings) {
    const history = normalizeHistory(
      state.histories[holding.id]
    );

    preparedHistories[holding.id] = history;

    for (const item of history) {
      if (
        isValidNumber(item.time) &&
        isValidNumber(item.price)
      ) {
        allTimes.add(Number(item.time));
      }
    }
  }

  const preparedFxHistory =
    normalizeHistory(state.fxHistory);

  for (const item of preparedFxHistory) {
    if (
      isValidNumber(item.time) &&
      isValidNumber(item.price)
    ) {
      allTimes.add(Number(item.time));
    }
  }

  const times = [...allTimes]
    .filter(isValidNumber)
    .sort((a, b) => a - b);

  if (times.length < 2) {
    return [];
  }

  const rawTimeline = [];

  for (const time of times) {
    let totalValueTwd = 0;
    let valid = true;

    for (const holding of holdings) {
      const history =
        preparedHistories[holding.id] || [];

      const currentPrice =
        isValidNumber(holding.price)
          ? Number(holding.price)
          : Number(holding.fallbackPrice);

      /*
       * 若時間早於該股票第一筆資料，
       * 使用第一筆歷史價格，而不是目前價格。
       */
      const historicalPrice =
        findPriceAtTime(
          history,
          time,
          currentPrice
        );

      if (!isValidNumber(historicalPrice)) {
        valid = false;
        break;
      }

      let exchangeRate = 1;

      if (holding.currency === "USD") {
        const currentFx =
          isValidNumber(state.usdTwd)
            ? Number(state.usdTwd)
            : Number(C.fallbackUsdTwd);

        exchangeRate =
          findPriceAtTime(
            preparedFxHistory,
            time,
            currentFx
          );

        if (!isValidNumber(exchangeRate)) {
          valid = false;
          break;
        }
      }

      const quantity = Number(holding.qty);

      if (
        !Number.isFinite(quantity) ||
        quantity < 0
      ) {
        valid = false;
        break;
      }

      const holdingValue =
        historicalPrice *
        quantity *
        exchangeRate;

      if (
        !Number.isFinite(holdingValue) ||
        holdingValue < 0
      ) {
        valid = false;
        break;
      }

      totalValueTwd += holdingValue;
    }

    /*
     * 不讓 NaN、Infinity、0 或錯誤資料
     * 進入總市值圖表。
     */
    if (
      valid &&
      Number.isFinite(totalValueTwd) &&
      totalValueTwd > 0
    ) {
      rawTimeline.push({
        time,
        totalValueTwd
      });
    }
  }

  return removePortfolioOutliers(rawTimeline);
}
function findPriceAtTime(
  history,
  timestamp,
  fallbackPrice
) {
  const normalizedHistory =
    normalizeHistory(history);

  if (normalizedHistory.length === 0) {
    return isValidNumber(fallbackPrice)
      ? Number(fallbackPrice)
      : null;
  }

  const firstItem =
    normalizedHistory[0];

  const lastItem =
    normalizedHistory[
      normalizedHistory.length - 1
    ];

  /*
   * 時間早於第一筆歷史資料：
   * 使用第一筆歷史價格。
   *
   * 不能使用現在價格，否則到第一筆資料時
   * 會產生垂直跳動。
   */
  if (timestamp <= firstItem.time) {
    return firstItem.price;
  }

  /*
   * 時間晚於最後一筆：
   * 延續最後一筆有效價格。
   */
  if (timestamp >= lastItem.time) {
    return lastItem.price;
  }

  let left = 0;
  let right =
    normalizedHistory.length - 1;

  let result = firstItem.price;

  while (left <= right) {
    const middle =
      Math.floor((left + right) / 2);

    const item =
      normalizedHistory[middle];

    if (item.time <= timestamp) {
      result = item.price;
      left = middle + 1;
    } else {
      right = middle - 1;
    }
  }

  return isValidNumber(result)
    ? Number(result)
    : null;
}
function removePortfolioOutliers(timeline) {
  if (
    !Array.isArray(timeline) ||
    timeline.length < 3
  ) {
    return timeline || [];
  }

  const result = [];

  for (
    let index = 0;
    index < timeline.length;
    index++
  ) {
    const current = timeline[index];

    if (
      !Number.isFinite(current.totalValueTwd) ||
      current.totalValueTwd <= 0
    ) {
      continue;
    }

    const previous =
      result[result.length - 1];

    const next =
      timeline[index + 1];

    if (!previous || !next) {
      result.push(current);
      continue;
    }

    const previousValue =
      previous.totalValueTwd;

    const currentValue =
      current.totalValueTwd;

    const nextValue =
      next.totalValueTwd;

    const changeFromPrevious =
      Math.abs(
        currentValue - previousValue
      ) / previousValue;

    const changeToNext =
      Math.abs(
        currentValue - nextValue
      ) / nextValue;

    const previousToNext =
      Math.abs(
        previousValue - nextValue
      ) / previousValue;

    /*
     * 前後兩筆差距很小，但中間一筆突然偏離 25%：
     * 判定為 API 異常尖刺並移除。
     */
    const isSinglePointSpike =
      changeFromPrevious > 0.25 &&
      changeToNext > 0.25 &&
      previousToNext < 0.08;

    if (isSinglePointSpike) {
      console.warn(
        "已排除總市值異常資料：",
        {
          time: new Date(
            current.time * 1000
          ).toLocaleString(),
          value: currentValue,
          previous: previousValue,
          next: nextValue
        }
      );

      continue;
    }

    result.push(current);
  }

  return result;
}
function formatChartDate(timestamp) {
  return new Date(
    Number(timestamp) * 1000
  ).toLocaleString(
    "zh-TW",
    {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }
  );
}

function formatFullDate(timestamp) {
  return new Date(
    Number(timestamp) * 1000
  ).toLocaleDateString(
    "zh-TW",
    {
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }
  );
}

function formatFullDateTime(timestamp) {
  return new Date(
    Number(timestamp) * 1000
  ).toLocaleString(
    "zh-TW",
    {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }
  );
}

function formatCompactTwd(value) {
  const number =
    Number(value) || 0;

  if (
    Math.abs(number) >=
    100000000
  ) {
    return (
      (
        number /
        100000000
      ).toFixed(1) +
      " 億"
    );
  }

  if (
    Math.abs(number) >=
    10000
  ) {
    return (
      (
        number /
        10000
      ).toFixed(0) +
      " 萬"
    );
  }

  return Math.round(
    number
  ).toLocaleString(
    "zh-TW"
  );
}
  function isValidNumber(value, options = {}) {
  const {
    allowZero = false
  } = options;

  // 排除 Yahoo 常見空值
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    value === "null" ||
    value === "undefined"
  ) {
    return false;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return false;
  }

  return allowZero ? parsed >= 0 : parsed > 0;
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) {
    return [];
  }

  const unique = new Map();

  for (const item of history) {
    if (
      !isValidNumber(item?.time) ||
      !isValidNumber(item?.price)
    ) {
      continue;
    }

    const time = Number(item.time);
    const price = Number(item.price);

    // 避免同一時間重複資料
    unique.set(time, {
      time,
      price
    });
  }

  return [...unique.values()]
    .sort((a, b) => a.time - b.time);
}
  async function fetchYahooWorker() {
    const symbols = [...new Set([...C.holdings.map(h => h.apiSymbol), "USDTWD=X"])];
    const url = `${C.workerUrl}/?symbols=${encodeURIComponent(symbols.join(","))}&t=${Date.now()}`;
    const response = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } });

    if (!response.ok) throw new Error(`Worker 回傳 HTTP ${response.status}`);
    const result = await response.json();
    if (!result || !result.data) throw new Error(result?.message || "Worker 未回傳有效資料");

    const usdQuote = result.data["USDTWD=X"];
    
    if (
      usdQuote?.success &&
      isValidNumber(usdQuote.price)
    ) {
      state.usdTwd = Number(usdQuote.price);
    }
    if (Array.isArray(usdQuote?.history)) {
      const normalizedFxHistory =
        normalizeHistory(usdQuote.history);
    
      // 有有效資料才覆蓋，避免 API 暫時空值清掉舊資料
      if (normalizedFxHistory.length > 0) {
        state.fxHistory = normalizedFxHistory;
      }
    }
    let successCount = 0;
    const failed = [];

    for (const h of C.holdings) {
      const quote = result.data[h.apiSymbol];
      if (
          quote?.success &&
          isValidNumber(quote.price)
        ) {
          state.prices[h.id] = Number(quote.price);
        
          if (Array.isArray(quote.history)) {
            const normalizedHistory =
              normalizeHistory(quote.history);
        
            /*
             * 有有效走勢資料才覆蓋。
             * Yahoo 暫時回傳空陣列或全部 null 時，
             * 保留上一筆成功取得的走勢。
             */
            if (normalizedHistory.length > 0) {
              state.histories[h.id] =
                normalizedHistory;
            }
          }
        
          successCount++;
        } else {
          failed.push(h.apiSymbol);
        }
    }

    $("#fxSource").textContent = usdQuote?.success ? "Yahoo Finance" : "預設匯率";
    $("#apiStatus").textContent = successCount ? "連線正常" : "連線失敗";
    $("#apiStatus").className = successCount ? "status-ok" : "status-error";
    $("#apiDetail").textContent = failed.length ? `成功 ${successCount} 檔，失敗 ${failed.length} 檔` : `成功更新 ${successCount} 檔股票`;

    if (failed.length) console.warn("以下代號未取得新報價：", failed.join(", "));
    return successCount > 0;
  }

  async function refresh() {
    if (state.refreshing) return;
    state.refreshing = true;

    const btn = $("#refreshBtn");
    btn.disabled = true;
    btn.textContent = "更新中…";
    $("#apiStatus").textContent = "連線中";

    try {
      const ok = await fetchYahooWorker();
      render();
      state.lastSuccessAt = ok ? new Date() : state.lastSuccessAt;
      $("#updatedAt").textContent = new Date().toLocaleString("zh-TW", { hour12: false });
      state.countdown = C.refreshSeconds;
      toast(ok ? "Yahoo Finance 股價更新完成" : "未取得新報價，保留上次價格");
      playTone(ok ? "success" : "soft");
    } catch (error) {
      console.error(error);
      render();
      $("#apiStatus").textContent = "連線失敗";
      $("#apiStatus").className = "status-error";
      $("#apiDetail").textContent = error.message;
      toast(`更新失敗：${error.message}`);
      playTone("fail");
    } finally {
      btn.disabled = false;
      btn.textContent = "立即更新";
      state.refreshing = false;
    }
  }

  function toast(text) {
    const el = $("#toast");
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove("show"), 2600);
  }

  function playTone(type = "soft") {
    if (!state.sound) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const presets = { success: [660, 880], fail: [180, 90], soft: [300, 430], chaos: [120, 720] };
    const [start, end] = presets[type] || presets.soft;
    osc.type = type === "fail" ? "sawtooth" : "triangle";
    osc.frequency.setValueAtTime(start, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(end, ctx.currentTime + 0.22);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.14, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.38);
  }

  function playRandomMp3() {
    if (!state.sound || !C.mp3Files?.length) return;
    const src = C.mp3Files[Math.floor(Math.random() * C.mp3Files.length)];
    const audio = new Audio(src);
    audio.volume = 0.65;
    audio.play().catch(() => playTone("chaos"));
  }

  function burst(x = innerWidth / 2, y = innerHeight / 2, amount = 20) {
    const chars = ["-$$$", "爆", "哭", "GG", "▼", "💸"];
    for (let i = 0; i < amount; i++) {
      const p = document.createElement("span");
      p.className = "particle";
      p.textContent = chars[Math.floor(Math.random() * chars.length)];
      p.style.left = `${x}px`;
      p.style.top = `${y}px`;
      p.style.setProperty("--x", `${(Math.random() - 0.5) * 420}px`);
      p.style.setProperty("--y", `${-80 - Math.random() * 350}px`);
      p.style.setProperty("--r", `${(Math.random() - 0.5) * 500}deg`);
      p.style.color = Math.random() > 0.5 ? "var(--red)" : "var(--yellow)";
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 1200);
    }
  }

  function cardEvent(card) {
  if (!card) {
    return;
  }

  card.classList.remove("hit");

  void card.offsetWidth;

  card.classList.add("hit");

  const rect =
    card.getBoundingClientRect();

  burst(
    rect.left + rect.width / 2,
    rect.top + rect.height / 2,
    12
  );

  const holding =
    C.holdings.find(
      item => item.id === card.dataset.id
    );

  if (!holding) {
    return;
  }

  // MRVL 固定播放專屬音效
  if (holding.id === "mrvl") {
    playFixedMp3(
      holding.fixedSound ||
      "assets/sounds/mrvl.mp3"
    );
  
    showMrvlEffect();
  } else {
    playRandomMp3();
  }
  const holdingResult =
    holdingData(holding);

  if (holdingResult.pnlTwd < 0) {
    toast(
      `${holdingResult.name} 又被套住了 ` +
      `${money(
        Math.abs(holdingResult.pnlTwd),
        "TWD"
      )}`
    );
  } else {
    toast(
      `${holdingResult.name} 正在賺錢！`
    );
  }
}
function playFixedMp3(src) {
  if (!state.sound) {
    return;
  }

  const audio = new Audio(src);

  audio.volume = 0.8;

  audio.play().catch(error => {
    console.warn(
      `固定音效播放失敗：${src}`,
      error
    );

    playTone("chaos");
  });
}
let mrvlEffectTimer = null;

function showMrvlEffect() {
  const effect =
    document.querySelector("#mrvlEffect");

  if (!effect) {
    console.warn("找不到 #mrvlEffect");
    return;
  }

  clearTimeout(mrvlEffectTimer);

  effect.classList.remove("show");

  void effect.offsetWidth;

  effect.classList.add("show");

  effect.setAttribute(
    "aria-hidden",
    "false"
  );

  createMrvlParticles();

  mrvlEffectTimer = setTimeout(() => {
    hideMrvlEffect();
  }, 3500);
}

function hideMrvlEffect() {
  const effect =
    document.querySelector("#mrvlEffect");

  if (!effect) return;

  effect.classList.remove("show");

  effect.setAttribute(
    "aria-hidden",
    "true"
  );
}

function createMrvlParticles() {
  const symbols = [
    "MRVL",
    "爆",
    "🔥",
    "💥",
    "📉",
    "💸",
    "GG"
  ];

  for (
    let index = 0;
    index < 45;
    index++
  ) {
    const particle =
      document.createElement("span");

    particle.className =
      "mrvl-effect-particle";

    particle.textContent =
      symbols[
        Math.floor(
          Math.random() *
          symbols.length
        )
      ];

    particle.style.left =
      `${window.innerWidth / 2}px`;

    particle.style.top =
      `${window.innerHeight / 2}px`;

    particle.style.setProperty(
      "--particle-x",
      `${(Math.random() - 0.5) * window.innerWidth}px`
    );

    particle.style.setProperty(
      "--particle-y",
      `${(Math.random() - 0.5) * window.innerHeight}px`
    );

    particle.style.setProperty(
      "--particle-rotate",
      `${(Math.random() - 0.5) * 900}deg`
    );

    particle.style.color =
      Math.random() > 0.5
        ? "#ff385c"
        : "#ffd54a";

    document.body.appendChild(
      particle
    );

    setTimeout(() => {
      particle.remove();
    }, 1600);
  }
}

  function chaos() {
    document.body.classList.add("screen-flash");
    setTimeout(() => document.body.classList.remove("screen-flash"), 450);
    document.querySelectorAll(".stock-card").forEach((card, i) => {
      setTimeout(() => {
        card.classList.add("hit");
        setTimeout(() => card.classList.remove("hit"), 600);
      }, i * 55);
    });
    burst(innerWidth / 2, innerHeight / 2, 60);
    playTone("chaos");
    playRandomMp3();
    toast("全資產損益大爆擊");
  }

  function renderSocials() {
    $("#socialLinks").innerHTML = C.socialLinks.map(x => `<a class="social-link" href="${x.url}" target="_blank" rel="noopener"><span class="social-icon">${x.icon}</span><span>${x.name} →</span></a>`).join("");
  }

  $("#refreshBtn")?.addEventListener("click", refresh);
  $("#chaosBtn")?.addEventListener("click", chaos);
  $("#soundBtn")?.addEventListener("click", event => {
    state.sound = !state.sound;
    event.currentTarget.textContent = `音效：${state.sound ? "開" : "關"}`;
    event.currentTarget.setAttribute("aria-pressed", String(state.sound));
    if (state.sound) playTone("success");
  });
  $("#autoRefreshBtn")?.addEventListener("click", event => {
    state.autoRefresh = !state.autoRefresh;
    localStorage.setItem("autoRefresh", String(state.autoRefresh));
    event.currentTarget.textContent = `自動更新：${state.autoRefresh ? "開" : "關"}`;
    event.currentTarget.setAttribute("aria-pressed", String(state.autoRefresh));
    state.countdown = C.refreshSeconds;
    toast(state.autoRefresh ? "已開啟自動更新" : "已關閉自動更新");
  });

  setInterval(() => {
    if (!state.autoRefresh) {
      $("#countdown").textContent = "自動更新已關閉";
      return;
    }
    state.countdown--;
    if (state.countdown <= 0) refresh();
    $("#countdown").textContent = `${Math.max(0, state.countdown)} 秒後自動更新`;
  }, 1000);
  document
    .querySelector("#mrvlEffect")
    ?.addEventListener(
      "click",
      hideMrvlEffect
    );
  
  document.addEventListener(
    "keydown",
    event => {
      if (event.key === "Escape") {
        hideMrvlEffect();
      }
    }
  );

  /* =========================
   燒香拜拜動畫
========================= */
function updatePrayStatsDisplay(stats) {
  const visitorCountElement =
    document.querySelector(
      "#prayVisitorCount"
    );

  const totalCountElement =
    document.querySelector(
      "#prayTotalCount"
    );

  if (visitorCountElement) {
    visitorCountElement.textContent =
      Number(
        stats?.totalVisitors || 0
      ).toLocaleString("zh-TW");
  }

  if (totalCountElement) {
    totalCountElement.textContent =
      `累積香火 ${Number(
        stats?.totalCount || 0
      ).toLocaleString("zh-TW")} 次`;
  }
}
  function getPrayVisitorId() {
  const storageKey =
    "rogerPrayVisitorId";

  let visitorId =
    localStorage.getItem(storageKey);

  if (!visitorId) {
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ) {
      visitorId =
        crypto
          .randomUUID()
          .replaceAll("-", "_");
    } else {
      visitorId =
        `visitor_${Date.now()}_` +
        Math.random()
          .toString(36)
          .slice(2);
    }

    localStorage.setItem(
      storageKey,
      visitorId
    );
  }

  return visitorId;
}
async function loadPrayStats() {
  const visitorCountElement =
    document.querySelector(
      "#prayVisitorCount"
    );

  try {
    const visitorId =
      encodeURIComponent(
        getPrayVisitorId()
      );

    const response = await fetch(
      `${PRAY_API_URL}/pray/stats?visitorId=${visitorId}`,
      {
        cache: "no-store",
        headers: {
          Accept: "application/json"
        }
      }
    );

    const result =
      await response.json();

    if (
      !response.ok ||
      !result?.success
    ) {
      throw new Error(
        result?.message ||
        "無法取得上香統計"
      );
    }

    updatePrayStatsDisplay(result);
  } catch (error) {
    console.error(
      "取得上香統計失敗：",
      error
    );

    if (visitorCountElement) {
      visitorCountElement.textContent =
        "--";
    }
  }
}
async function recordPray() {
  const response = await fetch(
    `${PRAY_API_URL}/pray`,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        visitorId:
          getPrayVisitorId()
      })
    }
  );

  const result =
    await response.json();

  if (
    !response.ok ||
    !result?.success
  ) {
    throw new Error(
      result?.message ||
      "上香紀錄失敗"
    );
  }

  updatePrayStatsDisplay(result);

  return result;
}
const PRAY_IMAGES = [
  "assets/images/pray-1.jpg",
  "assets/images/pray-2.jpg"
];

const PRAY_MESSAGE =
  "祝羅傑早日離開這充滿惡意的世界";

let prayAnimationIndex = 0;

function getRandomPrayImage() {
  const randomIndex = Math.floor(
    Math.random() * PRAY_IMAGES.length
  );

  return PRAY_IMAGES[randomIndex];
}

function createPraySparkles(button) {
  const layer = document.querySelector(
    "#prayAnimationLayer"
  );

  if (!layer || !button) {
    return;
  }

  const buttonRect =
    button.getBoundingClientRect();

  const startX =
    buttonRect.left + buttonRect.width / 2;

  const startY =
    buttonRect.top + buttonRect.height / 2;

  for (let index = 0; index < 18; index++) {
    const spark =
      document.createElement("span");

    spark.className = "pray-spark";

    spark.style.left = `${startX}px`;
    spark.style.top = `${startY}px`;

    spark.style.setProperty(
      "--spark-x",
      `${(Math.random() - 0.5) * 420}px`
    );

    spark.style.setProperty(
      "--spark-y",
      `${-100 - Math.random() * 360}px`
    );

    layer.appendChild(spark);

    spark.addEventListener(
      "animationend",
      () => {
        spark.remove();
      },
      {
        once: true
      }
    );
  }
}

async function createPrayFloatAnimation() {
  const button = document.querySelector(
    "#prayFloatingBtn"
  );

  const layer = document.querySelector(
    "#prayAnimationLayer"
  );

  if (!button || !layer) {
    console.warn(
      "找不到拜拜按鈕或動畫圖層"
    );

    return;
  }

  const buttonRect =
    button.getBoundingClientRect();

  const startX =
    buttonRect.left + buttonRect.width / 2;

  const startY =
    buttonRect.top + buttonRect.height / 2;

  const item =
    document.createElement("div");

  item.className = "pray-float-item";

  /*
   * 每次稍微改變終點位置，
   * 連續按下時不會完全重疊。
   */
  const horizontalOffset =
    (Math.random() - 0.5) * 260;

  const verticalOffset =
    Math.random() * 90;

  const endX =
    window.innerWidth / 2 + horizontalOffset;

  const endY =
    window.innerHeight * 0.37 - verticalOffset;

  const rotate =
    (Math.random() - 0.5) * 10;

  item.style.setProperty(
    "--pray-start-x",
    `${startX}px`
  );

  item.style.setProperty(
    "--pray-start-y",
    `${startY}px`
  );

  item.style.setProperty(
    "--pray-end-x",
    `${endX}px`
  );

  item.style.setProperty(
    "--pray-end-y",
    `${endY}px`
  );

  item.style.setProperty(
    "--pray-rotate",
    `${rotate}deg`
  );

  const image =
    document.createElement("img");

  image.className = "pray-float-image";
  image.src = getRandomPrayImage();
  image.alt = "拜拜祈福圖片";

  /*
   * 避免瀏覽器保留破圖。
   */
  image.addEventListener(
    "error",
    () => {
      console.error(
        `圖片載入失敗：${image.src}`
      );

      item.remove();
    },
    {
      once: true
    }
  );

  const message =
    document.createElement("div");

  message.className = "pray-float-text";
  message.textContent = PRAY_MESSAGE;

  item.appendChild(image);
  item.appendChild(message);

  layer.appendChild(item);

  item.addEventListener(
    "animationend",
    () => {
      item.remove();
    },
    {
      once: true
    }
  );

  createPraySparkles(button);
  try {
    await recordPray();
  } catch (error) {
    console.error(
      "上香統計失敗：",
      error
    );
  
    toast("上香成功，但人數紀錄失敗");
  }
  /*
   * 讓按鈕重新觸發震動。
   */
  button.classList.remove("is-praying");

  void button.offsetWidth;

  button.classList.add("is-praying");

  window.setTimeout(() => {
    button.classList.remove("is-praying");
  }, 600);

  prayAnimationIndex++;
}

function setupPrayAnimation() {
  const button = document.querySelector(
    "#prayFloatingBtn"
  );

  if (!button) {
    console.warn(
      "找不到 #prayFloatingBtn"
    );

    return;
  }

  button.addEventListener(
    "click",
    createPrayFloatAnimation
  );
}

  renderSocials();
  render();
  
  setupPrayAnimation();
  loadPrayStats();
  
  const autoRefreshBtn =
    $("#autoRefreshBtn");
  if (autoRefreshBtn) {
    autoRefreshBtn.textContent = `自動更新：${state.autoRefresh ? "開" : "關"}`;
    autoRefreshBtn.setAttribute("aria-pressed", String(state.autoRefresh));
  }
  setTimeout(refresh, 400);
})();
