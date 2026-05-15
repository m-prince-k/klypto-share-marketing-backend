function calculateVolumeIndicator(candles, options) {

    const maLength = options?.maLength || 20;

    // === Helper: SMA ===
    function sma(values, length) {
        return values.map((_, i) => {
            if (i < length - 1) return null;
            const slice = values.slice(i - length + 1, i + 1);
            return slice.reduce((a, b) => a + b, 0) / length;
        });
    }

    const volumes = candles.map(c => Number(c.volume || 0));
    const volumeMA = sma(volumes, maLength);

    const result = [];

    for (let i = 0; i < candles.length; i++) {

        const currentVolume = Number(candles[i].volume || 0);

        // Color logic (like TradingView)
        let color = null;
        if (i > 0) {
            color = candles[i].close >= candles[i - 1].close
                ? "#26A69A"  // green
                : "#EF5350"; // red
        }

        // Rising / Falling volume
        const rising = i > 0 ? currentVolume > candles[i - 1].volume : false;
        const falling = i > 0 ? currentVolume < candles[i - 1].volume : false;

        // Crossovers with MA
        let crossAboveMA = false;
        let crossBelowMA = false;

        if (i > 0 && volumeMA[i] !== null && volumeMA[i - 1] !== null) {
            if (
                candles[i - 1].volume <= volumeMA[i - 1] &&
                currentVolume > volumeMA[i]
            ) {
                crossAboveMA = true;
            }

            if (
                candles[i - 1].volume >= volumeMA[i - 1] &&
                currentVolume < volumeMA[i]
            ) {
                crossBelowMA = true;
            }
        }

        result.push({
            time: candles[i].time, // ✅ added time here
            volume: currentVolume,
            volumeMA: volumeMA[i],
            color,
            rising,
            falling,
            crossAboveMA,
            crossBelowMA
        });
    }

    return result;
}

module.exports = { calculateVolumeIndicator };