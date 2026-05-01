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

    let sumPV = 0;
    let sumV = 0;

    for (let j = i - period + 1; j <= i; j++) {
      const price = Number(data[j][priceKey]);
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