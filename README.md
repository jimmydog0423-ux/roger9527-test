# 羅傑全資產戰情室

一個可部署於 GitHub Pages 的純前端投資組合展示網站。

網站使用 HTML、CSS、JavaScript 與 Chart.js 呈現台股、美股、匯率、持倉損益及全資產總市值走勢；行情資料透過 Cloudflare Worker 代理 Yahoo Finance。另整合 Cloudflare D1，用於記錄匿名訪客的上香次數與全站香火統計。

> 本專案僅供娛樂展示，不構成任何投資建議。

## 主要功能

- 台股與美股持倉分區顯示
- 即時價格、成本、持有數量與損益計算
- 美元兌新台幣匯率換算
- 每 60 秒自動更新
- 手動更新與自動更新開關
- 個股五日走勢圖
- 全資產總市值走勢圖
- 過濾 Yahoo Finance 回傳的空值與無效價格
- 排除總市值走勢中的單點異常尖刺
- 最大虧損與最佳表現排行
- 跑馬燈、音效與互動爆擊效果
- MRVL 專屬音效與畫面特效
- 固定位置的上香按鈕
- 隨機祈福圖片飄出動畫
- 匿名訪客上香次數統計
- 全站上香人數與累積香火次數統計

## 專案結構

```text
roger9527/
├─ assets/
│  ├─ images/
│  │  ├─ incense.png
│  │  ├─ pray-1.jpg
│  │  ├─ pray-2.jpg
│  │  └─ mrvl-effect.png
│  └─ sounds/
│     ├─ lose-1.mp3
│     ├─ lose-2.mp3
│     ├─ win-1.mp3
│     ├─ alert-1.mp3
│     └─ mrvl.mp3
├─ index.html
├─ styles.css
├─ app.js
├─ config.js
└─ README.md
```

## 使用技術

- HTML5
- CSS3
- JavaScript
- Chart.js
- GitHub Pages
- Cloudflare Workers
- Yahoo Finance Chart API
- Cloudflare D1

## 本機預覽

直接開啟 `index.html` 可能會遇到瀏覽器安全限制，建議使用簡易 HTTP Server。

### Python

```bash
python -m http.server 8080
```

開啟：

```text
http://localhost:8080
```

### Visual Studio Code

可安裝 Live Server，然後在 `index.html` 上按右鍵並選擇：

```text
Open with Live Server
```

## GitHub Pages 部署

1. 建立一個 Public GitHub repository。
2. 將所有檔案上傳至 repository 根目錄。
3. 進入 `Settings`。
4. 選擇 `Pages`。
5. `Build and deployment` 選擇 `Deploy from a branch`。
6. Branch 選擇 `main`。
7. Folder 選擇 `/ (root)`。
8. 按下 `Save`。
9. 等待 GitHub Pages 完成部署。

## 前端設定

主要設定位於 `config.js`：

```js
window.APP_CONFIG = {
  refreshSeconds: 60,

  workerUrl:
    "https://lucky-rice-01c0.jimmydog0423.workers.dev",

  fallbackUsdTwd: 32.38,

  socialLinks: [
    {
      name: "Twitch",
      url: "https://www.twitch.tv/roger9527",
      icon: "TW"
    }
  ],

  holdings: [
    {
      id: "yageo",
      name: "國巨",
      ticker: "2327.TW",
      apiSymbol: "2327.TW",
      currency: "TWD",
      cost: 973,
      qty: 400,
      fallbackPrice: 502
    }
  ],

  mp3Files: [
    "assets/sounds/lose-1.mp3"
  ]
};
```

### 持股欄位說明

| 欄位 | 說明 |
|---|---|
| `id` | 前端使用的唯一識別值 |
| `name` | 股票顯示名稱 |
| `ticker` | 畫面顯示代號 |
| `apiSymbol` | Yahoo Finance 查詢代號 |
| `currency` | `TWD` 或 `USD` |
| `cost` | 每股平均成本 |
| `qty` | 持有股數 |
| `fallbackPrice` | API 失敗時使用的備援價格 |
| `fixedSound` | 選填，個股專屬音效路徑 |
| `note` | 選填，畫面備註 |

## Cloudflare Worker

Cloudflare Worker 同時提供：

