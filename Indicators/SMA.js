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
  let result = [];
  let multiplier = 2 / (length + 1);
  data.forEach((v, i) => {
    if (i === 0) result.push(v);
    else result.push((v - result[i - 1]) * multiplier + result[i - 1]);
  });
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
  let result = [];
  data.forEach((v, i) => {
    if (i === 0) result.push(v);
    else if (i < length) result.push((result[i - 1] * i + v) / (i + 1));
    else result.push((result[i - 1] * (length - 1) + v) / length);
  });
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

  const source = await candles.map(c => {
    switch(sourceType) {
      case "volume": return c.volume;
      case "high":   return c.high;
      case "low":    return c.low;
      case "open":   return c.open;
      case "hl2":    return (c.high + c.low) / 2;
      case "hlc3":   return (c.high + c.low + c.close) / 3;
      case "ohlc4":  return (c.open + c.high + c.low + c.close) / 4;
      default:       return c.close;
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
    time: c.time,
    datetime: new Date(c.time * 1000).toISOString(),
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