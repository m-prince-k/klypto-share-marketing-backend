async function calculateCamarillaPivots(candles, options = {}) {
  if (!candles || candles.length < 2) {
    throw new Error("Not enough candle data");
  }

  // Previous candle (last completed candle)
  const prev = candles[candles.length - 2];

  const high = Number(prev.high);
  const low = Number(prev.low);
  const close = Number(prev.close);

  const range = high - low;
  const multiplier = 1.1;

  const pivots = {
    R4: close + (range * multiplier) / 2,
    R3: close + (range * multiplier) / 4,
    R2: close + (range * multiplier) / 6,
    R1: close + (range * multiplier) / 12,

    S1: close - (range * multiplier) / 12,
    S2: close - (range * multiplier) / 6,
    S3: close - (range * multiplier) / 4,
    S4: close - (range * multiplier) / 2,

    base: close
  };

  return await candles?.map(candle => ({
    time:candle.time,
    ...pivots
  }));
}
module.exports={calculateCamarillaPivots}