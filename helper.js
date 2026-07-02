require('dotenv').config();
const axios = require("axios");
const { calculateRSIForSymbols, calculateRSIIndicator } = require("./Indicators/rsi-indicator.js");
const { calculateSMA, applySMAtoCandleData } = require("./Indicators/SMA.js");
const { calculateMARibbon } = require("./Indicators/ma-ribbon.js");

const { vwmaSeries } = require("./Indicators/vwma.js");

const { calculateEMAIndicator } = require("./Indicators/EMA.js");


const { calculateCCI } = require("./Indicators/CCI-Indicator.js");
const { calculateAroonFromCandles } = require("./Indicators/Aroon-indicator.js");
const { calculatedROC } = require("./Indicators/Roc-Indicator.js");
const { calculateStochRSI } = require("./Indicators/Stochastic-Rsi-indicator.js");
const { calculateAD } = require("./Indicators/accumulative-discribution.js");
const { calculateADX } = require("./Indicators/adx-indicator.js");
const { calculateAroonOscillator } = require("./Indicators/aroon-oscillator.js");
const { calculateEOM } = require("./Indicators/ease-of-movement.js");
const { calculateKeltnerChannels } = require("./Indicators/kelterner-indicator.js");
const { calculateMACD } = require("./Indicators/MACD-indicator.js");
const { calculateMFI } = require("./Indicators/mfi-indicator.js");
const { calculateMomentum } = require("./Indicators/momentum-indcator.js");
const { calculateNVI } = require("./Indicators/nagative-volume-index.js");
const { calculateOBV } = require("./Indicators/obv.js");
const { calculateParabolicSAR } = require("./Indicators/parabolic-indicator.js");
const { calculatePVI } = require("./Indicators/positivie-volume-index.js");
const { calculateUltimateOscillator } = require("./Indicators/ultimate-oscillator.js");
const { calculateVWAP } = require("./Indicators/vwap-indcator.js");
const { calculateWilliamsR } = require("./Indicators/william-R-indicator.js");
const { calculateZigZag } = require("./Indicators/zig-zag-indicator.js");
const { calculateTRIX } = require("./Indicators/TRIX.js")
const { calculateTEMA } = require("./Indicators/TEMA.js");
const { calculateSupertrend } = require("./Indicators/Supertrend.js");
const { calculateStdev } = require("./Indicators/Standard_Deviation.js");
const { calculateClassicPivots } = require("./Indicators/Classic Pivot Points.js");
const { calculateSSLHybrid } = require("./Indicators/ssl-hybrid.js");
const { body915DNAOscillator } = require("./Indicators/Body915DNAOscillator.js");
const { healthyCandleBoxOscillator } = require("./Indicators/HealthyCandleBoxOscillator.js");
const { hma60BoxDistanceOscillator } = require("./Indicators/HMA60BoxDistanceOscillator.js");
const { superSmootherMAOscillator } = require("./Indicators/SuperSmootherMAOscillator.js");
const { volatilityMomentumAngleChannelPro } = require("./Indicators/VolatilityMomentumAngleChannelPro.js");

const { calculatePVO } = require("./Indicators/Percentage_Volume_Oscillator_PVO.js");
const { calculateKlingerOscillator } = require("./Indicators/Klinger-Oscillator.js");
const { calculateKAMA } = require("./Indicators/KAMA.js");
const { calculateIchimoku } = require("./Indicators/Ichimoku_Cloud.js");
const { calculateHMA } = require("./Indicators/HMA.js");
const { calculateHistoricalVolatility } = require("./Indicators/Historical Volatility_HV.js");
const { calculateFisherTransform } = require("./Indicators/Fisher_Transform.js");

const { calculateDonchianChannels } = require("./Indicators/Donchian_Channels.js");
const { calculateDEMA } = require("./Indicators/DEMA.js");
const { calculateChandeMO } = require("./Indicators/CMO.js");
const { calculateChandeKrollStop } = require("./Indicators/Chande_Kroll_Stop.js");
const { calculateCMF } = require("./Indicators/Chaikin_Money_Flow _CMF.js");
const { calculateBBW } = require("./Indicators/Bollinger_BandWidth.js");
const { calculateBollingerBands } = require("./Indicators/Bollinger_Bands_BB.js");
const { calculateATR } = require("./Indicators/Average_True_Range_ATR.js");
const { trueRangeSeries } = require("./Indicators/truerange.js");
const { rmaSeries } = require("./Indicators/rma.js");
const { tmaSeries } = require("./Indicators/tma.js");

const { calculateWMA } = require("./Indicators/WMA.js");
const { calculateAwesomeOscillator } = require("./Indicators/awesome-oscillator.js");
const { calculateBBPERB } = require("./Indicators/bbperb.js");
const { calculateVolumeOscillator } = require("./Indicators/volume-oscillator.js");

const { calculateVolumeIndicator } = require("./Indicators/volume.js");
const { calculateCHOP } = require("./Indicators/choppiness-index.js");
const { calculateWoodiePivots } = require("./Indicators/Woodie Pivot Points.js");

const { calculateCamarillaPivots } = require("./Indicators/Camarilla Pivot Points.js");

const { calculateFibonacciPivots } = require("./Indicators/Fibonacci Pivot Points.js");
const { calculateFixedRangeVolumeProfile } = require("./Indicators/Fixed_Range_Volume_Profile.js");
const { calculatePivotPoints } = require("./Indicators/pivot-point-standard.js");
const { calculateSessionVolumeProfile } = require("./Indicators/Session_Volume_Profile.js");
const { calculateVisibleRangeVolumeProfile } = require("./Indicators/Visible_Range_Volume_Profile.js");
const { calculateVolumeProfile } = require("./Indicators/volume-profile.js");

const { calculateStochastic } = require("./Indicators/stochastic.js");
const { sign } = require('crypto');




function searchIndicators(data, query) {
  if (!query) return data;

  const q = query.toLowerCase();
  const result = {};

  for (const [category, value] of Object.entries(data)) {
    // CASE 1: value is an ARRAY
    if (Array.isArray(value)) {
      const matched = value.filter(item =>
        String(item).toLowerCase().includes(q)
      );

      if (matched.length) {
        result[category] = matched;
      }
    }

    // CASE 2: value is an OBJECT
    else if (typeof value === "object" && value !== null) {
      const matchedObj = {};

      for (const [key, val] of Object.entries(value)) {
        // Object value is array
        if (Array.isArray(val)) {
          const filtered = val.filter(item =>
            String(item).toLowerCase().includes(q)
          );

          if (filtered.length) {
            matchedObj[key] = filtered;
          }
        }
        // Object value is string / number
        else if (
          String(val).toLowerCase().includes(q) ||
          String(key).toLowerCase().includes(q)
        ) {
          matchedObj[key] = val;
        }
      }

      if (Object.keys(matchedObj).length) {
        result[category] = matchedObj;
      }
    }
  }

  return result;
}


async function getLastCandle({
  symbol = "BTCUSD",
  resolution = "1d", // 1m, 5m, 15m, 1h, 1d
}) {
  try {

    const end = Math.floor(Date.now() / 1000); // now
    const start = end - 30 * 60; // last 1 hour (enough for 5m)


    const response = await axios.get(
      "https://api.india.delta.exchange/v2/history/candles",
      {
        params: {
          symbol,
          resolution,
          start,
          end,
        },
      }
    );

    const candles = await response.data?.result;

    if (!candles || candles.length === 0) {
      return null;
    }

    const last = candles;
    console.log(last, "__________________-----------------------");
    // const last = candles[candles.length - 1];
    return last.filter((value) => value.close > 2000)?.map(d => ({
      time: d.time,
      open: Number(d.open),
      high: Number(d.high),
      low: Number(d.low),
      close: Number(d.close),
    }));
  } catch (error) {
    console.error("Delta API Error:", error.message);
    throw error;
  }
}


function getSource(candles, source = "close") {
  return candles?.map(c => {
    function getSourceValue(c, source) {
      const o = Number(c?.open || c?.o || 0);
      const h = Number(c?.high || c?.h || 0);
      const l = Number(c?.low || c?.l || 0);
      const cl = Number(c?.close || c?.c || 0);

      switch (source) {
        case "hl2": return (h + l) / 2;
        case "hlc3": return (h + l + cl) / 3;
        case "ohlc4": return (o + h + l + cl) / 4;
        case "hlcc4": return (h + l + cl + cl) / 4;
        case "open": return o;
        case "high": return h;
        case "low": return l;
        case "close": return cl;
        default: return Number(c[source] || cl);
      }
    };
    switch (source) {
      case "open": return c.open;
      case "high": return c.high;
      case "low": return c.low;
      case "hl2": return (c.high + c.low) / 2;
      case "hlc3": return (c.high + c.low + c.close) / 3;
      case "ohlc4": return (c.open + c.high + c.low + c.close) / 4;
      default: return c.close;
    }
  });
}

