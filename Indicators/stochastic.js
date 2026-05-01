function sma(values, period) {
  const result = [];

  for (let i = 0; i < values.length; i++) {
    if (i < period - 1 || values[i] == null) {
      result.push(null);
      continue;
    }

    const slice = values.slice(i - period + 1, i + 1).filter(v => v != null);

    if (slice.length < period) {
      result.push(null);
      continue;
    }

    const avg = slice.reduce((sum, v) => sum + v, 0) / period;
    result.push(Number(avg.toFixed(2)));
  }

  return result;
}

async function calculateStochastic(data, options) {
  const kLength = options?.kLength || options?.length || 14;
  const kSmoothing = options?.kSmoothing || 1;
  const dSmoothing = options?.dSmoothing || options?.dsmoothing || 3;


 if (!Array.isArray(data)) return [];

  const rawK = [];

  // 🔹 Step 1: Raw %K
  for (let i = 0; i < data.length; i++) {
    if (i < kLength - 1) {
      rawK.push(null);
      continue;
    }

    const slice = data.slice(i - kLength + 1, i + 1);

    const highs = slice.map(c => c.high);
    const lows = slice.map(c => c.low);

    const highestHigh = Math.max(...highs);
    const lowestLow = Math.min(...lows);

    const close = data[i].close;

    if (highestHigh === lowestLow) {
      rawK.push(0);
    } else {
      const value = ((close - lowestLow) / (highestHigh - lowestLow)) * 100;
      rawK.push(Number(value.toFixed(2)));
    }
  }

  // Fast stochastic lines
  const fastK = rawK;
  const fastD = sma(fastK, dSmoothing);

  // Slow stochastic lines (TradingView default Stochastic style)
  const slowK = sma(rawK, kSmoothing);
  const slowD = sma(slowK, dSmoothing);

  // 🔹 Merge Candle + Indicator
  const result = data?.map((candle, i) => ({
    time: candle.time ?? i, // fallback index if no time
    stochastick: slowK[i],
    stochasticd: slowD[i],
    fastStochasticK: fastK[i],
    fastStochasticD: fastD[i],
    slowStochasticK: slowK[i],
    slowStochasticD: slowD[i],
  }));

  return result;
}

module.exports = { calculateStochastic };