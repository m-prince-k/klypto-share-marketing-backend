/**
 * Volume Profile (TradingView Style - Node.js)
 */

async function calculateVolumeProfile(allCandles, options) {
  try {
  // 🔹 Apply Lookback (Fixed Range = 200)
  const lookback = options.lookback || 200;
  const candles = allCandles.slice(-lookback);

  const rows = options.rows || 200;         // Number of Volume Bars
  const valueArea = options.valueArea || 0.7;
  const source = options.source || "hlc3";

  if (!candles || candles.length === 0) {
    return {message:"candle not found"}
  }

  // 🔹 Price source selector
  const getPrice = (c) => {
    if (source === "close") return c.close;
    if (source === "hl2") return (c.high + c.low) / 2;
    return (c.high + c.low + c.close) / 3; // hlc3
  };

  // 🔹 Min/Max
  let minPrice = Infinity;
  let maxPrice = -Infinity;

  candles?.forEach(c => {
    minPrice = Math.min(minPrice, c.low);
    maxPrice = Math.max(maxPrice, c.high);
  });

  const priceRange = maxPrice - minPrice;
  const step = priceRange / rows;

  // 🔹 Create bins
  let bins = Array(rows).fill(0);

  candles?.forEach(c => {
    const price = getPrice(c);
    const vol = c.volume || 1;

    let index = Math.floor((price - minPrice) / step);
    index = Math.max(0, Math.min(rows - 1, index));

    bins[index] += vol;
  });

  // 🔹 POC
  let maxVol = Math.max(...bins);
  let pocIndex = bins.indexOf(maxVol);

  // 🔹 Value Area (70%)
  let totalVol = bins.reduce((a, b) => a + b, 0);
  let targetVol = totalVol * valueArea;

  let cumVol = bins[pocIndex];
  let left = pocIndex;
  let right = pocIndex;

  while (cumVol < targetVol) {
    let leftVol = bins[left - 1] || 0;
    let rightVol = bins[right + 1] || 0;

    if (leftVol > rightVol) {
      left--;
      cumVol += leftVol;
    } else {
      right++;
      cumVol += rightVol;
    }

    if (left <= 0 && right >= rows - 1) break;
  }

  const VAH = minPrice + step * (right + 1);
  const VAL = minPrice + step * left;
  const POC = minPrice + step * (pocIndex + 0.5);

  // 🔹 Histogram output
  const profile = bins.map((vol, i) => ({
    price: minPrice + step * (i + 0.5),
    volume: vol
  }));

  return {
    volumeprofile:profile,
    volumePoc:POC,
    volumevah:VAH,
    volumeval:VAL,
    volumeminPrice:minPrice,
    volumeMaxPrice:maxPrice
  };    
  } catch (error) {
    console.log("error is here-------------------------->>>>>>",error)
  }

}

module.exports = { calculateVolumeProfile };