- Yahoo Finance 行情代理
- 上香紀錄 API
- 上香統計 API

### Yahoo Finance 查價

```http
GET /?symbols=2330.TW,MU,USDTWD=X
```

範例：

```text
https://lucky-rice-01c0.jimmydog0423.workers.dev/?symbols=2330.TW,MU,USDTWD=X
```

回傳格式：

```json
{
  "success": true,
  "updatedAt": "2026-08-04T00:00:00.000Z",
  "requestedCount": 3,
  "successCount": 3,
  "failedCount": 0,
  "data": {
    "2330.TW": {
      "success": true,
      "price": 1000,
      "history": []
    }
  }
}
```

## 空值與異常行情處理

Yahoo Finance 的歷史資料可能包含：

```js
null
undefined
""
NaN
```

不可直接只依賴：

```js
Number.isFinite(Number(value))
```

因為：

```js
Number(null) === 0
Number("") === 0
```

專案使用 `isValidNumber()` 與 `normalizeHistory()` 過濾無效資料，避免價格被錯誤視為 `0`，造成走勢圖突然墜落。

總市值走勢另使用以下規則：

- 不讓空值、零值、負數與非有限數值進入圖表
- 不同股票歷史時間不一致時，延續最近一筆有效價格
- 時間早於第一筆歷史資料時，使用第一筆有效歷史價格
- 排除前後正常但中間突然偏離的單點尖刺

## Cloudflare D1 上香資料庫

建立 D1 資料庫，例如：

```text
roger-pray-db
```

在 D1 Console 執行：

```sql
CREATE TABLE IF NOT EXISTS pray_records (
  visitor_id TEXT PRIMARY KEY,
  pray_count INTEGER NOT NULL DEFAULT 0,
  first_pray_at TEXT NOT NULL,
  last_pray_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pray_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visitor_id TEXT NOT NULL,
  prayed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pray_events_visitor
ON pray_events(visitor_id);

CREATE INDEX IF NOT EXISTS idx_pray_events_time
ON pray_events(prayed_at);
```

## 綁定 D1 至 Worker

進入：

```text
Cloudflare Dashboard
→ Workers & Pages
→ lucky-rice-01c0
→ Settings
→ Bindings
→ Add binding
→ D1 database
```

設定：

```text
Variable name：DB
D1 database：roger-pray-db
```

Worker 程式必須使用：

```js
export default {
  async fetch(request, env) {
    // 使用 env.DB
  }
};
```

## 上香 API

### 取得統計

```http
GET /pray/stats?visitorId=匿名訪客ID
```

範例：

```text
https://lucky-rice-01c0.jimmydog0423.workers.dev/pray/stats?visitorId=test_123456789
```

回傳：

```json
{
  "success": true,
  "visitorCount": 2,
  "totalCount": 128,
  "totalVisitors": 47
}
```

| 欄位 | 說明 |
|---|---|
| `visitorCount` | 目前瀏覽器累積上香次數 |
| `totalCount` | 全站累積上香次數 |
| `totalVisitors` | 不同匿名訪客人數 |

### 新增上香紀錄

```http
POST /pray
Content-Type: application/json
```

Request Body：

```json
{
  "visitorId": "42d43e74_85ff_4081_8a5a_df11fe44a317"
}
```

回傳：

```json
{
  "success": true,
  "visitorCount": 3,
  "totalCount": 129,
  "totalVisitors": 47
}
```

## 匿名訪客識別方式

前端第一次進站時使用 `crypto.randomUUID()` 產生匿名 `visitorId`，並存於 `localStorage`。

此方式只能辨識同一個瀏覽器環境。以下情況會被視為新的訪客：

- 清除瀏覽器資料
- 使用無痕模式
- 更換瀏覽器
- 更換裝置

本專案不會收集真實姓名、電子郵件或會員資料。

## 上香動畫

上香按鈕固定在畫面右下角，並顯示：

```text
點我上香
已有 47 人上香
累積香火 128 次
```

點擊後會：

1. 隨機選取 `pray-1.jpg` 或 `pray-2.jpg`。
2. 從按鈕位置向畫面中央飄出。
3. 顯示祈福文字。
4. 產生光點效果。
5. 動畫結束後自動移除。
6. 呼叫 `/pray` 寫入 D1。
7. 即時更新全站統計。

