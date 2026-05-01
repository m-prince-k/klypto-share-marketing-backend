async function rmaSeries(data, options) {
    const period=options?.period || 14;
    const valueKey=options?.valueKey || "close";
    
  const result = [];

  const values = data.map(d => Number(d[valueKey]));

  let rma = 0;

  for (let i = 0; i < values.length; i++) {
    const val = values[i];

    if (i < period) {
      result.push(null);
      continue;
    }

    // First RMA = SMA
    if (i === period) {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += values[j];
      }
      rma = sum / period;
      result.push(rma);
      continue;
    }

    // Wilder smoothing
    rma = (rma * (period - 1) + val) / period;

    result.push(rma);
  }

  return data.map((d, i) => ({
    time: d.time,
    rma: result[i]
  }));
}

module.exports = { rmaSeries };