async function smoothing(values, type, length) {
  switch (type) {
    case "SMA": return calculateSMA(values, length);
    case "EMA": return calculateBollingerBands(values, length);
    default: return values;
  }
}


async function indicatorEngine(candles, config) {


  // const closes = await candles.map(c => c[config.sourceKey])

  // return console.log(config.sourceKey,candles.map(c => c['close']));
  try {
    //const src = getSource(candles, config.sourceKey || "close"); // ✅ FIX
    let output;
    const type = (config.type || "").toUpperCase();
    output = await prepareCandlesWithIndicators(type, candles, null, config);

    if (config.smoothing) {
      // console.log(await config.smoothing, "----------------------------89898");

      output = await smoothing(output, config.smoothing.maType, config.smoothing.maLength);
    }

    return output;
  } catch (error) {
    console.error("Error in prepareCandlesWithIndicators:", error);
    return [];
  }
}


async function prepareCandlesWithIndicators(type, candle, res, config = {}) {
  try {
    const results = await (async () => {
      const normalizedType = (type || "").toUpperCase();
      switch (normalizedType) {
        case "SMA":
          return await calculateSMA(candle, { length: config.length || 9, ...config });
        case "MA_RIBBON":
          return await calculateMARibbon(candle, config);
        case "STOCH":
          return await calculateStochastic(candle, { kLength: config.kLength || 14, kSmoothing: config.kSmoothing || 1, dSmoothing: config.dSmoothing || 3, ...config });
        case "EMA":
          return await calculateEMAIndicator(candle, { length: config.length || 9, ...config });

        case "VWMA":
          return await vwmaSeries(candle, { period: 20, priceKey: "close", volumeKey: "volume" });

        case "RSI":
          return await calculateRSIIndicator(candle, { length: config.length || 14, maType: config.maType || "SMA + Bollinger Bands", maLength: config.maLength || 14, bbStdDev: config.bbStdDev || 2, source: config.source || "close" });

        case "MACD":
          return await calculateMACD(candle, { fastLength: config.fastLength || 12, slowLength: config.slowLength || 26, signalLength: config.signalLength || 9, oscillatorMAType: config.oscillatorMAType || "EMA", signalMAType: config.signalMAType || "EMA", source: config.source || "close" });

        case "VWAP":
          return await calculateVWAP(candle, {
            anchorPeriod: config.anchorPeriod || "Session",
            hideOnDailyOrAbove: config.hideOnDailyOrAbove !== undefined ? config.hideOnDailyOrAbove : true,
            calculateMode: config.calculateMode || "CUMULATIVE",
            band1: config.band1 || 1,
            band2: config.band2 || 2,
            band3: config.band3 || 3,
            source: config.source || "hlc3",
            offset: config.offset || 0,
            bandMode: config.bandMode || "STD",
            ...config
          });

        case "ATR":
          return await calculateATR(candle, { length: config.length || 14, smoothing: config.smoothing || "RMA" });

        case "TR":
        case "TRUERANGE":
          return await trueRangeSeries(candle);

        case "RMA":
          return await rmaSeries(candle, { period: 14, valueKey: "close" });

        case "TMA":
          return await tmaSeries(candle, { period: 20, source: "close" });

        case "BB": // Bollinger Bands
          return await calculateBollingerBands(candle, { length: config.length || 20, maType: config.maType || "SMA", stdDev: config.stdDev || 2, source: config.source || "close", offset: config.offset || 0, ...config });

        case "BBW": //correct
          return await calculateBBW(candle, { length: config.length || 20, source: config.source || "close", bbMult: config.bbMult || 2, expansionLength: config.expansionLength || 125, contractionLength: config.contractionLength || 125 });

        case "ADX":
          return await calculateADX(candle, { diLength: config.diLength || 14, smoothing: config.smoothing || 14 });

        case "AROON":
          return await calculateAroonFromCandles(candle, config.length || 14);

        case "CKS":
          return await calculateChandeKrollStop(candle, { atrPeriod: config.atrPeriod || 10, atrMultiplier: config.atrMultiplier || 1, stopLength: config.stopLength || 9 });

        case "ROC":
          return await calculatedROC(candle, { length: config.length || 9, source: config.source || "close" });

        case "ICHIMOKU":
          return await calculateIchimoku(candle, config.conversionLinePeriod || 9, config.baseLinePeriod || 26, config.laggingSpan2Period || 52, config.displacement || 26);
        case "AO":
          return await calculateAroonOscillator(candle, { length: config.length || 14 });
        case "CCI":
          return await calculateCCI(candle, { length: config.length || 20, ...config });
        case "VP":
          return await calculateVolumeProfile(candle, { lookback: config.lookback || 200, rows: config.rows || 20, valueArea: config.valueArea || 0.7, source: config.source || "hlc3", ...config });

        case "MOM":
          return await calculateMomentum(candle, { length: config.length || 10, source: config.source || "close", ...config });

        case "TEMA":
          return await calculateTEMA(candle, { length: 9, ...config });

        case "DEMA":
          return await calculateDEMA(candle, { length: 9, source: "close", ...config });

        case "WMA":
          return await calculateWMA(candle, { length: 9, source: "close", offset: 0, ...config });

        case "HMA":
          return await calculateHMA(candle, { length: 9, source: "close", ...config });

        case "KAMA":
          return await calculateKAMA(candle, { source: "close", erLength: 2, fastLength: 10, slowLength: 30, ...config });

        case "AWO":
          return await calculateAwesomeOscillator(candle, config);

        case "CMO":
          return await calculateChandeMO(candle, { length: 9, source: "close", ...config });

        case "TRIX":
          return await calculateTRIX(candle, { length: 18, source: "close", ...config });

        case "FT":
          return await calculateFisherTransform(candle, config.length || 9);

        case "KVO":
          return await calculateKlingerOscillator(candle, { fastLength: 34, slowLength: 55, signalLength: 13, ...config });

        case "STDDEV":
          return await calculateStdev(candle, { length: 20, source: "close", ...config });

        case "KC":
          return await calculateKeltnerChannels(candle, {
            length: 20,
            source: "close",
            multiplier: 2,
            useExpMA: true,
            bandsStyle: "Average True Range",
            atrLength: 10,
            ...config
          });

        case "DC":
          return await calculateDonchianChannels(candle, { length: 20, offset: 0 });

        case "HV":
          return await calculateHistoricalVolatility(candle, 5, true, 1);

        case "CHOP":
          return await calculateCHOP(candle, 14);

        case "VOL":
          return calculateVolumeIndicator(candle, { maLength: 20, colorByPrevious: "false" });

        case "OBV":
          return calculateOBV(candle, { maType: "SMA", maLength: 14, bbLength: 20, bbMult: 2 });

        case "PVO":
          return calculatePVO(candle, { fastLen: 22, slowLen: 26, sigLen: 9, oscType: "EMA", sigType: "EMA" });

        case "AD":
          return calculateAD(candle);

        case "CMF":
          return calculateCMF(candle, 20);

        case "MFI":
          return await calculateMFI(candle, { length: 14, ...config });

        case "EOM":
          return calculateEOM(candle, { length: 14, divisor: 10000, ...config });

        case "NVI":
          return calculateNVI(candle, 255);

        case "PVI":
          return calculatePVI(candle, 255);

        case "SUPERTREND":
          return calculateSupertrend(candle, { atrPeriod: 10, factor: 3, ...config });

        case "PSAR":
          return calculateParabolicSAR(candle, { start: 0.02, increment: 0.02, maximum: 0.2, ...config });

        case "STOCHRSI":
          return await calculateStochRSI(candle, { lengthRSI: 14, lengthStoch: 14, smoothK: 3, smoothD: 3, source: "close", ...config });

        case "WPR":
          return calculateWilliamsR(candle, { length: 14, source: "close", ...config });

        case "CK":
          return calculateChandeKrollStop(candle, { atrPeriod: 10, atrMultiplier: 1, stopLength: 9 });

        case "UO":
          return calculateUltimateOscillator(candle, { length1: 7, length2: 14, length3: 28, ...config });

        case "ZIGZAG":
          return calculateZigZag(candle, { deviation: 5, depth: 10, ...config });

        case "SSL_HYBRID":
          return calculateSSLHybrid(candle, { ssl1Len: 60, ssl2Len: 5, ssl3Len: 15, baseLen: 60, atrLen: 14, atrMult: 1, ...config });

        case "CAMARILLA":
          return calculateCamarillaPivots(candle, { timeframe: "Daily" });

        case "SVP":
          return await calculateSessionVolumeProfile(candle, { valueArea: config.valueArea || 0.7, source: config.source || "hlc3", ...config });

        case "FRVP":
          return await calculateFixedRangeVolumeProfile(candle, { lookback: config.lookback || 200, valueArea: config.valueArea || 0.7, source: config.source || "hlc3", ...config });

        case "BBPERB":
          return await calculateBBPERB(candle, config);

        case "VO":
          return await calculateVolumeOscillator(candle, config);

        case "BODY915DNA":
          return body915DNAOscillator(candle, config);

        case "VOLATILITY_MOMENTUM_PRO":
          return volatilityMomentumAngleChannelPro(candle, config);

        case "HEALTHY_BOX": {
          const { calculateATR } = require("./Indicators/Average_True_Range_ATR.js");
          const atrDataHCB = await calculateATR(candle, { length: config.atrLength || 14, smoothing: config.smoothing || "RMA" });
          return candle.map((c, i) => {
            const atrValue = atrDataHCB[i] ? atrDataHCB[i].atr : 0;
            const res = healthyCandleBoxOscillator(c, atrValue, config);
            return { ...c, ...res };
          });
        }

        case "HMA60_BOX_DISTANCE": {
          const { calculateATR: calcATR } = require("./Indicators/Average_True_Range_ATR.js");
          const { calculateHMA: calcHMA } = require("./Indicators/HMA.js");
          const atrDataHMA = await calcATR(candle, { length: config.atrLength || 14, smoothing: config.smoothing || "RMA" });
          const hmaData = await calcHMA(candle, { length: config.hmaLength || 60, source: config.source || "close" });
          return candle.map((c, i) => {
            const atrValue = atrDataHMA[i] ? atrDataHMA[i].atr : 0;
            const hmaValue = hmaData[i] ? hmaData[i].hma : 0;
            const res = hma60BoxDistanceOscillator(c, hmaValue, atrValue, config);
            return { ...c, ...res };
          });
        }

        case "SUPERSMOOTHER":
          return superSmootherMAOscillator(candle, config);

        case "ALL":
          {
            const indicators = [
              { type: "RSI", name: "rsi" },
              { type: "SMA", name: "sma" },
              { type: "EMA", name: "ema" },
              { type: "MACD", name: "macd" },
              { type: "VWAP", name: "vwap" },
              { type: "ATR", name: "atr" },
              { type: "BB", name: "bb" },
              { type: "ADX", name: "adx" },
              { type: "SUPERTREND", name: "supertrend" },
              { type: "VWMA", name: "vwma" },
              { type: "AO", name: "ao" },
              { type: "PSAR", name: "psar" },
              { type: "STOCHRSI", name: "stochrsi" },
              { type: "SSL_HYBRID", name: "ssl_hybrid" },
              { type: "MA_RIBBON", name: "ma_ribbon" },
              { type: "BBPERB", name: "bbperb" },
              { type: "VO", name: "vo" },
              { type: "SVP", name: "svp" },
              { type: "FRVP", name: "frvp" },
              { type: "BODY915DNA", name: "body915dna" },
              { type: "HEALTHY_BOX", name: "healthy_box" },
              { type: "HMA60_BOX_DISTANCE", name: "hma60_box_distance" },
              { type: "SUPERSMOOTHER", name: "supersmoother" }
            ];

            const resultsMap = new Map();
            // Initialize map with candles
            candle.forEach(c => resultsMap.set(c.time, { ...c }));

            for (const ind of indicators) {
              try {
                const data = await prepareCandlesWithIndicators(ind.type, candle, res);
                if (Array.isArray(data)) {
                  data.forEach(item => {
                    if (item && item.time) {
                      const existing = resultsMap.get(item.time);
                      if (existing) {
                        // Merge all keys except time
                        Object.keys(item).forEach(key => {
                          if (key !== "time") existing[key] = item[key];
                        });
                      }
                    }
                  });
                }
              } catch (e) {
                console.error(`Error calculating ${ind.type} in ALL:`, e.message);
              }
            }

            let finalResults = Array.from(resultsMap.values()).sort((a, b) => a.time - b.time);

            const warmupPeriod = 50;
            if (finalResults.length > warmupPeriod) {
              finalResults = finalResults.slice(warmupPeriod);
            }

            // Add human-readable datetime to all records
            return finalResults.map(r => {
              let dtMs = typeof r.time === 'number' ? r.time : new Date(r.time).getTime();
              if (dtMs < 100000000000) dtMs *= 1000;
              const dt = new Date(dtMs);
              return {
                ...r,
                time: Math.floor(dtMs / 1000),
                datetime: dt.toLocaleString('en-IN', {
                  timeZone: 'Asia/Kolkata',
                  hour12: false,
                  hour: '2-digit', minute: '2-digit', second: '2-digit',
                  day: '2-digit', month: '2-digit', year: 'numeric'
                })
              };
            });
          }

        default:
          return [];
      }
    })();

    return results;
  } catch (error) {
    console.log(error, "-----------_____________________________________________________")
    return res ? await res.json({ error: error?.message }) : { error: error?.message };
  }
}

