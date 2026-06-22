// ======================================
// SMA
// ======================================

function rollingMean(arr, period) {
    const result = Array(arr.length).fill(null);

    for (let i = period - 1; i < arr.length; i++) {
        let sum = 0;

        for (let j = i - period + 1; j <= i; j++) {
            sum += arr[j];
        }

        result[i] = sum / period;
    }

    return result;
}

function computeSMA(close) {
    return {
        SMA_20: rollingMean(close, 20),
        SMA_50: rollingMean(close, 50),
        SMA_100: rollingMean(close, 100),
        SMA_200: rollingMean(close, 200),
    };
}

// ======================================
// RSI
// ======================================

function computeRSI(close, period = 14) {
    const gain = Array(close.length).fill(0);
    const loss = Array(close.length).fill(0);

    for (let i = 1; i < close.length; i++) {
        const diff = close[i] - close[i - 1];

        gain[i] = diff > 0 ? diff : 0;
        loss[i] = diff < 0 ? -diff : 0;
    }

    const rmaGain = Array(close.length).fill(null);
    const rmaLoss = Array(close.length).fill(null);

    let avgGain = 0;
    let avgLoss = 0;

    for (let i = 1; i <= period; i++) {
        avgGain += gain[i];
        avgLoss += loss[i];
    }

    avgGain /= period;
    avgLoss /= period;

    rmaGain[period] = avgGain;
    rmaLoss[period] = avgLoss;

    for (let i = period + 1; i < close.length; i++) {
        rmaGain[i] =
            ((rmaGain[i - 1] * (period - 1)) + gain[i]) /
            period;

        rmaLoss[i] =
            ((rmaLoss[i - 1] * (period - 1)) + loss[i]) /
            period;
    }

    const RSI = Array(close.length).fill(null);

    for (let i = period; i < close.length; i++) {
        if (rmaLoss[i] === 0) {
            RSI[i] = 100;
            continue;
        }

        const rs = rmaGain[i] / rmaLoss[i];

        RSI[i] = 100 - (100 / (1 + rs));
    }

    return RSI;
}

// ======================================
// WMA
// ======================================

function WMA(series, period) {
    const result = Array(series.length).fill(null);

    const weights = [];

    for (let i = 1; i <= period; i++) {
        weights.push(i);
    }

    const weightSum = weights.reduce((a, b) => a + b, 0);

    for (let i = period - 1; i < series.length; i++) {
        let sum = 0;

        for (let j = 0; j < period; j++) {
            sum += series[i - period + 1 + j] * weights[j];
        }

        result[i] = sum / weightSum;
    }

    return result;
}

// ======================================
// EMA
// ======================================

function EMA(series, period) {
    const result = Array(series.length).fill(null);

    const alpha = 2 / (period + 1);

    result[0] = series[0];

    for (let i = 1; i < series.length; i++) {
        result[i] =
            alpha * series[i] +
            (1 - alpha) * result[i - 1];
    }

    return result;
}

// ======================================
// SMA MA
// ======================================

function SMA(series, period) {
    return rollingMean(series, period);
}

// ======================================
// HMA
// ======================================

function HMA(series, period) {
    const half = Math.floor(period / 2);
    const sqrtLen = Math.floor(Math.sqrt(period));

    const wma1 = WMA(series, half);
    const wma2 = WMA(series, period);

    const diff = series.map((_, i) => {
        if (wma1[i] == null || wma2[i] == null)
            return null;

        return 2 * wma1[i] - wma2[i];
    });

    return WMA(diff, sqrtLen);
}

// ======================================
// COMPUTE MA
// ======================================

function computeMA(series, type, length) {
    switch (type) {
        case "SMA":
            return SMA(series, length);

        case "EMA":
            return EMA(series, length);

        case "WMA":
            return WMA(series, length);

        case "HMA":
            return HMA(series, length);

        default:
            throw new Error(`Unsupported MA ${type}`);
    }
}

// ======================================
// ATR
// ======================================

