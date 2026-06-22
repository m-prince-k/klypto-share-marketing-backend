async function trueRangeSeries(data) {
  const result = [];

  for (let i = 0; i < data.length; i++) {
    const { high, low, close, time } = data[i];

    let tr;

    if (i === 0) {
      // First candle
      tr = high - low;
    } else {
      const prevClose = data[i - 1].close;

      const range1 = high - low;
      const range2 = Math.abs(high - prevClose);
      const range3 = Math.abs(low - prevClose);

      tr = Math.max(range1, range2, range3);
    }

    result.push({
      time,
      trueRange: tr
    });
  }

  return result;
}
module.exports = { trueRangeSeries };