// Wrapper to add datetime to any indicator result array
const withDateTime = (data) => {
  if (!Array.isArray(data)) return data;

  // 1. Remove duplicates and ensure time is a number
  const uniqueMap = new Map();
  data.forEach(item => {
    if (item && item.time) {
      const t = Number(item.time);
      if (!isNaN(t)) {
        uniqueMap.set(t, { ...item, time: t });
      }
    }
  });

  // 2. Sort strictly by time (Ascending)
  const sorted = Array.from(uniqueMap.values()).sort((a, b) => a.time - b.time);

  // 3. Add readable datetime
  return sorted.map(r => {
    let dtMs = typeof r.time === 'number' ? r.time : new Date(r.time).getTime();
    if (dtMs < 100000000000) dtMs *= 1000; // If time is in seconds, convert to ms

    const dt = new Date(dtMs);
    return {
      ...r,
      time: Math.floor(dtMs / 1000),
      datetime: dt.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      })
    };
  });
};

const keyMap = {
  "rsi": "rsi",
  "simple moving average": "sma",
  "ema": "ema",
  "adx": "adx",
  "macd": "macd",
  "vwap": "vwap",
  "cci": "cci",
  "obv": "obv",
  "atr": "atr",
  "mfi": "mfi",
  "roc": "roc",
  "momentum": "mom",
  "super trend": "supertrend",
  "dema": "dema",
  "tema": "tema",
  "hma": "hma",
  "ssl hybrid": "ssl_hybrid"
};

// ================= OPERATORS =================
const ops = {
  ">": (a, b) => a > b,
  "<": (a, b) => a < b,
  ">=": (a, b) => a >= b,
  "<=": (a, b) => a <= b,
  "==": (a, b) => a == b,
  "!=": (a, b) => a != b,
  "cross_above": (prevA, prevB, currA, currB) =>
    prevA <= prevB && currA > currB,

  "cross_below": (prevA, prevB, currA, currB) =>
    prevA >= prevB && currA < currB
};

function applyScanner(data, conditions) {
  return data.filter(candle =>
    conditions.some(cond => {

      const key = keyMap[cond.indicator.toLowerCase()];
      const val = candle[key];

      if (val == null) return false;

      if (cond.operator === "cross_above" || cond.operator === "cross_below") {
        if (index === 0) return false; // no previous candle

        const prevCandle = data[index - 1];
        const prevVal = prevCandle[key];

        if (prevVal == null) return false;

        return ops[cond.operator](
          prevVal,
          cond.value,
          currVal,
          cond.value
        );
      }

      return ops[cond.operator](val, cond.value);
    })
  );
}


//  "ATR",
//   "BB",
//   "BBW",
//   "ADX",
//   "AROON",
//   "ROC",
//   "ICHIMOKU",
//   "AO",
//   "CCI",
//   "VP",
//   "MOM",
//   "TEMA",
//   "DEMA",
//   "WMA",
//   "HMA",
//   "KAMA",
//   "AWO",
//   "CMO",
//   "TRIX",
//   "FT",
//   "KVO",
//   "STDDEV",
//   "KC",
//   "DC",
//   "HV",
//   "CHOP",
//   "VOL",
//   "OBV",
//   "PVO",
//   "AD",
//   "CMF",
//   "MFI",
//   "EOM",
//   "NVI",
//   "PVI",
//   "SUPERTREND",
//   "PSAR",
//   "STOCHRSI",
//   "WPR",
//   "CK",
//   "UO",
//   "ZIGZAG",
//   "CAMARILLA"

const ALL_INDICATORS = [
  "SMA",
  "EMA",
  "RSI",
  "MACD",
  "VWAP",

];
async function combineMergedIndicators(indicatorResults) {
  try {
    const map = new Map();

    for (let indicatorName in indicatorResults) {
      const dataArray = indicatorResults[indicatorName];

      dataArray?.forEach(item => {
        const time = item.time;

        // agar candle exist nahi hai to add kar
        if (!map.has(time)) {
          map.set(time, { time });
        }

        const existing = map.get(time);

        // saare fields merge kar do
        Object.keys(item)?.forEach(key => {
          if (key !== "time") {
            existing[key] = item[key];
          }
        });
      });
    }
    return Array.from(map.values()).sort((a, b) => a.time - b.time);
  } catch (error) {
    console.log(error, "_____________________________---097867908709t90ibkjkl");
  }
}