function computeATR(high, low, close, period = 14) {
    const tr = [];

    for (let i = 0; i < close.length; i++) {
        if (i === 0) {
            tr.push(high[i] - low[i]);
            continue;
        }

        tr.push(
            Math.max(
                high[i] - low[i],
                Math.abs(high[i] - close[i - 1]),
                Math.abs(low[i] - close[i - 1])
            )
        );
    }

    const atr = Array(close.length).fill(null);

    atr[0] = tr[0];

    for (let i = 1; i < tr.length; i++) {
        atr[i] =
            atr[i - 1] +
            (tr[i] - atr[i - 1]) / period;
    }

    return atr;
}

// ======================================
// HLV
// ======================================

function computeHLV(close, highMA, lowMA) {
    const hlv = Array(close.length).fill(1);

    for (let i = 1; i < close.length; i++) {
        if (close[i] > highMA[i]) {
            hlv[i] = 1;
        } else if (close[i] < lowMA[i]) {
            hlv[i] = -1;
        } else {
            hlv[i] = hlv[i - 1];
        }
    }

    return hlv;
}

// ======================================
// SSL HYBRID
// ======================================

function computeSSLHybrid(
    high,
    low,
    close,
    baselineType = "HMA",
    baselineLen = 60,
    ssl2Type = "HMA",
    ssl2Len = 5,
    exitType = "HMA",
    exitLen = 15
) {
    const baseline = computeMA(
        close,
        baselineType,
        baselineLen
    );

    const emaHigh = computeMA(
        high,
        baselineType,
        baselineLen
    );

    const emaLow = computeMA(
        low,
        baselineType,
        baselineLen
    );

    const hlv = computeHLV(
        close,
        emaHigh,
        emaLow
    );

    const sslLine = hlv.map((v, i) =>
        v < 0 ? emaHigh[i] : emaLow[i]
    );

    const sslTrend = hlv.map((v) =>
        v === 1 ? "UP" : "DOWN"
    );

    const maHigh2 = computeMA(
        high,
        ssl2Type,
        ssl2Len
    );

    const maLow2 = computeMA(
        low,
        ssl2Type,
        ssl2Len
    );

    const hlv2 = computeHLV(
        close,
        maHigh2,
        maLow2
    );

    const ssl2Line = hlv2.map((v, i) =>
        v < 0 ? maHigh2[i] : maLow2[i]
    );

    const exitHigh = computeMA(
        high,
        exitType,
        exitLen
    );

    const exitLow = computeMA(
        low,
        exitType,
        exitLen
    );

    const hlv3 = computeHLV(
        close,
        exitHigh,
        exitLow
    );

    const sslExit = hlv3.map((v, i) =>
        v < 0 ? exitHigh[i] : exitLow[i]
    );

    const ATR = computeATR(
        high,
        low,
        close
    );

    return {
        baseline,
        sslLine,
        sslTrend,
        ssl2Line,
        sslExit,
        ATR,
    };
}

// ======================================
// BUILD  — exported as a module
// ======================================

/**
 * Run the strategy on an array of candle objects.
 * Each candle: { datetime, open, high, low, close, volume }
 *
 * Returns: { markers, sma, rsi, ssl, candles }
 */
function runStrategy(candles) {
  const open   = candles.map(c => c.open);
  const high   = candles.map(c => c.high);
  const low    = candles.map(c => c.low);
  const close  = candles.map(c => c.close);
  const volume = candles.map(c => c.volume);

  const sma = computeSMA(close);

  const RSI = computeRSI(close);

  const ssl = computeSSLHybrid(
    high,
    low,
    close
  );

  // ======================================
  // BUY / SELL
  // ======================================

  const markers = [];

  for (let i = 201; i < close.length; i++) {
    const prevClose = close[i - 1];
    const currClose = close[i];

    const prevSSL = ssl.sslLine[i - 1];
    const currSSL = ssl.sslLine[i];

    if (
      prevSSL == null ||
      currSSL == null
    ) {
      continue;
    }

    if (
      prevClose <= prevSSL &&
      currClose > currSSL
    ) {
      markers.push({
        index: i,
        type: "BUY",
      });
    } else if (
      prevClose >= prevSSL &&
      currClose < currSSL
    ) {
      markers.push({
        index: i,
        type: "SELL",
      });
    }
  }

  return { markers, sma, rsi: RSI, ssl, candles };
}

module.exports = { runStrategy };