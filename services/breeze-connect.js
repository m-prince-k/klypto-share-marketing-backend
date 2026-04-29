const BreezeConnect = require("breezeconnect").BreezeConnect;

const appKey = "J79hE1567716242L7829Vh7)68287507";
const appSecret = "W7T470%0y5923B7SJO@0617684TKs67c";
const sessionToken = "55451082";

const breeze = new BreezeConnect({ appKey });

let isConnected = false;
const latestTicks = {};
const subscribedStocks = {};

async function initBreeze() {
  if (isConnected) return;

  if (!appKey || !appSecret || !sessionToken) {
    throw new Error("Breeze credentials missing");
  }

  await breeze.generateSession(appSecret, sessionToken);
  breeze.wsConnect();

  breeze.onTicks = function (tick) {
    console.log("Market Tick:", tick);

    const stockCode = subscribedStocks[tick.symbol] || tick.symbol;

    latestTicks[stockCode] = {
      stockCode,
      tokenSymbol: tick.symbol,
      open: tick.open,
      high: tick.high,
      low: tick.low,
      last: tick.last,
      close: tick.close,
      change: tick.change,
      bPrice: tick.bPrice,
      bQty: tick.bQty,
      sPrice: tick.sPrice,
      sQty: tick.sQty,
      volume: tick.ttq,
      avgPrice: tick.avgPrice,
      ltt: tick.ltt,
      exchange: tick.exchange,
      raw: tick,
      receivedAt: new Date().toISOString()
    };
  };

  isConnected = true;
}

async function subscribeStock({
  exchangeCode = "NFO",
  stockCode = "NIFTY",
  productType = "futures",
  expiryDate = "28-Apr-2026",
  right = "others",
  strikePrice = "0",
  getExchangeQuotes = true,
  getMarketDepth = false
}) {
  await initBreeze();

  const response = await breeze.subscribeFeeds({
    exchangeCode,
    stockCode,
    productType,
    expiryDate,
    right,
    strikePrice,
    getExchangeQuotes,
    getMarketDepth
  });

  // fallback mapping by stockCode
  subscribedStocks[stockCode] = stockCode;

  return {
    success: true,
    message: "Subscribed successfully",
    stockCode,
    response
  };
}

function getAllTicks() {
  return {
    success: true,
    count: Object.keys(latestTicks).length,
    data: Object.values(latestTicks)
  };
}

function getTickByStock(stockCode) {
  return {
    success: !!latestTicks[stockCode],
    data: latestTicks[stockCode] || null
  };
}

module.exports = {
  initBreeze,
  subscribeStock,
  getAllTicks,
  getTickByStock
};