async function runAllMergeCandleWisthIndicator(req, interval, rules, day, res) {
  try {
    let maxIndicatorLength = 14;

    const checkLength = (len) => {
      if (typeof len === 'number') return len;
      if (typeof len === 'object' && len !== null) return parseInt(len.length) || parseInt(len.value) || 14;
      return 14;
    };

    rules.forEach(r => {
      if (r.object1?.length) maxIndicatorLength = Math.max(maxIndicatorLength, checkLength(r.object1.length));
      if (r.object2?.length) maxIndicatorLength = Math.max(maxIndicatorLength, checkLength(r.object2.length));
      if (r.object3?.length) maxIndicatorLength = Math.max(maxIndicatorLength, checkLength(r.object3.length));
      if (r.object4?.length) maxIndicatorLength = Math.max(maxIndicatorLength, checkLength(r.object4.length));

      if (r.sequence) {
        r.sequence.forEach(item => {
          if (typeof item === 'object' && item.length) {
            maxIndicatorLength = Math.max(maxIndicatorLength, checkLength(item.length));
          }
        });
      }
    });

    const requestedLimit = parseInt(req?.query?.limit) || 1000;

    // Detect Cumulative Indicators that need deep history (OBV, CMF, AD, etc.)
    const cumulativeIndicators = ["OBV", "CMF", "AD", "ADX", "ACCUMULATION/DISTRIBUTION", "CHAIKIN MONEY FLOW"];
    let needsDeepHistory = false;
    rules.forEach(r => {
      const indicatorsInRule = [
        r.indicator, r.indicator1, r.indicator2, r.indicator3, r.indicator4,
        r.object1?.indicator, r.object2?.indicator, r.object3?.indicator, r.object4?.indicator
      ];
      if (indicatorsInRule.some(ind => ind && cumulativeIndicators.includes(ind.toString().toUpperCase()))) {
        needsDeepHistory = true;
      }
    });

    // Dynamic warmup buffer: at least 300, or 2x the longest indicator length
    // For cumulative indicators, we force 5000 to match TradingView's deep history approach
    const warmupBuffer = needsDeepHistory ? 5000 : Math.max(300, maxIndicatorLength * 2);
    const fetchLimit = needsDeepHistory ? 5000 : (requestedLimit + warmupBuffer);

    let data = {
      interval: interval,
      limit: fetchLimit,
      maxIndicatorLength: maxIndicatorLength,
      market: req?.query?.market,
      symbol: Array.isArray(req?.body?.currencies) && req.body.currencies.length === 1
        ? req.body.currencies[0]
        : req?.query?.symbol
    };

    let fetchCandles = await getHistoricalCandlesForScanner(data);
    console.log(`[FETCH_CANDLES] Keys:`, Object.keys(fetchCandles), "Sample size:", Object.values(fetchCandles)?.[0]?.length);

    const indicatorRequests = [];
    rules.forEach(r => {
      const objs = [];
      const checkNested = (obj) => {
        if (obj && obj.indicator && obj.indicator !== "number") {
          objs.push(obj);
          if (obj.inputIndicator && typeof obj.inputIndicator === "object") {
            checkNested({ ...obj.inputIndicator, timeframe: obj.inputIndicator.timeframe || obj.timeframe });
          }
        }
      };

      if (r.object1) checkNested(r.object1);
      if (r.object2) checkNested(r.object2);
      if (r.object3) checkNested(r.object3);
      if (r.object4) checkNested(r.object4);

      if (r.sequence) {
        r.sequence.forEach(item => {
          checkNested(item);
        });
      }

      if (!r.object1 && !r.sequence) {
        [
          { indicator: r.indicator1 || r.indicator, timeframe: r.timeframe1 || r.timeframe, length: r.config1 || r.config || { length: r.length } },
          { indicator: r.indicator2 || r.value, timeframe: r.timeframe2 || r.compareTimeframe || r.timeframe, length: r.config2 || r.valueConfig || { length: r.compareLength } },
          { indicator: r.indicator3 || r.indicatorOpValue || r.valueOpValue, timeframe: r.timeframe3 || r.valueOpTimeframe || r.timeframe2, length: r.config3 || r.indicatorOpConfig || r.valueOpConfig },
          { indicator: r.indicator4 || r.indicatorOp2Value || r.valueOp2Value, timeframe: r.timeframe4 || r.valueOp2Timeframe || r.timeframe3 || r.timeframe2, length: r.config4 || r.indicatorOp2Config || r.valueOp2Config }
        ].forEach(item => {
          if (item.indicator && typeof item.indicator === "string" && isNaN(parseFloat(item.indicator)) && item.indicator !== "number") {
            objs.push(item);
          }
        });
      }

      objs.forEach(obj => {
        if (obj && obj.indicator && obj.indicator !== "number") {
          indicatorRequests.push(obj);
        }
      });
    });

    const uniqueRequests = [];
    const seen = new Set();
    indicatorRequests.forEach(req => {
      const id = `${req.indicator.toLowerCase()}_${req.timeframe}_${JSON.stringify(req.length)}`;
      if (!seen.has(id)) {
        seen.add(id);
        uniqueRequests.push(req);
      }
    });

    for (const req of uniqueRequests) {
      try {
        const getUniqueKey = (name, len) => {
          const tfSuffix = req.timeframe || "1d";
          const prefix = `${name}_${tfSuffix}`;
          if (!len || (typeof len === 'object' && Object.keys(len).length === 0)) return prefix;

          if (typeof len === "object") {
            const cfgStr = Object.values(len).filter(v => v !== null && v !== undefined).join("_");
            return `${prefix}_${cfgStr}`.replace(/[^a-zA-Z0-9_]/g, "");
          }
          return `${prefix}_${len}`.replace(/[^a-zA-Z0-9_]/g, "");
        };

        const ind = req.indicator.toLowerCase();
        let lengthObj = null;

        // Custom logic to determine if we should build a lengthObj with defaults
        const indicatorsWithDefaults = ["rsi", "sma", "ema", "macd", "stochrsi", "aroon", "ao", "dema", "cmo", "bbw", "cci", "stochastic", "cmf", "roc", "mfi", "williamsr", "wpr", "trix", "momentum", "hma", "tema", "stddev", "chop", "eom", "kvo", "kama", "hv", "ft", "wma", "vwma", "pvo", "awo", "rma", "tma", "nvi", "pvi", "ad", "max", "min", "obv", "volume", "supertrend", "psar", "zigzag", "uo", "vwap", "atr", "stoch", "ks", "camarilla", "cks"];

        const isDefaultNeeded = indicatorsWithDefaults.includes(ind) || ind.includes("ichimoku") || ["max", "min", "highest", "lowest"].includes(ind);

        if (typeof req.length === "object" && req.length !== null) {
          lengthObj = { ...req.length };
          if (req.inputIndicator && !lengthObj.inputIndicator) {
            lengthObj.inputIndicator = req.inputIndicator;
          }
          if (isDefaultNeeded) {
            lengthObj.length = req.length.length || req.length.maLength || req.length.value || 14;
            lengthObj.source = req.length.source || req.source || req.length.inputIndicator || req.inputIndicator || "close";
          }
        } else if (req.length || req.source || req.inputIndicator || isDefaultNeeded) {
          lengthObj = {
            length: req.length || 14,
            source: req.source || req.inputIndicator || "close"
          };
          if (req.inputIndicator) {
            lengthObj.inputIndicator = req.inputIndicator;
          }
        }

        const numericLength = lengthObj?.length || 14;

        console.log(`[INDICATOR] ${ind} -> lengthObj:`, lengthObj, "isDefaultNeeded:", isDefaultNeeded);

        // --- Added Timeframe Normalization for Indicators like Pivots ---
        if (lengthObj && lengthObj.timeframe) {
          const tfLower = lengthObj.timeframe.toLowerCase();
          if (["1d", "daily", "d"].includes(tfLower)) lengthObj.timeframe = "Daily";
          else if (["1w", "weekly", "w"].includes(tfLower)) lengthObj.timeframe = "Weekly";
          else if (["1m", "monthly", "m", "1M"].includes(tfLower)) lengthObj.timeframe = "Monthly";
        }

        // --- Resolve nested inputIndicator objects to keys ---
        if (lengthObj && lengthObj.inputIndicator && typeof lengthObj.inputIndicator === 'object') {
          const innerReq = lengthObj.inputIndicator;
          const innerInd = innerReq.indicator.toLowerCase();
          const innerLen = {
            length: innerReq.length || 14,
            source: innerReq.source || "close",
            timeframe: innerReq.timeframe || (lengthObj.timeframe || req.timeframe || "1d")
          };
          lengthObj.inputIndicator = getUniqueKey(innerInd, innerLen);
        }

        let normalizedInd = ind;
        if (ind.includes("ichimoku")) normalizedInd = "ichimoku";
        if (ind.includes("macd")) normalizedInd = "macd";
        if (ind.includes("bollinger bands")) normalizedInd = "bb";
        if (ind.includes("supertrend")) normalizedInd = "supertrend";
        if (ind.includes("keltner channels")) normalizedInd = "kc";
        if (["ao", "aroon oscillator"].includes(ind)) normalizedInd = "ao";
        if (["max", "highest", "highest high"].includes(ind)) normalizedInd = "max";
        if (["min", "lowest", "lowest low"].includes(ind)) normalizedInd = "min";
        if (ind.includes("aroon") && !ind.includes("oscillator")) normalizedInd = "aroon";
        if (ind.includes("donchian channels")) normalizedInd = "dc";
        if (ind.includes("pivot")) normalizedInd = "pivot";
        if (ind.includes("awo") || ind.includes("awesome")) normalizedInd = "awo";
        if (["volume", "volumema", "volume ma", "volume moving average"].includes(ind)) normalizedInd = "volume";
        if (["adx", "plus di", "minus di", "+di", "-di", "di+", "di-", "adx di positive", "adx di negative"].includes(ind)) normalizedInd = "adx";
        if (["true range", "tr", "truerange"].includes(ind)) normalizedInd = "tr";
        if (["rma", "smma", "wilder moving average"].includes(ind)) normalizedInd = "rma";
        if (["tma", "triangular moving average"].includes(ind)) normalizedInd = "tma";
        if (["vwma", "volume weighted moving average", "volume-weighted moving average"].includes(ind)) normalizedInd = "vwma";
        if (["kvo", "klinger oscillator", "klinger oscillator signal", "klinger oscillator signal line", "klinger signal", "klinger signal line"].includes(ind)) normalizedInd = "kvo";
        if (["stddev", "standard deviation", "standard deviation indicator"].includes(ind)) normalizedInd = "stddev";
        if (["wpr", "williamsr", "williams %r", "williams r", "williams-r"].includes(ind)) normalizedInd = "williamsr";
        if (ind.includes("stochrsi") || ind.includes("stochastic rsi")) normalizedInd = "stochrsi";
        if (["stoch", "stochastic", "stochastic oscillator", "stoch oscillator"].includes(ind) || (ind.includes("stochastic") && !ind.includes("rsi"))) normalizedInd = "stochastic";

        let allIndicatorData = null;

        switch (normalizedInd) {
          case "rsi":
            console.log(`[RSI-CALC] Starting RSI calculation for ${req.indicator} with lengthObj:`, lengthObj);
            allIndicatorData = await applyIndicatorToCandleData(fetchCandles, calculateRSIIndicator, lengthObj, {
              keyMap: { rsi: getUniqueKey("rsi", lengthObj), bbUpper: getUniqueKey("upperBandRSI", lengthObj), bbLower: getUniqueKey("lowerBandRSI", lengthObj), smoothingMA: getUniqueKey("smoothingRSI", lengthObj) }
            });
            console.log(`[RSI-CALC] RSI calculation completed, data keys:`, allIndicatorData ? Object.keys(allIndicatorData).slice(0, 3) : 'null');
            break;
          case "sma":
            allIndicatorData = await applyIndicatorToCandleData(fetchCandles, calculateSMA, lengthObj, {
              keyMap: { sma: getUniqueKey("sma", lengthObj) }
            });
            break;
          case "ema":
            allIndicatorData = await applyIndicatorToCandleData(fetchCandles, calculateEMAIndicator, lengthObj, {
              keyMap: { ema: getUniqueKey("ema", lengthObj) }
            });
            break;
          case "aroon":
            allIndicatorData = await applyIndicatorToCandleData(fetchCandles, async (candles, opts) => {
              const res = await calculateAroonFromCandles(candles, opts);
              return res.aroonUpSeries.map((u, i) => ({
                up: u.value,
                down: res.aroonDownSeries[i].value
              }));
            }, lengthObj, {
              keyMap: { up: getUniqueKey("aroonUp", lengthObj), down: getUniqueKey("aroonDown", lengthObj) }
            });
            break;
          case "macd":
            allIndicatorData = await applyIndicatorToCandleData(fetchCandles, calculateMACD, lengthObj, {
              keyMap: {
                macd: getUniqueKey("macd", lengthObj),
                signal: getUniqueKey("macdSignal", lengthObj),
                hist: getUniqueKey("macdHistogram", lengthObj)
              }
            });
            break;
          case "bb":
            allIndicatorData = await applyIndicatorToCandleData(fetchCandles, calculateBollingerBands, lengthObj, {
              keyMap: {
                upper: getUniqueKey("upperBandBB", lengthObj),
                lower: getUniqueKey("lowerBandBB", lengthObj),
                basis: getUniqueKey("basisBB", lengthObj),
                percentB: getUniqueKey("percentB_BB", lengthObj)
              }
            });
            break;
          case "ichimoku":
            const ichiOptions = { conversionLength: lengthObj.conversion || lengthObj.baseline || 9, baseLength: lengthObj.base || lengthObj.span || 26, spanBLength: lengthObj.spanB || 52, laggingSpan: lengthObj.lagging || 26 };
            allIndicatorData = await applyIndicatorToCandleData(fetchCandles, async (candles, opts) => {
              const ichi = await calculateIchimoku(candles, opts);
              return ichi.map((item) => {
                const l1 = item?.leadLine1;
                const l2 = item?.leadLine2;
                return {
                  ...item,
                  cloudBottom: l1 == null || l2 == null ? null : Math.min(l1, l2),
                  cloudTop: l1 == null || l2 == null ? null : Math.max(l1, l2)
                };
              });
            }, ichiOptions, {
              keyMap: { conversionLine: getUniqueKey("conversionLineIchimoku", lengthObj), baseLine: getUniqueKey("baseLineIchimoku", lengthObj), leadLine1: getUniqueKey("leadLine1Ichimoku", lengthObj), leadLine2: getUniqueKey("leadLine2Ichimoku", lengthObj), cloudBottom: getUniqueKey("cloudBottomIchimoku", lengthObj), cloudTop: getUniqueKey("cloudTopIchimoku", lengthObj), laggingSpan: getUniqueKey("laggingSpan", lengthObj) }
            });
            break;
          case "atr":
            allIndicatorData = await applyIndicatorToCandleData(fetchCandles, calculateATR, lengthObj, {
              keyMap: { atr: getUniqueKey("atr", lengthObj) }
            });
            break;
          case "tr":
            allIndicatorData = await applyIndicatorToCandleData(fetchCandles, trueRangeSeries, null, {
              keyMap: { trueRange: getUniqueKey("trueRange", lengthObj) }
            });
            break;
          case "rma":
            allIndicatorData = await applyIndicatorToCandleData(fetchCandles, rmaSeries, {
              period: lengthObj?.length || numericLength || 14,
              valueKey: lengthObj?.source || lengthObj?.inputIndicator || "close"
            }, {
              keyMap: { rma: getUniqueKey("rma", lengthObj) }
            });
            break;
          case "tma":
            allIndicatorData = await applyIndicatorToCandleData(fetchCandles, tmaSeries, {
              period: lengthObj?.length || numericLength || 20,
              source: lengthObj?.source || lengthObj?.inputIndicator || "close"
            }, {
              keyMap: { tma: getUniqueKey("tma", lengthObj) }
            });
            break;
          case "vwma":
            allIndicatorData = await applyIndicatorToCandleData(fetchCandles, async (candles, opts) => {
              const period = opts?.length || opts?.period || 20;
              const priceKey = opts?.source || opts?.inputIndicator || "close";
              return vwmaSeries(candles, period, priceKey, "volume");
            }, lengthObj || { length: numericLength, source: "close" }, {
              keyMap: { vwma: getUniqueKey("vwma", lengthObj) }
            });
            break;
          case "supertrend":
            allIndicatorData = await applyIndicatorToCandleData(fetchCandles, calculateSupertrend, lengthObj, {
              keyMap: { supertrend: getUniqueKey("supertrend", lengthObj) }
            });
            break;
          case "stochrsi":
            allIndicatorData = await applyIndicatorToCandleData(fetchCandles, async (candles, opts) => {
              const res = await calculateStochRSI(candles, opts || {});
              return res?.candles || [];
            }, lengthObj || { length: numericLength }, {
              keyMap: { stochRsi: getUniqueKey("stochRsi", lengthObj), stochRsiK: getUniqueKey("stochRsiK", lengthObj), stochRsiD: getUniqueKey("stochRsiD", lengthObj) }
            });
            break;
          case "ad":
            allIndicatorData = await applyIndicatorToCandleData(fetchCandles, calculateAD, lengthObj, {
              keyMap: { AD: getUniqueKey("ad", lengthObj) }
            });
            break;
          case "aroon":
            allIndicatorData = await applyIndicatorToCandleData(fetchCandles, calculateAroonFromCandles, numericLength, {
              keyMap: { aroonUp: getUniqueKey("aroonUp", lengthObj), aroonDown: getUniqueKey("aroonDown", lengthObj) }
            });
            break;
          case "awo":
            try {
              console.log(`[AWO] Starting calculation with:`, { lengthObj, numSymbols: Object.keys(fetchCandles).length });
              allIndicatorData = await applyIndicatorToCandleData(fetchCandles, calculateAwesomeOscillator, lengthObj, {
                keyMap: { ao: getUniqueKey("ao", lengthObj) }
              });
              console.log(`[AWO] Calculation complete. Result keys:`, allIndicatorData ? Object.keys(allIndicatorData) : 'null');
            } catch (e) {
              console.error(`[AWO] ERROR:`, e.message, e.stack);
              throw e;
            }
            break;
          case "ao":
            allIndicatorData = await applyIndicatorToCandleData(fetchCandles, calculateAroonOscillator, lengthObj, {
              keyMap: { aroonOsc: getUniqueKey("ao", lengthObj) }
            });
            break;
          case "kc":
            allIndicatorData = await applyIndicatorToCandleData(fetchCandles, calculateKeltnerChannels, numericLength, {
              keyMap: { upper: getUniqueKey("upperBandKeltner", lengthObj), lower: getUniqueKey("lowerBandKeltner", lengthObj), middle: getUniqueKey("middleLineKeltner", lengthObj) }
            });
            break;
          case "dc":
            allIndicatorData = await applyIndicatorToCandleData(fetchCandles, calculateDonchianChannels, lengthObj || { length: numericLength }, {
              keyMap: { upper: getUniqueKey("upperDC", lengthObj), basis: getUniqueKey("middleDC", lengthObj), lower: getUniqueKey("lowerDC", lengthObj) }
            });
            break;
          case "max":
            allIndicatorData = await applyIndicatorToCandleData(fetchCandles, calculateDonchianChannels, lengthObj || { length: numericLength }, {
              keyMap: { upper: getUniqueKey("max", lengthObj) }
            });
            break;
          case "min":
            allIndicatorData = await applyIndicatorToCandleData(fetchCandles, calculateDonchianChannels, lengthObj || { length: numericLength }, {
              keyMap: { lower: getUniqueKey("min", lengthObj) }
            });
            break;
          case "dema":
            allIndicatorData = await applyIndicatorToCandleData(fetchCandles, calculateDEMA, numericLength, {
              keyMap: { dema: getUniqueKey("dema", lengthObj) }
            });
            break;
          case "cmo":
            allIndicatorData = await applyIndicatorToCandleData(fetchCandles, calculateChandeMO, numericLength, {
              keyMap: { cmo: getUniqueKey("cmo", lengthObj) }
            });
            break;
          case "bbw":
            allIndicatorData = await applyIndicatorToCandleData(fetchCandles, calculateBBW, numericLength, {
              keyMap: { bbw: getUniqueKey("bbw", lengthObj) }
            });
            break;
          case "vwap":
            allIndicatorData = await applyIndicatorToCandleData(fetchCandles, calculateVWAP, lengthObj, {
              keyMap: { vwap: getUniqueKey("vwap", lengthObj) }
            });
            break;
          case "cci":
            allIndicatorData = await applyIndicatorToCandleData(fetchCandles, calculateCCI, numericLength, {
              keyMap: { cci: getUniqueKey("cci", lengthObj) }
            });
            break;
          case "obv":
            allIndicatorData = await applyIndicatorToCandleData(fetchCandles, calculateOBV, lengthObj, {
              keyMap: {
                obv: getUniqueKey("obv", lengthObj),
                smoothingMA: getUniqueKey("obvSmoothing", lengthObj),
                bbMiddle: getUniqueKey("obvBBMiddle", lengthObj),
                bbUpper: getUniqueKey("obvBBUpper", lengthObj),
                bbLower: getUniqueKey("obvBBLower", lengthObj)
              }
            });
            break;
          case "volume":
            allIndicatorData = await applyIndicatorToCandleData(fetchCandles, calculateVolumeIndicator, lengthObj, {
              keyMap: {
                volume: getUniqueKey("volume", lengthObj),
                volumeMA: getUniqueKey("volumeMA", lengthObj),
                rising: getUniqueKey("volumeRising", lengthObj),
                falling: getUniqueKey("volumeFalling", lengthObj),
                crossAboveMA: getUniqueKey("volumeCrossAboveMA", lengthObj),
                crossBelowMA: getUniqueKey("volumeCrossBelowMA", lengthObj)
              }
            });
            break;
          case "uo":
            allIndicatorData = await applyIndicatorToCandleData(fetchCandles, calculateUltimateOscillator, null, {
              keyMap: { ultimate: getUniqueKey("ultimate", lengthObj) }
            });
            break;
          case "psar":
            allIndicatorData = await applyIndicatorToCandleData(fetchCandles, calculateParabolicSAR, {
              start: lengthObj?.start ?? lengthObj?.step ?? 0.02,
              increment: lengthObj?.increment ?? lengthObj?.step ?? 0.02,
              maximum: lengthObj?.maximum ?? lengthObj?.max ?? 0.2
            }, {
              keyMap: { parabolic: getUniqueKey("sar", lengthObj) }
            });
            break;
          case "vp":
            allIndicatorData = await applyIndicatorToCandleData(fetchCandles, calculateVolumeProfile, null, {
              keyMap: { vp: getUniqueKey("vp", lengthObj) }
            });
            break;
          case "adx":
            const adxOptions = {
              diLength: lengthObj?.length || numericLength || 14,
              smoothing: lengthObj?.smoothing || lengthObj?.adxlen || lengthObj?.length || numericLength || 14
            };
            allIndicatorData = await applyIndicatorToCandleData(fetchCandles, calculateADX, adxOptions, {
              keyMap: {
                ADX: getUniqueKey("adx", lengthObj),
                plusDI: getUniqueKey("plusDI", lengthObj),
                minusDI: getUniqueKey("minusDI", lengthObj)
              }
            });
            break;
          case "stochastic":
            allIndicatorData = await applyIndicatorToCandleData(fetchCandles, calculateStochastic, lengthObj, {
              keyMap: {
                stochastick: getUniqueKey("stochastick", lengthObj),
                stochasticd: getUniqueKey("stochasticd", lengthObj),
                fastStochasticK: getUniqueKey("fastStochasticK", lengthObj),
                fastStochasticD: getUniqueKey("fastStochasticD", lengthObj),
                slowStochasticK: getUniqueKey("slowStochasticK", lengthObj),
                slowStochasticD: getUniqueKey("slowStochasticD", lengthObj)
              }
            });
            break;
          case "cmf":
            allIndicatorData = await applyIndicatorToCandleData(fetchCandles, calculateCMF, numericLength, {
              keyMap: { cmf: getUniqueKey("cmf", lengthObj) }
            });
            break;
          case "roc":
            allIndicatorData = await applyIndicatorToCandleData(fetchCandles, calculatedROC, numericLength, {
              keyMap: { roc: getUniqueKey("roc", lengthObj) }
            });
            break;
          case "mfi":
            allIndicatorData = await applyIndicatorToCandleData(fetchCandles, calculateMFI, numericLength, {
              keyMap: { mfi: getUniqueKey("mfi", lengthObj) }
            });
            break;
          case "williamsr":
            allIndicatorData = await applyIndicatorToCandleData(fetchCandles, calculateWilliamsR, numericLength, {
              keyMap: { williamsr: getUniqueKey("williamsr", lengthObj) }
            });
            break;
          case "trix":
            allIndicatorData = await applyIndicatorToCandleData(fetchCandles, calculateTRIX, numericLength, {
              keyMap: { trix: getUniqueKey("trix", lengthObj) }
            });
            break;
          case "momentum":
            allIndicatorData = await applyIndicatorToCandleData(fetchCandles, calculateMomentum, numericLength, {
              keyMap: { momentum: getUniqueKey("momentum", lengthObj) }
            });
            break;
          case "pivot":
            allIndicatorData = await applyIndicatorToCandleData(fetchCandles, async (candles, opts) => {
              function getSourceValue(c, source) {
                const o = Number(c?.open || c?.o || 0);
                const h = Number(c?.high || c?.h || 0);
                const l = Number(c?.low || c?.l || 0);
                const cl = Number(c?.close || c?.c || 0);

                switch (source) {
                  case "hl2": return (h + l) / 2;
                  case "hlc3": return (h + l + cl) / 3;
                  case "ohlc4": return (o + h + l + cl) / 4;
                  case "open": return o;
                  case "high": return h;
                  case "low": return l;
                  case "close": return cl;
                  default: return Number(c[source] || cl);
                }
              } const pivotResult = await calculateClassicPivots(candles, opts || { timeframe: "Daily" });
              return candles.map(c => {
                let activePivot = null;
                for (let p of pivotResult) {
                  if (c.time >= p.periodStart && c.time <= p.periodEnd) {
                    activePivot = p;
                    break;
                  }
                }
                if (!activePivot) return {};
                return activePivot.levels || {};
              });
            }, lengthObj, {
              keyMap: { P: getUniqueKey("pivot_P", lengthObj), R1: getUniqueKey("pivot_R1", lengthObj), S1: getUniqueKey("pivot_S1", lengthObj), R2: getUniqueKey("pivot_R2", lengthObj), S2: getUniqueKey("pivot_S2", lengthObj), R3: getUniqueKey("pivot_R3", lengthObj), S3: getUniqueKey("pivot_S3", lengthObj), R4: getUniqueKey("pivot_R4", lengthObj), S4: getUniqueKey("pivot_S4", lengthObj) }
            });
            break;
          case "hma":
            allIndicatorData = await applyIndicatorToCandleData(fetchCandles, calculateHMA, numericLength, {
              keyMap: { hma: getUniqueKey("hma", lengthObj) }
            });
            break;
          case "tema":
            allIndicatorData = await applyIndicatorToCandleData(fetchCandles, calculateTEMA, numericLength, {
              keyMap: { tema: getUniqueKey("tema", lengthObj) }
            });
            break;
          case "stddev":
            allIndicatorData = await applyIndicatorToCandleData(fetchCandles, calculateStdev, numericLength, {
              keyMap: { value: getUniqueKey("stddev", lengthObj) }
            });
            break;
          case "chop":
            allIndicatorData = await applyIndicatorToCandleData(fetchCandles, calculateCHOP, numericLength, {
              keyMap: { chop: getUniqueKey("chop", lengthObj) }
            });
            break;
          case "eom":
            allIndicatorData = await applyIndicatorToCandleData(fetchCandles, calculateEOM, numericLength, {
              keyMap: { eom: getUniqueKey("eom", lengthObj) }
            });
            break;
          case "nvi":
            allIndicatorData = await applyIndicatorToCandleData(fetchCandles, calculateNVI, lengthObj, {
              keyMap: { nvi: getUniqueKey("nvi", lengthObj), nviEma: getUniqueKey("nviEma", lengthObj) }
            });
            break;
          case "pvi":
            allIndicatorData = await applyIndicatorToCandleData(fetchCandles, calculatePVI, lengthObj, {
              keyMap: { pvi: getUniqueKey("pvi", lengthObj), pviEma: getUniqueKey("pviEma", lengthObj) }
            });
            break;
          case "zigzag":
            allIndicatorData = await applyIndicatorToCandleData(fetchCandles, calculateZigZag, lengthObj, {
              keyMap: { zigzag: getUniqueKey("zigzag", lengthObj) }
            });
            break;
          case "kvo":
            allIndicatorData = await applyIndicatorToCandleData(fetchCandles, calculateKlingerOscillator, lengthObj, {
              keyMap: { klinger: getUniqueKey("klinger", lengthObj), klingerSignal: getUniqueKey("klingerSignal", lengthObj), signal: getUniqueKey("klingerSignal", lengthObj) }
            });
            break;
          case "kama":
            allIndicatorData = await applyIndicatorToCandleData(fetchCandles, calculateKAMA, numericLength, {
              keyMap: { kama: getUniqueKey("kama", lengthObj) }
            });
            break;
          case "hv":
            allIndicatorData = await applyIndicatorToCandleData(fetchCandles, calculateHistoricalVolatility, numericLength, {
              keyMap: { hv: getUniqueKey("hv", lengthObj) }
            });
            break;
          case "ft":
            allIndicatorData = await applyIndicatorToCandleData(fetchCandles, calculateFisherTransform,
              lengthObj, {
              keyMap: {
                fish: getUniqueKey("fisher", lengthObj),
                trigger: getUniqueKey("fisherSignal", lengthObj)
              }
            });
            break;
          case "wma":
            allIndicatorData = await applyIndicatorToCandleData(fetchCandles, calculateWMA, numericLength, {
              keyMap: { wma: getUniqueKey("wma", lengthObj) }
            });
            break;
          case "pvo":
            allIndicatorData = await applyIndicatorToCandleData(fetchCandles, calculatePVO, lengthObj, {
              keyMap: { pvo: getUniqueKey("pvo", lengthObj), signal: getUniqueKey("pvoSignal", lengthObj) }
            });
            break;
          default:
            console.log(`Skipping unknown or unhandled indicator: ${normalizedInd}`);
            break;
        }

        // Merge result back to fetchCandles symbol-by-symbol to avoid large parallel memory spikes
        console.log(`[RESULT] ${normalizedInd}: allIndicatorData exists?`, !!allIndicatorData, "keys:", allIndicatorData ? Object.keys(allIndicatorData) : []);

        if (allIndicatorData) {
          for (const symbol of Object.keys(allIndicatorData)) {
            const indData = allIndicatorData[symbol];
            if (fetchCandles[symbol] && indData) {
              fetchCandles[symbol] = fetchCandles[symbol].map((c, i) => ({
                ...c,
                ...(indData[i] || {})
              }));
            }
          }
        }
      } catch (err) {
        console.error(`Error calculating indicator:`, err);
      }
    }

    // Slice each symbol's candles back to the exactly requested limit (removing warmup history)
    for (const symbol of Object.keys(fetchCandles)) {
      const initialLen = fetchCandles[symbol].length;
      if (initialLen > requestedLimit) {
        fetchCandles[symbol] = fetchCandles[symbol].slice(-requestedLimit);
      }
      // Debug first candle of the slice
      const first = fetchCandles[symbol][0];
      console.log(`[SLICE_DEBUG] Symbol: ${symbol}, InitialLen: ${initialLen}, Requested: ${requestedLimit}, FirstCandle OBV: ${first?.obv_4h ?? 'N/A'}`);
    }

    console.log(`[FINAL_RETURN] Returning fetchCandles with exactly ${requestedLimit} candles per symbol`);
    return fetchCandles;

  } catch (error) {
    console.error("Error in runAllMergeCandleWisthIndicator:", error);
    return [];
  }
}




