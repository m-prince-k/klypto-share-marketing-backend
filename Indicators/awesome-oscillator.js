async function calculateAwesomeOscillator(candles) {

    function sma(values, length) {
        return values.map((_, i) => {
            if (i < length - 1) return null;
            const sum = values.slice(i - length + 1, i + 1)
                .reduce((a, b) => a + b, 0);
            return sum / length;
        });
    }

    const hl2 = candles.map(c => (c.high + c.low) / 2);

    const sma5 = sma(hl2, 5);
    const sma34 = sma(hl2, 34);

    const result = [];

    for (let i = 0; i < candles.length; i++) {

        let ao = null;
        if (sma5[i] !== null && sma34[i] !== null) {
            ao = sma5[i] - sma34[i];
        }

        let prevAo = i > 0 ? result[i - 1].ao : null;

        let diff = (ao !== null && prevAo !== null)
            ? ao - prevAo
            : null;

        let color = null;
        if (diff !== null) {
            color = diff <= 0 ? "#F44336" : "#009688";
        }

        let changeToGreen = false;
        let changeToRed = false;

        if (i > 0 && diff !== null && result[i - 1].diff !== null) {

            if (result[i - 1].diff <= 0 && diff > 0) {
                changeToGreen = true;
            }

            if (result[i - 1].diff >= 0 && diff < 0) {
                changeToRed = true;
            }
        }

        // ✅ Merge candle + indicator
        result.push({
              time: candles[i].time, 
            ao,
            diff,
            color,
            changeToGreen,
            changeToRed
        });
    }

    return result;
}

module.exports = { calculateAwesomeOscillator };