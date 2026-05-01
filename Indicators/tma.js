function sma(values, period) {
  const result = [];

  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      result.push(null);
      continue;
    }

    let sum = 0;

    for (let j = i - period + 1; j <= i; j++) {
      if (values[j] == null) {
        sum = null;
        break;
      }
      sum += values[j];
    }

    result.push(sum === null ? null : sum / period);
  }

  return result;
}
 
async function tmaSeries(data, options) {
    const period = Number(options?.period || options?.length || 20);
    const sourceKey = options?.source || options?.valueKey || "close";
    
  if (!data || data.length < 2 * period - 1) {
    console.log("Not enough data for TMA");
    return data.map(d => ({ time: d.time, tma: null }));
  }

  const values = data.map(d => Number(d[sourceKey]));

  const sma1 = sma(values, period);
  const sma2 = sma(sma1, period);

  return data.map((d, i) => ({
    time: d.time,
    tma: sma2[i] ?? null
  }));
}

module.exports = { tmaSeries };