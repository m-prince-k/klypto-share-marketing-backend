async function bollingerPercentBSeries(data, options) {
  const period=options.period || 20;
  const multiplier=options.multiplier || 2;

  const result = [];

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push({
        time: data[i].time,
        percentB: null // not enough data
      });
      continue;
    }

    // Get last N candles
    const slice = data.slice(i - period + 1, i + 1);

    const closes = slice.map(d => d.close);

    // SMA
    const sma = closes.reduce((sum, p) => sum + p, 0) / period;

    // Population variance
    const variance = closes.reduce((sum, p) => {
      return sum + Math.pow(p - sma, 2);
    }, 0) / period;

    const stdDev = Math.sqrt(variance);

    const upper = sma + multiplier * stdDev;
    const lower = sma - multiplier * stdDev;

    const close = data[i].close;

    const percentB = (close - lower) / (upper - lower);

    result.push({
      time: data[i].time,
      percentB: percentB
    });
  }

  return result;
}
module.exports = { bollingerPercentBSeries };