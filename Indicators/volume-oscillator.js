function ema(values, period) {
  const k = 2 / (period + 1);
  const result = [];

  let emaPrev = null;

  for (let i = 0; i < values.length; i++) {
    const val = Number(values[i]);

    if (i < period - 1) {
      result.push(null);
      continue;
    }

    if (emaPrev === null) {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) {
        sum += Number(values[j]);
      }
      emaPrev = sum / period;
    } else {
      emaPrev = val * k + emaPrev * (1 - k);
    }

    result.push(emaPrev);
  }

  return result;
}

async function volumeOscillator(data, shortPeriod = 14, longPeriod = 28) {
  const volumes = await Promise.all(data.map(d => Promise.resolve(Number(d.volume)) || 0));

  const shortEma = ema(volumes, shortPeriod);
  const longEma = ema(volumes, longPeriod);

  const result = [];

  for (let i = 0; i < data.length; i++) {
    const se = shortEma[i];
    const le = longEma[i];

    if (se === null || le === null) {
      result.push({ time: data[i].time, vo: null });
      continue;
    }

    const vo = ((se - le) / le) * 100;

    result.push({
      time: data[i].time,
      vo
    });
  }

  return result;
}

module.exports = { volumeOscillator };