async function getScannerDataBySpecificTimeInterval(req, res) {
  try {
    const { symbol, interval, indicators } = req.body;
    // indicators = [{indicator: "rsi", timeframe: "1d"}, {indicator:"macd", timeframe:"1m"}]

    if (!symbol || !interval || !Array.isArray(indicators)) {
      return res.status(400).json({ error: "symbol, interval and indicators array required" });
    }
    let data = { symbol: symbol, interval: interval }
    const candles = await getHistoricalCandles(data);

    // Map indicator names to functions
    const indicatorFuncs = {
      rsi: calculateRSIIndicator,
      ad: calculateAD,
      adx: calculateADX,
      aroon: calculateAroonFromCandles,
      macd: calculateMACD,
      ema: calculateEMAIndicator,
      sma: calculateSMA,
      vwap: calculateVWAP,
      cci: calculateCCI,
      obv: calculateOBV,
      stochastic: calculateStochastic,
      atr: calculateATR,
      bb: calculateBollingerBands,
      supertrend: calculateSupertrend,
      ichimoku: calculateIchimoku,
      cmf: calculateCMF,
      roc: calculatedROC,
      mfi: calculateMFI,
      williamsr: calculateWilliamsR,
      psar: calculateParabolicSAR,
      kc: calculateKeltnerChannels,
      dc: calculateDonchianChannels,
      trix: calculateTRIX,
      uo: calculateUltimateOscillator,
      ao: calculateAroonOscillator,
      bbw: calculateBBW,
      momentum: calculateMomentum,
      pivot: calculatePivotPoints,
      hma: calculateHMA,
      tema: calculateTEMA,
      dema: calculateDEMA,
      stddev: calculateStdev,
      chop: calculateCHOP,
    };

    // Prepare results object per timeframe
    const timeframeResults = {};

    // Group indicators by timeframe
    const grouped = {};
    indicators.forEach(({ indicator, timeframe }) => {
      if (!grouped[timeframe]) grouped[timeframe] = [];
      grouped[timeframe].push(indicator.toLowerCase());
    });

    // Loop through each timeframe
    for (const tf of Object.keys(grouped)) {
      timeframeResults[tf] = candles.map(c => ({ ...c })); // start with candles

      for (const indicator of grouped[tf]) {
        if (indicatorFuncs[indicator]) {
          const result = await indicatorFuncs[indicator](candles, tf);
          // Merge indicator into each candle with timeframe info
          timeframeResults[tf] = timeframeResults[tf].map((c, i) => ({
            ...c,
            [indicator]: { value: result[i], timeframe: tf }
          }));
        } else {
          // If invalid indicator
          timeframeResults[tf] = timeframeResults[tf].map(c => ({
            ...c,
            [indicator]: { value: null, timeframe: tf }
          }));
        }
      }
    }

    return await res.json(timeframeResults); // { "1m": [...], "1d": [...] }
  } catch (error) {
    console.log(error, "________________________________________________")
  }
}


