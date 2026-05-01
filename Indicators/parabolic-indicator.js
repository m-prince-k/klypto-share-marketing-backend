async function calculateParabolicSAR(data, options) {

const start = options?.start || 0.02
const increment = options?.increment || 0.02
const max = options?.max || 0.2

  const length = data.length;
  const result = [];

  let isUptrend = true;
  let af = start;
  let ep = data[0].low; // extreme point
  let sar = data[0].low;

  result.push({
    time: data[0].time,
    sar: sar,
  });

  for (let i = 1; i < length; i++) {
    sar = sar + af * (ep - sar);

    if (isUptrend) {
      if (data[i].low < sar) {
        // trend reversal
        isUptrend = false;
        sar = ep;
        ep = data[i].low;
        af = start;
      } else {
        if (data[i].high > ep) {
          ep = data[i].high;
          af = Math.min(af + increment, max);
        }
      }
    } else {
      if (data[i].high > sar) {
        // trend reversal
        isUptrend = true;
        sar = ep;
        ep = data[i].high;
        af = start;
      } else {
        if (data[i].low < ep) {
          ep = data[i].low;
          af = Math.min(af + increment, max);
        }
      }
    }

    await result.push({
      time: data[i].time,
      datetime:new Date(data[i].time * 1000).toISOString(),
      sar: sar,
    });
  }

  return result;
}
module.exports = { calculateParabolicSAR };