祈福文字：

```text
祝羅傑早日離開這充滿惡意的世界
```

## 初始化位置

拜拜功能只能初始化一次，不可放入 `render()`。

正確位置位於 `app.js` 最後的初始化區：

```js
renderSocials();
render();

setupPrayAnimation();
loadPrayStats();

const autoRefreshBtn =
  $("#autoRefreshBtn");

setTimeout(refresh, 400);
```

錯誤做法：

```js
function render() {
  setupPrayAnimation();
}
```

因為每次更新行情都會重新綁定按鈕事件，導致按一次出現多個動畫。

## CORS 設定

Worker 必須允許 `POST`：

```js
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods":
      "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Accept",
    "Access-Control-Max-Age": "86400"
  };
}
```

上香路由必須寫在 `symbols` 驗證之前：

```js
if (
  requestUrl.pathname === "/pray" &&
  request.method === "POST"
) {
  return await recordPray(request, env);
}

if (
  requestUrl.pathname === "/pray/stats" &&
  request.method === "GET"
) {
  return await getPrayStats(requestUrl, env);
}

const symbols =
  requestUrl.searchParams.get("symbols");
```

否則 `/pray/stats` 會錯誤回傳：

```text
缺少 symbols 參數
```

## 常見問題

### `currentValueElement is not defined`

請在 `renderTotalPortfolioChart()` 中宣告：

```js
const currentValueElement =
  document.querySelector(
    "#currentPortfolioValue"
  );
```

並確認 `index.html` 有：

```html
<strong id="currentPortfolioValue">—</strong>
```

### `/pray/stats` 回傳 400

若顯示：

```text
缺少 symbols 參數
```

代表上香路由放在 Yahoo 查價判斷後面，或 Worker 尚未重新部署。

### 顯示找不到 D1 Binding

若顯示：

```text
找不到 D1 Binding，請確認變數名稱設定為 DB
```

請確認 Worker 的 D1 Binding 名稱為 `DB`。

### 顯示資料表不存在

請在 D1 Console 執行本 README 中的建表 SQL。

### 上香人數永遠是 0

請檢查：

- `/pray/stats` 是否正常回傳
- `/pray` 是否成功寫入
- D1 是否綁定至目前部署的 Worker
- Cloudflare Worker 是否已按下 Deploy
- 瀏覽器 Console 是否有 CORS 錯誤
- HTML 的 ID 是否為 `prayVisitorCount` 與 `prayTotalCount`

### 股票圖表突然掉到 0

請確認歷史資料處理有排除 `null`、`undefined` 與空字串，不可只使用 `Number.isFinite(Number(value))`。

## 音效檔案

預設音效放在：

```text
assets/sounds/
```

可在 `config.js` 修改：

```js
mp3Files: [
  "assets/sounds/lose-1.mp3",
  "assets/sounds/lose-2.mp3",
  "assets/sounds/win-1.mp3",
  "assets/sounds/alert-1.mp3"
]
```

MRVL 專屬音效預設為：

```text
assets/sounds/mrvl.mp3
```

## 圖片檔案

上香功能需要：

```text
assets/images/incense.png
assets/images/pray-1.jpg
assets/images/pray-2.jpg
```

MRVL 特效圖片：

```text
assets/images/mrvl-effect.png
```

檔名大小寫必須與程式碼完全一致。

## 安全與限制

- GitHub Pages 為公開靜態網站。
- 不要把私密 API Key 放入 `config.js`。
- Yahoo Finance 非正式保證服務，可能出現限流、空值或格式變更。
- Cloudflare Worker 與 D1 免費方案均有使用額度。
- `visitorId` 為匿名瀏覽器識別，不代表真實唯一使用者。
- 前端送出的 `visitorId` 可以被偽造。
- 上香 API 若公開，可能遭到大量重複呼叫。

正式公開時可再加入：

- Cloudflare Turnstile
- IP 或訪客頻率限制
- 每分鐘上香次數限制
- Cloudflare WAF 規則
- Worker Rate Limiting

## 製作

製作人：吉米狗

## 授權

本專案主要供個人娛樂與展示使用。網站中的圖片、音效、人物素材及第三方內容，請依各素材原始授權或使用規範處理。
