async function vwmaSeries(data, optionsOrPeriod, legacyPriceKey, legacyVolumeKey) {

  const options = typeof optionsOrPeriod === "object" && optionsOrPeriod !== null
    ? optionsOrPeriod
    : {
        period: optionsOrPeriod,
        priceKey: legacyPriceKey,
        volumeKey: legacyVolumeKey
      };

  const period = options?.period || options?.length || 20;
  const priceKey = options?.priceKey || options?.source || options?.inputIndicator || "close";
  const volumeKey = options?.volumeKey || "volume";

  const result = [];

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push({ time: data[i].time, vwma: null });
      continue;
    }

    function getSourceValue(c, s) {
      const h = Number(c.high);
      const l = Number(c.low);
      const cl = Number(c.close);
      const o = Number(c.open);
      
      switch (s) {
          case "hl2": return (h + l) / 2;
          case "hlc3": return (h + l + cl) / 3;
          case "ohlc4": return (o + h + l + cl) / 4;
          case "open": return o;
          case "high": return h;
          case "low": return l;
          default: return Number(c[s]) || cl;
      }
    }

    let sumPV = 0;
    let sumV = 0;

    for (let j = i - period + 1; j <= i; j++) {
      const price = getSourceValue(data[j], priceKey);
      const volume = Number(data[j][volumeKey]);

      sumPV += price * volume;
      sumV += volume;
    }

    const vwma = sumV === 0 ? null : sumPV / sumV;

    result.push({
      time: data[i].time,
      vwma
    });
  }

  return result;
}

module.exports = { vwmaSeries };