// ==============================
// Moving Average Utilities
// ==============================

function sma(data, length) {
  let result = [];
  for (let i = 0; i < data.length; i++) {
    if (i + 1 < length) { result.push(null); continue; }
    let sum = 0;
    for (let j = i - length + 1; j <= i; j++) sum += data[j];
    result.push(sum / length);
  }
  return result;
}

function ema(data, length) {
  let result = new Array(data.length).fill(null);
  if (data.length < length) return result;

  const k = 2 / (length + 1);
  let sum = 0;
  for (let i = 0; i < length; i++) sum += data[i];
  let prevEMA = sum / length;
  result[length - 1] = prevEMA;

  for (let i = length; i < data.length; i++) {
    prevEMA = (data[i] * k) + (prevEMA * (1 - k));
    result[i] = prevEMA;
  }
  return result;
}

function wma(data, length) {
  let result = [];
  let weightSum = (length * (length + 1)) / 2;
  for (let i = 0; i < data.length; i++) {
    if (i + 1 < length) { result.push(null); continue; }
    let sum = 0;
    for (let j = 0; j < length; j++) sum += data[i - j] * (length - j);
    result.push(sum / weightSum);
  }
  return result;
}

function smma(data, length) {
  let result = new Array(data.length).fill(null);
  if (data.length < length) return result;

  let sum = 0;
  for (let i = 0; i < length; i++) sum += data[i];
  let prevSMMA = sum / length;
  result[length - 1] = prevSMMA;

  for (let i = length; i < data.length; i++) {
    prevSMMA = (prevSMMA * (length - 1) + data[i]) / length;
    result[i] = prevSMMA;
  }
  return result;
}

function vwma(price, volume, length) {
  let result = [];
  for (let i = 0; i < price.length; i++) {
    if (i + 1 < length) { result.push(null); continue; }
    let sumPV = 0, sumV = 0;
    for (let j = i - length + 1; j <= i; j++) {
      sumPV += price[j] * volume[j];
      sumV += volume[j];
    }
    result.push(sumPV / sumV);
  }
  return result;
}

function stdev(data, length) {
  let result = [];
  for (let i = 0; i < data.length; i++) {
    if (i + 1 < length) { result.push(null); continue; }
    let slice = data.slice(i - length + 1, i + 1);
    let mean = slice.reduce((a, b) => a + b, 0) / length;
    let variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / length;
    result.push(Math.sqrt(variance));
  }
  return result;
}

// ==============================
// ORIGINAL METHOD (UNCHANGED)
// ==============================

async function calculateSMA(candles, options) {

  const length = options?.length || 9;
  const offset = options?.offset || 0;
  const maType = options?.maType || "None";
  const maLength = options?.maLength || 14;
  const bbMult = options?.bbStdDev || 2;
  const sourceType = options?.source || "close";

  if (!Array.isArray(candles)) return [];

  const source = candles.map(c => {
    switch (sourceType) {
      case "volume": return Number(c.volume);
      case "high": return Number(c.high);
      case "low": return Number(c.low);
      case "open": return Number(c.open);
      case "hl2": return (Number(c.high) + Number(c.low)) / 2;
      case "hlc3": return (Number(c.high) + Number(c.low) + Number(c.close)) / 3;
      case "ohlc4": return (Number(c.open) + Number(c.high) + Number(c.low) + Number(c.close)) / 4;
      default: return Number(c.close);
    }
  });

  const volume = candles.map(c => c.volume);

  const baseSMAArr = sma(source, length).map((v, i) =>
    (i + offset < 0 || i + offset >= source.length) ? null : v
  );

  let smoothArr = null;
  const enableMA = maType !== "None";
  const isBB = maType === "SMA + Bollinger Bands";

  if (enableMA) {
    switch (maType) {
      case "SMA":
      case "SMA + Bollinger Bands":
        smoothArr = sma(source, maLength);
        break;
      case "EMA":
        smoothArr = ema(source, maLength);
        break;
      case "SMMA (RMA)":
        smoothArr = smma(source, maLength);
        break;
      case "WMA":
        smoothArr = wma(source, maLength);
        break;
      case "VWMA":
        smoothArr = vwma(source, volume, maLength);
        break;
    }
  }

  let stDevArr = isBB
    ? stdev(smoothArr, maLength).map(v => v * bbMult)
    : null;

  const result = candles.map((c, i) => ({
    time: c.timestamp || c.time,
    sma: baseSMAArr[i],
    smoothingMA: smoothArr ? smoothArr[i] : null,
    bbUpper: isBB
      ? (smoothArr[i] !== null && stDevArr[i] !== null
        ? smoothArr[i] + stDevArr[i]
        : null)
      : null,
    bbLower: isBB
      ? (smoothArr[i] !== null && stDevArr[i] !== null
        ? smoothArr[i] - stDevArr[i]
        : null)
      : null
  }));

  return result;
}

// ==============================
// WRAPPER (FORMAT FIX)
// ==============================



// ==============================
// EXPORT
// ==============================

module.exports = {
  calculateSMA,
};