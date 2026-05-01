// VWAP calculation - React-friendly version
async function calculateVWAP(candles, options = {}) {
  const normalizeAnchor = (raw) => {
    const key = String(raw || "Session").trim().toLowerCase();
    if (["d", "1d", "day", "daily"].includes(key)) return "Daily";
    if (["w", "1w", "week", "weekly"].includes(key)) return "Weekly";
    if (["m", "1m", "month", "monthly"].includes(key)) return "Monthly";
    if (["q", "quarter", "quarterly"].includes(key)) return "Quarterly";
    if (["y", "1y", "year", "yearly", "annual"].includes(key)) return "Yearly";
    if (["session", "s"].includes(key)) return "Session";
    if (["global", "all"].includes(key)) return "Global";
    return "Session";
  };

  const normalizeBandMultiplier = (band, fallback) => {
    if (typeof band === "number") return band;
    if (band && typeof band === "object" && typeof band.multiplier === "number") return band.multiplier;
    return fallback;
  };

  const anchor = normalizeAnchor(options?.anchorPeriod); // Daily | Weekly | Monthly | Quarterly | Yearly | Session | Global
  const bandMode = String(options?.bandMode || "STD").trim().toUpperCase(); // STD | PERCENTAGE

  const band1 = normalizeBandMultiplier(options?.band1, 1);
  const band2 = normalizeBandMultiplier(options?.band2, 2);
  const band3 = normalizeBandMultiplier(options?.band3, 3);

  const source = (options?.source || "hlc3").toLowerCase();
  const offset = options?.offset || 0;
  const hideOnDailyOrAbove = options?.hideOnDailyOrAbove === true || options?.hideOnDailyOrAbove === "true";

  const timeframe = String(options?.timeframe || "1m").toLowerCase();

  let cumulativePV = 0;
  let cumulativeVolume = 0;
  let cumulativeP2V = 0;
  let currentAnchorKey = null;

  // Map each candle to a new object to force React to detect changes
  if (!Array.isArray(candles)) return [];
  const result = candles.map((candle) => {
    const { open, high, low, close, volume, time } = candle;
    if (volume == null) return { time, value: null, vwap: null, bands: null };

    // Source price
    const price =
      source === "close" ? close :
      source === "open" ? open :
      source === "hl2" ? (high + low) / 2 :
      source === "ohlc4" ? (open + high + low + close) / 4 :
      (high + low + close) / 3;

    // Hide for daily+ timeframes
    if (hideOnDailyOrAbove && (timeframe.includes("d") || timeframe.includes("w") || timeframe.includes("m"))) {
      return { time, value: null, vwap: null, bands: null };
    }

    // Anchor key calculation
    // Use UTC calendar boundaries so anchor resets stay aligned with exchange candles.
    const date = new Date(time * 1000);
    let anchorKey;

    switch (anchor) {
      case "Daily":
        anchorKey = `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}`;
        break;
      case "Weekly":
        anchorKey = `${date.getUTCFullYear()}-W${getISOWeekUTC(date)}`;
        break;
      case "Monthly":
        anchorKey = `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}`;
        break;
      case "Quarterly":
        const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
        anchorKey = `${date.getUTCFullYear()}-Q${quarter}`;
        break;
      case "Yearly":
        anchorKey = `${date.getUTCFullYear()}`;
        break;
      case "Session":
        anchorKey = `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}`; // 24/7 markets: session ~= UTC day
        break;
      default:
        anchorKey = "global";
    }

    // Reset VWAP if anchor changes
    if (anchorKey !== currentAnchorKey) {
      cumulativePV = 0;
      cumulativeVolume = 0;
      cumulativeP2V = 0;
      currentAnchorKey = anchorKey;
    }

    // VWAP Calculation
    cumulativePV += price * volume;
    cumulativeVolume += volume;
    cumulativeP2V += price * price * volume;

    const vwap = cumulativePV / cumulativeVolume;

    // Standard deviation
    let variance = cumulativeP2V / cumulativeVolume - vwap * vwap;
    if (variance < 0) variance = 0;
    const stdev = Math.sqrt(variance);

    const bandBasis = bandMode === "STD" ? stdev : vwap * 0.01;

    const bands = {
      band1: { upper: vwap + bandBasis * band1, lower: vwap - bandBasis * band1 },
      band2: { upper: vwap + bandBasis * band2, lower: vwap - bandBasis * band2 },
      band3: { upper: vwap + bandBasis * band3, lower: vwap - bandBasis * band3 },
    };

    return { time,
       value: vwap, 
       vwap, bands };
  });

  // Return a new array reference to trigger React re-render
  return [...result];
}

// ISO Week calculation
function getISOWeek(date) {
  const tmpDate = new Date(date.getTime());
  tmpDate.setUTCHours(0,0,0,0);
  tmpDate.setUTCDate(tmpDate.getUTCDate() + 4 - (tmpDate.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(tmpDate.getUTCFullYear(), 0, 1));
  return Math.ceil((((tmpDate - yearStart)/86400000) + 1)/7);
}

function getISOWeekUTC(date) {
  return getISOWeek(date);
}

module.exports = { calculateVWAP };