async function applyIndicatorToCandleData(data, indicatorFn, options, config = {}) {
  const result = {};

  const {
    keyMap = {},   // full custom mapping (IMPORTANT)
  } = config;

  await Promise.all(Object.keys(data).map(async (symbol) => {
    const candles = data[symbol];

    const indicatorResult = await indicatorFn(candles, options);

    result[symbol] = candles.map((candle, i) => {
      const output = {
        time: candle.time
      };

      // apply custom key mapping
      for (const originalKey in keyMap) {
        const customKey = keyMap[originalKey];
        output[customKey] = indicatorResult[i]?.[originalKey] ?? null;
      }

      return output;
    });
  }));

  return result;
}


//send sms to mobile number
async function sendSMS(mobile, message, text = null) {
  try {
    const response = await axios.post(
      "https://www.fast2sms.com/dev/bulkV2",
      {
        route: "q",              // q = quick transactional
        message: message,
        sender_id: text,
        numbers: mobile
      },
      {
        headers: {
          authorization: process.env.FAST_TO_SMS,
          "Content-Type": "application/json"
        },
        timeout: 10000
      }
    );

    console.log("SMS Sent:", response.data);
    return response?.data;
  } catch (error) {
    console.error("SMS Error:", error.response?.data || error.message);
    throw error;
  }
}

