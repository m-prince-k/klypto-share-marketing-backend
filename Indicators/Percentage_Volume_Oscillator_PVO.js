// ----------------------- Percentage Volume Oscillator (PVO) -----------------------------

function calculatePVO(
  candles,
    options
) {

    const fastLen = options?.fastLen || 12;
    const slowLen = options?.slowLen || 26;
    const sigLen = options?.sigLen || 9;
    const oscType = options?.oscType || "EMA";
    const sigType = options?.sigType || "EMA" ;


  const n = candles.length;

  if (candles.reduce((acc, c) => acc + (c.volume || 0), 0) === 0) {
    throw new Error("No volume is provided by the data vendor.");
  }

  // ---- SMA ----
  const sma = (data, length, idx) => {
    if (idx < length - 1) return null;
    let sum = 0;
    for (let i = idx - length + 1; i <= idx; i++) sum += data[i];
    return sum / length;
  };

  // ---- EMA ----
  const ema = (data, length) => {
    const alpha = 2 / (length + 1);
    const result = [];

    for (let i = 0; i < data.length; i++) {
      if (i === 0 || result[i - 1] === null) {
        result.push(data[i]);
      } else {
        result.push(alpha * data[i] + (1 - alpha) * result[i - 1]);
      }
    }

    return result;
  };

  const volumes = candles.map(c => c.volume);

  // ---- Fast & Slow MA ----
  let maFast, maSlow;

  if (oscType === "EMA") {
    maFast = ema(volumes, fastLen);
    maSlow = ema(volumes, slowLen);
  } else {
    maFast = volumes.map((v, i) => sma(volumes, fastLen, i));
    maSlow = volumes.map((v, i) => sma(volumes, slowLen, i));
  }

  // ---- PVO ----
  const pvo = maFast.map((v, i) =>
    v !== null && maSlow[i] !== null
      ? (100 * (v - maSlow[i])) / maSlow[i]
      : null
  );

  // ---- Signal ----
  let signal;

  if (sigType === "EMA") {
    signal = ema(
      pvo.map(v => (v === null ? 0 : v)),
      sigLen
    );

    for (let i = 0; i < pvo.length; i++) {
      if (pvo[i] === null) signal[i] = null;
    }
  } else {
    signal = pvo.map((v, i) => sma(pvo, sigLen, i));
  }

  // ---- Histogram ----
  const hist = pvo.map((v, i) =>
    v !== null && signal[i] !== null ? v - signal[i] : null
  );

  // ---- Final Result ----
  return candles.map((c, i) => ({
    time: c.time,
    value: pvo[i],   // chart friendly
    pvo: pvo[i],
    signal: signal[i],
    hist: hist[i]
  }));
}

module.exports = { calculatePVO };