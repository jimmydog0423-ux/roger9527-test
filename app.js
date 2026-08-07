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
    const response = await fetchWithFallback(
      `/?symbols=${encodeURIComponent(symbols.join(","))}&t=${Date.now()}`,
      {
        cache: "no-store",
        headers: {
          Accept: "application/json"
        }
      }
    );

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

    const response = await fetchWithFallback(
        `/pray/stats?visitorId=${visitorId}`,
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
  const response = await fetchWithFallback(
    "/pray",
    {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
        },
        body: JSON.stringify({
            visitorId: getPrayVisitorId()
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
const PRAY_COOLDOWN = 60 * 1000;
const PRAY_STORAGE_KEY = "roger_pray_last_time";
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
  const lastTime = Number(
      localStorage.getItem(PRAY_STORAGE_KEY) || 0
  );
  
  const remain =
      PRAY_COOLDOWN - (Date.now() - lastTime);
  
  if (remain > 0) {
  
      toast(
          `請等待 ${Math.ceil(remain / 1000)} 秒才能再次上香`
      );
  
      return;
  }
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
    localStorage.setItem(
        PRAY_STORAGE_KEY,
        Date.now()
    );
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

/* ===== 父親節孵蛋彩蛋 ===== */

const EGG_REVEAL_AT =
  new Date("2026-08-08T00:00:00+08:00").getTime();

const EGG_CLICK_TARGET = 12;

const EGG_CLICKS_STORAGE_KEY = "roger_egg_clicks";
const EGG_HATCHED_STORAGE_KEY = "roger_egg_hatched";

function isEggEventLive() {
  return Date.now() >= EGG_REVEAL_AT;
}

function getEggClicks() {
  return Number(
    localStorage.getItem(EGG_CLICKS_STORAGE_KEY) || 0
  );
}

function setEggClicks(value) {
  localStorage.setItem(
    EGG_CLICKS_STORAGE_KEY,
    String(value)
  );
}

function isEggHatched() {
  return (
    localStorage.getItem(EGG_HATCHED_STORAGE_KEY) === "1"
  );
}

function setEggHatched() {
  localStorage.setItem(EGG_HATCHED_STORAGE_KEY, "1");
}

function updateEggCrackStage(button, clicks) {
  const ratio = clicks / EGG_CLICK_TARGET;

  button.classList.remove("crack-1", "crack-2", "crack-3");

  if (ratio >= 0.75) {
    button.classList.add("crack-3");
  } else if (ratio >= 0.5) {
    button.classList.add("crack-2");
  } else if (ratio >= 0.25) {
    button.classList.add("crack-1");
  }
}

function renderEggHatchedState(button) {
  button.classList.add("is-hatched");

  const countEl = document.getElementById("eggClickCount");
  const hintEl = document.getElementById("eggHint");

  if (countEl) {
    countEl.textContent = String(EGG_CLICK_TARGET);
  }

  if (hintEl) {
    hintEl.textContent = "V仔獸已誕生，點我再看一次";
  }

  updateEggCrackStage(button, EGG_CLICK_TARGET);
}

function syncRogerModalBodyScroll() {
  const anyOpen = document.querySelector(
    ".roger-modal.is-open"
  );

  document.body.classList.toggle(
    "roger-modal-open",
    !!anyOpen
  );
}

function openEggHatchModal() {
  const modal = document.getElementById("eggHatchModal");

  if (!modal) {
    return;
  }

  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  syncRogerModalBodyScroll();
}

function closeEggHatchModal() {
  const modal = document.getElementById("eggHatchModal");

  if (!modal) {
    return;
  }

  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  syncRogerModalBodyScroll();
}

function hatchEgg(button) {
  setEggHatched();

  button.classList.add("is-hatching");

  playTone("success");
  burst(
    button.getBoundingClientRect().left + 30,
    button.getBoundingClientRect().top + 30,
    40
  );

  window.setTimeout(() => {
    button.classList.remove("is-hatching");
    renderEggHatchedState(button);
    openEggHatchModal();
  }, 620);
}

function handleEggClick(button, countEl) {
  if (isEggHatched()) {
    openEggHatchModal();
    return;
  }

  const clicks = Math.min(
    getEggClicks() + 1,
    EGG_CLICK_TARGET
  );

  setEggClicks(clicks);

  if (countEl) {
    countEl.textContent = String(clicks);
  }

  updateEggCrackStage(button, clicks);

  button.classList.remove("is-tapped");
  void button.offsetWidth;
  button.classList.add("is-tapped");

  window.setTimeout(() => {
    button.classList.remove("is-tapped");
  }, 350);

  playTone("soft");

  if (clicks >= EGG_CLICK_TARGET) {
    hatchEgg(button);
  }
}

function setupEggHatch() {
  const area = document.getElementById("eggFixedArea");
  const button = document.getElementById("eggFloatingBtn");
  const countEl = document.getElementById("eggClickCount");
  const targetEl = document.getElementById("eggClickTarget");
  const modal = document.getElementById("eggHatchModal");
  const closeBtn = document.getElementById("closeEggHatchBtn");
  const image = document.getElementById("eggHatchImage");
  const imageFallback = document.getElementById(
    "eggHatchImageFallback"
  );

  if (!area || !button || !modal) {
    console.warn("找不到父親節孵蛋彩蛋所需的 HTML 元素");
    return;
  }

  if (!isEggEventLive()) {
    return;
  }

  area.removeAttribute("hidden");

  if (targetEl) {
    targetEl.textContent = String(EGG_CLICK_TARGET);
  }

  const savedClicks = Math.min(
    getEggClicks(),
    EGG_CLICK_TARGET
  );

  if (countEl) {
    countEl.textContent = String(savedClicks);
  }

  updateEggCrackStage(button, savedClicks);

  if (isEggHatched()) {
    renderEggHatchedState(button);
  }

  button.addEventListener("click", () => {
    handleEggClick(button, countEl);
  });

  if (image && imageFallback) {
    image.addEventListener(
      "error",
      () => {
        image.hidden = true;
        imageFallback.hidden = false;
      },
      { once: true }
    );
  }

  closeBtn?.addEventListener("click", closeEggHatchModal);

  modal
    .querySelector("[data-close-egg-modal]")
    ?.addEventListener("click", closeEggHatchModal);
}

function setupRogerAboutModal() {
  const aboutButton =
    document.getElementById("aboutRogerBtn");

  const aboutModal =
    document.getElementById("aboutRogerModal");

  const closeAboutButton =
    document.getElementById("closeAboutRogerBtn");

  const openRelationshipButton =
    document.getElementById("openRelationshipBtn");

  const relationshipModal =
    document.getElementById("relationshipModal");

  const closeRelationshipButton =
    document.getElementById("closeRelationshipBtn");

  const backToAboutButton =
    document.getElementById("backToAboutBtn");

  if (
    !aboutButton ||
    !aboutModal ||
    !closeAboutButton ||
    !openRelationshipButton ||
    !relationshipModal ||
    !closeRelationshipButton ||
    !backToAboutButton
  ) {
    console.warn("找不到羅傑介紹視窗所需的 HTML 元素");
    return;
  }

  function updateBodyScroll() {
    const hasOpenModal =
      aboutModal.classList.contains("is-open") ||
      relationshipModal.classList.contains("is-open");

    document.body.classList.toggle(
      "roger-modal-open",
      hasOpenModal
    );
  }

  function openModal(modal) {
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    updateBodyScroll();
  }

  function closeModal(modal) {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    updateBodyScroll();
  }

  function openAboutModal() {
    closeModal(relationshipModal);
    openModal(aboutModal);
  }

  function closeAllRogerModals() {
    closeModal(aboutModal);
    closeModal(relationshipModal);
  }

  aboutButton.addEventListener(
    "click",
    openAboutModal
  );

  closeAboutButton.addEventListener(
    "click",
    () => closeModal(aboutModal)
  );

  openRelationshipButton.addEventListener(
    "click",
    () => {
      closeModal(aboutModal);
      openModal(relationshipModal);
    }
  );

  closeRelationshipButton.addEventListener(
    "click",
    () => closeModal(relationshipModal)
  );

  backToAboutButton.addEventListener(
    "click",
    openAboutModal
  );

  document
    .querySelectorAll("[data-close-roger-modal]")
    .forEach((backdrop) => {
      backdrop.addEventListener(
        "click",
        () => closeModal(aboutModal)
      );
    });

  document
    .querySelectorAll(
      "[data-close-relationship-modal]"
    )
    .forEach((backdrop) => {
      backdrop.addEventListener(
        "click",
        () => closeModal(relationshipModal)
      );
    });

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") {
        closeAllRogerModals();
      }
    }
  );
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    setupRogerAboutModal
  );
} else {
  setupRogerAboutModal();
}
  function setupRogerRelationshipGraph() {
  const container =
    document.getElementById("rogerRelationshipNetwork");

  const resetButton =
    document.getElementById("resetRelationshipGraphBtn");

  const detailAvatar =
    document.getElementById("relationshipDetailAvatar");
  const detailAvatarImage =
    document.getElementById("relationshipDetailAvatarImage");
  const detailGroup =
    document.getElementById("relationshipDetailGroup");

  const detailName =
    document.getElementById("relationshipDetailName");

  const detailRelation =
    document.getElementById("relationshipDetailRelation");

  const detailDescription =
    document.getElementById(
      "relationshipDetailDescription"
    );

  const filterButtons =
    document.querySelectorAll(
      "[data-relationship-group]"
    );

  if (!container) {
    console.warn("找不到人際關係圖容器");
    return;
  }

  if (typeof vis === "undefined") {
    console.error("vis-network 尚未成功載入");
    return;
  }

  const GROUP_NAMES = {
    center: "中心人物",
    xd: "XD娛樂",
    hearthstone: "爐石實況圈",
    streamer: "實況圈"
  };

  const people = [
  {
    id: "roger",
    name: "羅傑",
    shortName: "羅傑",
    image: "assets/images/people/roger.jpg",
    group: "center",
    relation: "中心",
    description: "共同創辦人、核心藝人，也是整張人際關係圖的中心節點。",
    x: 0,
    y: 0
  },
  {
    id: "taishan",
    name: "泰山",
    shortName: "泰山",
    image: "assets/images/people/泰山.jpg",
    group: "streamer",
    relation: "分身",
    description: "經常被觀眾戲稱是羅傑的分身。",
    x: 200,
    y: -60
  },
  {
    id: "krapysister",
    name: "虧皮妹妹",
    shortName: "虧皮妹",
    image: "assets/images/people/虧皮妹.png",
    group: "streamer",
    relation: "專屬保險業務",
    description: "為羅傑的專屬保險業員。",
    x: 220,
    y: 150
  },
  {
    id: "nl",
    name: "NL（熊班長）",
    shortName: "NL",
    image: "assets/images/people/nl.jpg",
    group: "xd",
    relation: "夫妻",
    description: "XD娛樂共同創辦人、公司老闆，也是羅傑長期合作與互動的重要夥伴。",
    x: -220,
    y: -310
  },
  {
    id: "shaxy",
    name: "薛喜",
    shortName: "薛喜",
    image: "assets/images/people/薛喜.jpg",
    group: "xd",
    relation: "難兄難弟",
    description: "XD娛樂旗下核心藝人，也是羅傑過去《爐石戰記》選手時期的戰友。",
    x: -60,
    y: -340
  },
  {
    id: "eason",
    name: "Eason（蕭老師／發仔）",
    shortName: "Eason",
    image: "assets/images/people/發仔.png",
    group: "xd",
    relation: "麻將損友",
    description: "XD娛樂旗下核心藝人，主要進行爐石與格鬥遊戲實況。",
    x: 110,
    y: -330
  },
  {
    id: "vivi",
    name: "Vivi",
    shortName: "Vivi",
    image: "assets/images/people/vivi.png",
    group: "xd",
    relation: "小三",
    description: "XD娛樂旗下核心藝人，與羅傑具有多年情誼的女性實況主好友。",
    x: 260,
    y: -250
  },
  {
    id: "krapy",
    name: "Krapy（虧皮）",
    shortName: "Krapy",
    image: "assets/images/people/哈K.jpg",
    group: "xd",
    relation: "損友",
    description: "XD娛樂旗下核心藝人，是羅傑在射擊遊戲與戰棋內容中的長年搭檔。",
    x: 340,
    y: -100
  },
  {
    id: "tommy",
    name: "偷米",
    shortName: "偷米",
    image: "assets/images/people/tommy.png",
    group: "xd",
    relation: "麻將損友",
    description: "XD娛樂旗下核心藝人，前爐石職業選手，也是羅傑過去的賽事戰友。",
    x: 360,
    y: 70
  },
  {
    id: "hagon",
    name: "哈耿",
    shortName: "哈耿",
    image: "assets/images/people/哈耿.jpg",
    group: "xd",
    relation: "寵物鯰魚",
    description: "XD娛樂旗下核心藝人，擅長短影音內容與《特戰英豪》實況。",
    x: 300,
    y: 230
  },
  {
    id: "egghead",
    name: "蛋頭",
    shortName: "蛋頭",
    image: "assets/images/people/蛋頭.png",
    group: "xd",
    relation: "損友",
    description: "XD娛樂旗下核心藝人，知名嘻哈饒舌歌手兼實況主。",
    x: 170,
    y: 340
  },
  {
    id: "yuexi",
    name: "月希",
    shortName: "月希",
    image: "assets/images/people/月希.jpg",
    group: "xd",
    relation: "麻吉",
    description: "XD娛樂旗下核心藝人，也是資深 ACG 與電玩節目主持人。",
    x: 0,
    y: 370
  },
  {
    id: "asen",
    name: "阿森",
    shortName: "阿森",
    image: "assets/images/people/阿森.jpg",
    group: "xd",
    relation: "麻吉",
    description: "XD娛樂旗下核心藝人，前 FPS 職業選手兼資深賽評。",
    x: -170,
    y: 340
  },
  {
    id: "kent",
    name: "肯特",
    shortName: "肯特",
    image: "assets/images/people/肯特.jpg",
    group: "xd",
    relation: "損友",
    description: "XD娛樂旗下核心藝人，知名格鬥遊戲《快打旋風》好手。",
    x: -300,
    y: 230
  },
  {
    id: "mmd",
    name: "咪咪蛋",
    shortName: "咪咪蛋",
    image: "assets/images/people/mmd.jpg",
    group: "xd",
    relation: "損友",
    description: "XD娛樂旗下核心藝人，前閃電狼《英雄聯盟》職業選手。",
    x: -370,
    y: 70
  },
  {
    id: "guidong",
    name: "鬼東",
    shortName: "鬼東",
    image: "assets/images/people/鬼東.jpg",
    group: "xd",
    relation: "最強後盾",
    description: "XD娛樂的幕後核心推手，主要負責公司營運與藝人經紀事務。",
    x: -350,
    y: -110
  },
  {
    id: "weifu",
    name: "威傅",
    shortName: "威傅",
    image: "assets/images/people/威傅.jpg",
    group: "hearthstone",
    relation: "損友",
    description: "經常出現在羅傑實況精華，也是常一起語音通話的爐石老戰友。",
    x: -520,
    y: -270
  },
  {
    id: "uzra",
    name: "Uzra",
    shortName: "Uzra",
    image: "assets/images/people/uzra.png",
    group: "hearthstone",
    relation: "損友",
    description: "戰棋與爐石圈大老，實況上與羅傑亦敵亦友，也是經常互相玩梗的對象。",
    x: -550,
    y: 200
  },
  {
    id: "turtle",
    name: "龜狗",
    shortName: "龜狗",
    image: "assets/images/people/龜狗.png",
    group: "streamer",
    relation: "損友",
    description: "早期 DC 語音群的固定班底，也是與羅傑私下交情良好的好友。",
    x: 540,
    y: -240
  },
  {
    id: "overload",
    name: "超負荷",
    shortName: "超負荷",
    image: "assets/images/people/超負荷.jpg",
    group: "streamer",
    relation: "正代餐",
    description: "早期紅色學校同僚，實況效果上經常相愛相殺，也是長期的玩梗對象。",
    x: 550,
    y: 210
  }
];

  const groupColors = {
    center: {
      background: "#ef4f88",
      border: "#ffb15d",
      highlight: {
        background: "#ff6d9d",
        border: "#ffd18f"
      }
    },
    xd: {
      background: "#7549e8",
      border: "#c98cff",
      highlight: {
        background: "#9d67ff",
        border: "#edc9ff"
      }
    },
    hearthstone: {
      background: "#167dcc",
      border: "#70d7ff",
      highlight: {
        background: "#309ce6",
        border: "#c3efff"
      }
    },
    streamer: {
      background: "#26935f",
      border: "#70df9e",
      highlight: {
        background: "#35b979",
        border: "#c3f5d5"
      }
    }
  };

  const relationshipColors = {
    "夫妻": "#ff73ba",
    "難兄難弟": "#d68cff",
    "麻將損友": "#ffbd57",
    "小三": "#ff5c91",
    "損友": "#9a8cff",
    "寵物鯰魚": "#59d8d1",
    "麻吉": "#5ddc8b",
    "最強後盾": "#ffd85c",
    "正代餐": "#ff715c"
  };
  const DEFAULT_PERSON_IMAGE =
  "assets/images/people/default.jpg";

const nodes = new vis.DataSet(
  people.map((person) => {
    const isRoger = person.id === "roger";

    const personImage =
      typeof person.image === "string" &&
      person.image.trim() !== ""
        ? person.image
        : DEFAULT_PERSON_IMAGE;
    const hasImage =
      typeof person.image === "string" &&
      person.image.trim() !== "";
    return {
      id: person.id,
      label: person.shortName,
      group: person.group,

      shape: hasImage ? "circularImage" : "dot",

      image: hasImage ? person.image : undefined,
      

      x: person.x,
      y: person.y,

      fixed: isRoger
        ? {
            x: true,
            y: true
          }
        : false,

      size: isRoger ? 55 : 38,

      font: {
        color: "#ffffff",
        size: isRoger ? 21 : 16,
        face: "Noto Sans TC",
        vadjust: 8,
        strokeWidth: 5,
        strokeColor: "rgba(5, 3, 15, 0.9)"
      },

      borderWidth: isRoger ? 6 : 4,
      borderWidthSelected: 7,

      shadow: {
        enabled: true,
        color: "rgba(0, 0, 0, 0.6)",
        size: isRoger ? 26 : 17,
        x: 0,
        y: 8
      }
    };
  })
);

  const edges = new vis.DataSet(
    people
      .filter((person) => person.id !== "roger")
      .map((person) => ({
        id: `roger-${person.id}`,
        from: "roger",
        to: person.id,
        label: person.relation,
        relation: person.relation,
        color: {
          color:
            relationshipColors[person.relation] ||
            "#a88cff",
          highlight:
            relationshipColors[person.relation] ||
            "#ffffff",
          hover:
            relationshipColors[person.relation] ||
            "#ffffff",
          opacity: 0.72
        },
        width: 2.5,
        selectionWidth: 5,
        hoverWidth: 4,
        smooth: {
          enabled: true,
          type: "continuous",
          roundness: 0.24
        },
        font: {
          color: "#ffffff",
          size: 11,
          face: "Noto Sans TC",
          strokeWidth: 4,
          strokeColor: "rgba(4, 2, 12, 0.92)",
          background: "rgba(20, 12, 40, 0.72)",
          align: "middle"
        }
      }))
  );

  const networkOptions = {
    autoResize: true,

    nodes: {
      chosen: true,
      imagePadding: 3
    },

    groups: {
      center: {
        color: groupColors.center
      },
      xd: {
        color: groupColors.xd
      },
      hearthstone: {
        color: groupColors.hearthstone
      },
      streamer: {
        color: groupColors.streamer
      }
    },

    edges: {
      arrows: {
        to: {
          enabled: false
        }
      }
    },

    interaction: {
      hover: true,
      hoverConnectedEdges: true,
      navigationButtons: true,
      keyboard: {
        enabled: true,
        bindToWindow: false
      },
      tooltipDelay: 150,
      zoomView: true,
      dragView: true,
      dragNodes: true
    },

    physics: {
      enabled: true,
      solver: "forceAtlas2Based",

      forceAtlas2Based: {
        gravitationalConstant: -65,
        centralGravity: 0.012,
        springLength: 235,
        springConstant: 0.045,
        damping: 0.58,
        avoidOverlap: 0.9
      },

      stabilization: {
        enabled: true,
        iterations: 700,
        updateInterval: 40,
        fit: true
      }
    },

    layout: {
      improvedLayout: false
    }
  };

  const network = new vis.Network(
    container,
    {
      nodes,
      edges
    },
    networkOptions
  );

  let activeGroup = "all";

  function getPerson(personId) {
    return people.find(
      (person) => person.id === personId
    );
  }

  function setDetail(personId) {
    const person = getPerson(personId);
  
    if (!person) {
      return;
    }
  
    detailName.textContent = person.name;
  
    detailGroup.textContent =
      GROUP_NAMES[person.group] || "其他";
  
    detailRelation.textContent =
      person.relation;
  
    detailDescription.textContent =
      person.description;
  
    detailAvatar.className =
      `relationship-detail-avatar group-${person.group}`;
  
    if (detailAvatarImage) {
      detailAvatarImage.src = person.image;
      detailAvatarImage.alt = person.name;
  
      detailAvatarImage.onerror = () => {
        detailAvatarImage.src =
          "assets/images/people/default.jpg";
      };
    }
  }

  function getVisibleIds(group) {
    if (group === "all") {
      return people.map((person) => person.id);
    }

    return people
      .filter(
        (person) =>
          person.id === "roger" ||
          person.group === group
      )
      .map((person) => person.id);
  }

  function applyGroupFilter(group) {
    activeGroup = group;

    const visibleIds =
      new Set(getVisibleIds(group));

    nodes.update(
      people.map((person) => ({
        id: person.id,
        hidden: !visibleIds.has(person.id)
      }))
    );

    edges.update(
      people
        .filter((person) => person.id !== "roger")
        .map((person) => ({
          id: `roger-${person.id}`,
          hidden: !visibleIds.has(person.id)
        }))
    );

    filterButtons.forEach((button) => {
      const isActive =
        button.dataset.relationshipGroup === group;

      button.classList.toggle(
        "active",
        isActive
      );
    });

    network.unselectAll();
    setDetail("roger");

    window.setTimeout(() => {
      network.fit({
        nodes: Array.from(visibleIds),
        animation: {
          duration: 500,
          easingFunction: "easeInOutQuad"
        }
      });
    }, 100);
  }

  function highlightPerson(personId) {
    if (personId === "roger") {
      network.selectNodes(["roger"]);
      setDetail("roger");
      return;
    }

    const connectedEdgeId =
      `roger-${personId}`;

    network.setSelection(
      {
        nodes: [personId],
        edges: [connectedEdgeId]
      },
      {
        unselectAll: true,
        highlightEdges: true
      }
    );

    setDetail(personId);

    network.focus(personId, {
      scale: Math.max(network.getScale(), 0.88),
      animation: {
        duration: 420,
        easingFunction: "easeInOutQuad"
      }
    });
  }

  network.on("click", (params) => {
    if (params.nodes.length === 0) {
      network.unselectAll();
      setDetail("roger");
      return;
    }

    highlightPerson(params.nodes[0]);
  });

  network.on("doubleClick", (params) => {
    if (params.nodes.length > 0) {
      network.focus(params.nodes[0], {
        scale: 1.2,
        animation: {
          duration: 450,
          easingFunction: "easeInOutQuad"
        }
      });
    }
  });

  network.once("stabilizationIterationsDone", () => {
    network.setOptions({
      physics: {
        enabled: false
      }
    });

    network.fit({
      animation: {
        duration: 500,
        easingFunction: "easeInOutQuad"
      }
    });
  });

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      applyGroupFilter(
        button.dataset.relationshipGroup
      );
    });
  });

  resetButton?.addEventListener("click", () => {
    applyGroupFilter(activeGroup);
  });

  const openRelationshipButton =
    document.getElementById(
      "openRelationshipBtn"
    );

  openRelationshipButton?.addEventListener(
    "click",
    () => {
      window.setTimeout(() => {
        network.redraw();

        network.fit({
          animation: {
            duration: 500,
            easingFunction: "easeInOutQuad"
          }
        });
      }, 300);
    }
  );

  setDetail("roger");
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    setupRogerRelationshipGraph
  );
} else {
  setupRogerRelationshipGraph();
}
  async function fetchWithFallback(path, options = {}) {
    const urls = [C.workerUrl, C.workerUrl2].filter(Boolean);
  
    let lastError;
  
    for (const baseUrl of urls) {
      try {
        const response = await fetch(`${baseUrl}${path}`, options);
  
        // 免費方案超過每日額度通常會回 429
        if (response.status === 429) {
          throw new Error("Worker quota exceeded");
        }
  
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
  
        return response;
      } catch (error) {
        console.warn(`${baseUrl} 失敗，切換下一個 Worker`, error);
        lastError = error;
      }
    }
  
    throw lastError || new Error("所有 Worker 都無法使用");
  }
  
  renderSocials();
  render();
  
  setupPrayAnimation();
  loadPrayStats();

  setupEggHatch();

  const autoRefreshBtn =
    $("#autoRefreshBtn");
  if (autoRefreshBtn) {
    autoRefreshBtn.textContent = `自動更新：${state.autoRefresh ? "開" : "關"}`;
    autoRefreshBtn.setAttribute("aria-pressed", String(state.autoRefresh));
  }
  setTimeout(refresh, 400);
})();

window.addEventListener("load", () => {

    const notice = document.getElementById("authorNotice");
    const close = document.getElementById("closeNotice");

    // 一天只顯示一次
    const today = new Date().toDateString();

    if(localStorage.getItem("noticeDate") === today){
        notice.style.display = "none";
        return;
    }

    close.addEventListener("click", () => {
        notice.style.display = "none";
        localStorage.setItem("noticeDate", today);
    });

});