// ------------------------------------------------BACKTEST HISTORY FUNCTION CALL HERE-------------------------------------

// ===============================
// 🔧 BACKTEST FUNCTIONS
// ===============================
function formatDate(ts) {
  return new Date(ts * 1000).toISOString().split("T")[0];
}

function shouldEnter(prev, curr) {
  return curr.close > prev.close;
}

function getExit(candles, entryIndex, holdingPeriod = 1) {
  const entry = candles[entryIndex];
  const exit = candles[entryIndex + holdingPeriod];

  if (!exit) return null;

  const pnl = ((exit.close - entry.open) / entry.open) * 100;

  return { pnl };
}

function backtestSymbol(candles, sector) {
  const trades = [];

  for (let i = 1; i < candles.length - 2; i++) {
    if (shouldEnter(candles[i - 1], candles[i])) {
      const entryIndex = i + 1;
      const exit = getExit(candles, entryIndex, 1);

      if (!exit) continue;

      trades.push({
        date: formatDate(candles[entryIndex].time),
        sector,
        pnl: exit.pnl,
        win: exit.pnl > 0,
      });
    }
  }

  return trades;
}

function aggregateTrades(trades) {
  const map = {};

  for (const t of trades) {
    const key = `${t.date}_${t.sector}`;

    if (!map[key]) {
      map[key] = {
        date: t.date,
        sector: t.sector,
        signals: 0,
        wins: 0,
        losses: 0,
        pnl: 0,
      };
    }

    map[key].signals++;
    map[key].pnl += t.pnl;

    if (t.win) map[key].wins++;
    else map[key].losses++;
  }

  return Object.values(map).map(g => ({
    ...g,
    pnl: g.pnl / g.signals
  }));
}

