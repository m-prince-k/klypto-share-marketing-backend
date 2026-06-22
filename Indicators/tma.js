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

  const getSourceValue = (c, key) => {
    const o = Number(c?.open);
    const h = Number(c?.high);
    const l = Number(c?.low);
    const closeVal = Number(c?.close);

    switch (String(key).toLowerCase()) {
        case 'open': return o;
        case 'high': return h;
        case 'low': return l;
        case 'close': return closeVal;
        case 'hl2': return (h + l) / 2;
        case 'hlc3': return (h + l + closeVal) / 3;
        case 'ohlc4': return (o + h + l + closeVal) / 4;
        default: 
            const raw = Number(c?.[key]);
            return Number.isFinite(raw) ? raw : closeVal;
    }
  };

  const values = data.map(d => getSourceValue(d, sourceKey));

  const sma1 = sma(values, period);
  const sma2 = sma(sma1, period);

  return data.map((d, i) => ({
    time: d.time,
    tma: sma2[i] ?? null
  }));
}

module.exports = { tmaSeries };