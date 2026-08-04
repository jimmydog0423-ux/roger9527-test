window.APP_CONFIG = {
  refreshSeconds: 60,
  workerUrl: "https://lucky-rice-01c0.jimmydog0423.workers.dev",
  fallbackUsdTwd: 32.38,

  socialLinks: [
    { name: "Twitch", url: "https://www.twitch.tv/roger9527", icon: "TW" },
    { name: "Facebook", url: "https://www.facebook.com/Roger95279527", icon: "FB" },
    { name: "YouTube", url: "https://www.youtube.com/@Roger9527-sb", icon: "YT" }
  ],

  holdings: [
    { id:"yageo", name:"國巨", ticker:"2327.TW", apiSymbol:"2327.TW", currency:"TWD", cost:973, qty:400, fallbackPrice:502.00 },
    { id:"mu", name:"美光", ticker:"MU", apiSymbol:"MU", currency:"USD", cost:955, qty:10, fallbackPrice:874.66 },
    { id:"nbis", name:"Nebius", ticker:"NBIS", apiSymbol:"NBIS", currency:"USD", cost:244, qty:70, fallbackPrice:188.43 },
    { id:"skhy", name:"海力士", ticker:"SKHY", apiSymbol:"SKHY", currency:"USD", cost:172, qty:40, fallbackPrice:149.00 },
    { id:"dram", name:"DRAM ETF", ticker:"DRAM", apiSymbol:"DRAM", currency:"USD", cost:64, qty:300, fallbackPrice:52.34 },
    { id:"spcx", name:"SpaceX", ticker:"SPCX", apiSymbol:"SPCX", currency:"USD", cost:174, qty:90, fallbackPrice:112.20 },
    { id: "mrvl", name: "邁威爾", ticker: "MRVL", market: "US", apiSymbol: "MRVL", currency: "USD", cost: 307, qty: 50, fallbackPrice: 183.30 },
    { id:"nvda", name:"輝達", ticker:"NVDA", apiSymbol:"NVDA", currency:"USD", cost:205, qty:60, fallbackPrice:195.04 },
    { id:"umc", name:"聯電", ticker:"2303.TW", apiSymbol:"2303.TW", currency:"TWD", cost:167, qty:4000, fallbackPrice:121.00 },
    { id:"0050", name:"元大台灣50", ticker:"0050.TW", apiSymbol:"0050.TW", currency:"TWD", cost:105, qty:12000, fallbackPrice:102.85 }
  ],

  mp3Files: [
    "assets/sounds/lose-1.mp3",
    "assets/sounds/lose-2.mp3",
    "assets/sounds/win-1.mp3",
    "assets/sounds/alert-1.mp3"
  ]
};