const ALL_SECTORS = ["store", "l1", "exchange", "payments", "l2", "defi", "infra", "gaming", "alt"];

function formatForChart(data) {
  const map = {};

  for (const d of data) {
    if (!map[d.date]) {
      map[d.date] = { date: d.date };

      ALL_SECTORS.forEach(s => {
        map[d.date][s] = 0;
      });
    }

    map[d.date][d.sector] += d.pnl;
  }

  return Object.values(map);
}

const sectorMap = {
  BTCUSDT: "store",
  ETHUSDT: "l1", SOLUSDT: "l1", ADAUSDT: "l1",
  AVAXUSDT: "l1", NEARUSDT: "l1", APTUSDT: "l1",
  BNBUSDT: "exchange",
  XRPUSDT: "payments", LTCUSDT: "payments", DOGEUSDT: "payments",
  MATICUSDT: "l2", ARBUSDT: "l2", OPUSDT: "l2",
  UNIUSDT: "defi", LINKUSDT: "defi",
  ATOMUSDT: "infra", DOTUSDT: "infra", ICPUSDT: "infra",
  SANDUSDT: "gaming", MANAUSDT: "gaming",
  FTMUSDT: "alt", ALGOUSDT: "alt",
};



const dispatchOrder = async (smartApi, orderInput) => {
  try {
    // ✅ Required fields validation
    const requiredFields = [
      "tradingsymbol",
      "symboltoken",
      "transactiontype",
      "exchange",
      "ordertype",
      "producttype",
      "quantity"
    ];

    for (const field of requiredFields) {
      if (!orderInput[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // ✅ Default values (safe fallbacks)
    const orderParams = {
      variety: orderInput.variety || "NORMAL",
      tradingsymbol: orderInput.tradingsymbol,
      symboltoken: orderInput.symboltoken,
      transactiontype: orderInput.transactiontype.toUpperCase(), // BUY / SELL
      exchange: orderInput.exchange || "NSE",
      ordertype: orderInput.ordertype.toUpperCase(), // MARKET / LIMIT
      producttype: orderInput.producttype || "INTRADAY",
      duration: orderInput.duration || "DAY",
      price: orderInput.price || "0",
      squareoff: orderInput.squareoff || "0",
      stoploss: orderInput.stoploss || "0",
      quantity: String(orderInput.quantity)
    };

    // ✅ Extra validation
    if (orderParams.ordertype === "LIMIT" && (!orderInput.price || orderInput.price == 0)) {
      throw new Error("LIMIT order requires valid price");
    }

    if (Number(orderParams.quantity) <= 0) {
      throw new Error("Quantity must be greater than 0");
    }

    console.log("📤 Dispatching Order:", orderParams);

    // ✅ Place order
    const orderResponse = await smartApi.placeOrder(orderParams);

    console.log("✅ Order Success:", orderResponse);

    return {
      success: true,
      data: orderResponse
    };

  } catch (error) {
    console.error("❌ Order Failed:", error.message);

    return {
      success: false,
      error: error.message
    };
  }
}



const fetchCandles = async (jwtToken) => {

  try {

    const now = new Date();

    const fromDate = new Date(
      now.getTime() - (200 * 60 * 1000)
    );

    const response = await axios.post(
      "https://apiconnect.angelone.in/rest/secure/angelbroking/historical/v1/getCandleData",
      {
        exchange: "MCX",
        symboltoken: 459277,
        interval: "ONE_MINUTE",

        fromdate: formatDate(fromDate),
        todate: formatDate(now)
      },
      {
        headers: {
          Authorization: `Bearer ${jwtToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-UserType": "USER",
          "X-SourceID": "WEB",
          "X-ClientLocalIP": "127.0.0.1",
          "X-ClientPublicIP": "127.0.0.1",
          "X-MACAddress": "00:00:00:00:00:00",
          "X-PrivateKey": "AAAP423969"
        }
      }
    );

    const candles = response?.data?.data;

    /**
     * Angel Candle Format:
     * [
     *   time,
     *   open,
     *   high,
     *   low,
     *   close,
     *   volume
     * ]
     */

    return await candles.map(c => ({
      time: c[0],
      open: Number(c[1]),
      high: Number(c[2]),
      low: Number(c[3]),
      close: Number(c[4]),
      volume: Number(c[5])
    }));

  } catch (error) {

    console.log("CANDLE ERROR");

    console.log(
      error.response?.data || error.message
    );

    return [];
  }
}


function formatDate(date) {

  const pad = (n) => String(n).padStart(2, "0");

  return (
    date.getFullYear() +
    "-" +
    pad(date.getMonth() + 1) +
    "-" +
    pad(date.getDate()) +
    " " +
    pad(date.getHours()) +
    ":" +
    pad(date.getMinutes())
  );
}






module.exports = {
  fetchCandles,
  dispatchOrder,
  sectorMap,
  getExit,
  formatDate,
  shouldEnter,
  backtestSymbol,
  aggregateTrades,
  ALL_SECTORS,
  searchIndicators,
  formatForChart,
  prepareCandlesWithIndicators,
  getLastCandle,
  sendSMS,
  indicatorEngine,
  withDateTime,
  applyScanner, combineMergedIndicators, ALL_INDICATORS, runAllMergeCandleWisthIndicator,
  getScannerDataBySpecificTimeInterval
};