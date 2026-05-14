const { prepareCandlesWithIndicators, dispatchOrder, indicatorEngine, withDateTime } = require('../helper');
const optionChainService = require('../services/optionChainService');
const { getHistoricalCandle } = require('../services/angelOne');
const store = require('../services/marketStore');
const { syncLivePrices, syncCandleData } = require('../services/stockService');
const { Timeframe, Indicator, Order, Candle } = require('../models');
const { SMA } = require('technicalindicators');
const { Sequelize, Op } = require('sequelize');
const { response } = require('express');
const { getIO } = require('../services/socket');
const { calculateRsi } = require('../util/function');
const smartApi = require('../services/smartApi');

const getStocks = (req, res) => {
    const stocksWithPrice = store.stocks.map(s => {
        const key = `${s.name}:${s.segment}`;
        const liveData = store.latestMarketData[key] || {};

        const ltpVal = liveData.last_traded_price || "0.00";
        const closeVal = liveData.close_price || "0.00";
        const ltp = parseFloat(ltpVal);
        const close = parseFloat(closeVal);

        const changeStr = liveData.change || (close > 0 ? ((ltp - close) > 0 ? "+" : "") + (ltp - close).toFixed(2) : "0.00");
        const pChange = liveData.percent_change || (close > 0 ? (((ltp - close) / close) * 100).toFixed(2) : "0.00");

        return {
            ...s,
            ltp: ltpVal,
            change: changeStr,
            percent_change: pChange,
            sentiment: liveData.sentiment || (ltp > close ? "bullish" : ltp < close ? "bearish" : "neutral")
        };
    });

    res.json({
        success: true,
        count: stocksWithPrice.length,
        stocks: stocksWithPrice
    });
};

const getIndices = (req, res) => {
    const indicesData = store.indices.map(s => {
        const key = `${s.name}:${s.segment}`;
        const liveData = store.latestMarketData[key] || store.latestMarketData[s.name] || {};

        const ltpVal = liveData.last_traded_price || liveData.ltp || "0.00";
        const closeVal = liveData.close_price || liveData.close || "0.00";

        const ltp = parseFloat(ltpVal);
        const close = parseFloat(closeVal);
        const rawChange = ltp - close;
        const changeStr = close > 0 ? (rawChange > 0 ? "+" : "") + rawChange.toFixed(2) : "0.00";
        const pChange = close > 0 ? ((rawChange / close) * 100).toFixed(2) : "0.00";

        return {
            ...s,
            ltp: ltpVal,
            change: changeStr,
            percent_change: pChange,
            sentiment: liveData.sentiment || "neutral"
        };
    });

    res.json({
        success: true,
        count: indicesData.length,
        data: indicesData
    });
};

const getLiveEquity = (req, res) => {
    const symbol = req.query.symbol;
    let data = Object.values(store.latestMarketData).filter(d =>
        !d.symbol.includes("CE") && !d.symbol.includes("PE") && !d.symbol.endsWith("FUT")
    );

    if (symbol) {
        const uSym = symbol.toUpperCase().trim();
        const existing = data.filter(d => d.symbol.toUpperCase() === uSym);

        if (existing.length > 0) {
            data = existing;
        } else {
            // Auto-Add to Tracking
            const token = store.symbolToTokenMaster[uSym];
            const exchange = store.tokenToExchange[token] || "NSE";

            if (token && store.wsClient) {
                console.log(`[LiveEquity] Auto-subscribing to: ${uSym} (${token}) on ${exchange}`);
                const exchType = (exchange === "BSE") ? 3 : 1;
                store.wsClient.fetchData({
                    correlationID: `live_eq_add_${uSym}`,
                    action: 1,
                    mode: 2,
                    exchangeType: exchType,
                    tokens: [token]
                });

                const key = `${uSym}:${exchange}`;
                store.latestMarketData[key] = {
                    symbol: uSym,
                    token: token,
                    ltp: "0.00",
                    status: "subscribing...",
                    exchange: exchange
                };
                data = [store.latestMarketData[key]];
            } else {
                data = [];
            }
        }
    }

    res.json({
        success: true,
        data: data
    });
};

const syncLiveEquityToDB = async (req, res) => {
    try {
        const interval = req.query.interval;
        const symbol = req.query.symbol;
        await new Promise(resolve => setTimeout(resolve, 1000)); // Respect Angel One rate limits for long-duration fetches (1 year = ~12 chunks)
        let data;
        let mode;

        if (interval) {
            console.log(`[Sync] Interval detected: ${interval}. Switching to LIVE Candle Sync.`);
            data = await syncCandleData(interval, true, symbol);
            mode = `Live Candle Sync (${interval}${symbol ? ' for ' + symbol : ''})`;
        } else {
            console.log(`[Sync] No interval. Using Live Snapshot (Full Mode).`);
            data = await syncLivePrices(); // Note: syncLivePrices doesn't support symbol yet, but we can add it if needed
            if (symbol) {
                data = data.filter(d => d.symbol.toUpperCase() === symbol.toUpperCase());
            }
            mode = "Live Snapshot (Full Mode)";
        }

        res.json({
            success: true,
            message: `Synced ${data.length} stocks to DB using ${mode}`,
            data: data
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

const syncDynamicCandleData = async (req, res) => {
    try {
        const interval = req.query.interval || "FIVE_MINUTE";
        const symbol = req.query.symbol;
        const data = await syncCandleData(interval, false, symbol);
        res.json({
            success: true,
            message: `Synced last 24h ${interval} candles for ${data.length} stocks`,
            results: data
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

const getLiveOptions = (req, res) => {
    const symbol = req.query.symbol;
    let data = Object.values(store.latestMarketData).filter(d => d.symbol.includes("CE") || d.symbol.includes("PE"));

    if (symbol) {
        const uSym = symbol.toUpperCase().trim();
        const existing = data.filter(d => d.symbol.toUpperCase() === uSym);

        if (existing.length > 0) {
            data = existing;
        } else {
            // Auto-Add to Tracking if found in master
            const option = store.nfoMasterData.find(o => o.symbol === uSym);
            if (option && store.wsClient) {
                console.log(`[LiveOptions] Auto-subscribing to: ${uSym}`);
                const exchType = option.exch_seg === "BFO" ? 4 : 2;
                store.wsClient.fetchData({
                    correlationID: `live_opt_add_${uSym}`,
                    action: 1,
                    mode: 2,
                    exchangeType: exchType,
                    tokens: [option.token]
                });

                const key = `${uSym}:${option.exch_seg}`;
                store.latestMarketData[key] = {
                    symbol: uSym,
                    token: option.token,
                    ltp: "0.00",
                    status: "subscribing...",
                    exchange: option.exch_seg
                };
                data = [store.latestMarketData[key]];
            } else {
                data = [];
            }
        }
    }

    res.json({
        success: true,
        data: data
    });
};

const getLiveFutures = (req, res) => {
    const symbol = req.query.symbol;
    let data = Object.values(store.latestMarketData).filter(d => d.symbol.endsWith("FUT"));

    if (symbol) {
        data = data.filter(d => d.symbol.toUpperCase() === symbol.toUpperCase());
    }

    res.json({
        success: true,
        data: data
    });
};

const getFuturesSymbols = async (req, res) => {
    try {
        const { Future } = require('../models');
        const futures = await Future.findAll({
            order: [['name', 'ASC'], ['expiry', 'ASC']]
        });

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const parseExpiry = (expiryStr) => {
            if (!expiryStr || expiryStr.length < 9) return new Date(0);
            const day = parseInt(expiryStr.substring(0, 2));
            const monthStr = expiryStr.substring(2, 5).toUpperCase();
            const year = parseInt(expiryStr.substring(5, 9));
            const months = {
                'JAN': 0, 'FEB': 1, 'MAR': 2, 'APR': 3, 'MAY': 4, 'JUN': 5,
                'JUL': 6, 'AUG': 7, 'SEP': 8, 'OCT': 9, 'NOV': 10, 'DEC': 11
            };
            return new Date(year, months[monthStr], day);
        };

        const validFutures = futures.filter(f => {
            const expDate = parseExpiry(f.expiry);
            return expDate >= today;
        });

        res.json({
            success: true,
            count: validFutures.length,
            data: validFutures
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};


//indicator details --- IGNORE ---
const indicatorDetails = async (req, res) => {

    try {
        const { type, symbol, interval, period, fromdate, todate, fromDate, toDate, exchange } = req.query;

        const intervalMap = {
            "1": "ONE_MINUTE", "1m": "ONE_MINUTE", "one_minute": "ONE_MINUTE",
            "3": "THREE_MINUTE", "3m": "THREE_MINUTE", "three_minute": "THREE_MINUTE",
            "5": "FIVE_MINUTE", "5m": "FIVE_MINUTE", "five_minute": "FIVE_MINUTE",
            "10": "TEN_MINUTE", "10m": "TEN_MINUTE", "ten_minute": "TEN_MINUTE",
            "15": "FIFTEEN_MINUTE", "15m": "FIFTEEN_MINUTE", "fifteen_minute": "FIFTEEN_MINUTE",
            "30": "THIRTY_MINUTE", "30m": "THIRTY_MINUTE", "thirty_minute": "THIRTY_MINUTE",
            "60": "ONE_HOUR", "1h": "ONE_HOUR", "one_hour": "ONE_HOUR",
            "day": "ONE_DAY", "1d": "ONE_DAY", "d": "ONE_DAY", "one_day": "ONE_DAY"
        };
        const finalInterval = intervalMap[String(interval).toLowerCase()] || interval || "ONE_MINUTE";

        // Normalize parameter names
        const finalFromDate = fromdate || fromDate;
        const finalToDate = todate || toDate;

        const { formatDate, getCandlesWithCache } = require('../services/dbService');

        // Format dates if they are just YYYY-MM-DD
        let formattedFromDate = finalFromDate;
        let formattedToDate = finalToDate;

        if (typeof finalFromDate === 'string' && finalFromDate.length === 10) {
            formattedFromDate = formatDate(new Date(finalFromDate), isCommodity ? "09:00" : "09:15", finalInterval);
        }
        if (typeof finalToDate === 'string' && finalToDate.length === 10) {
            formattedToDate = formatDate(new Date(finalToDate), isCommodity ? "23:55" : "15:30", finalInterval);
        }

        const uSym = symbol.toUpperCase();
        const topStocksMap = {
            "TCS": "11536", "RELIANCE": "2885", "HDFCBANK": "1333", "ICICIBANK": "4963", "INFY": "1594",
            "SBIN": "3045", "BHARTIARTL": "10604", "HINDUNILVR": "1330", "ITC": "1660", "AXISBANK": "5900",
            "KOTAKBANK": "1922", "LT": "11483", "BAJFINANCE": "317", "MARUTI": "10999", "SUNPHARMA": "3351",
            "TITAN": "3506", "ADANIENT": "25", "ADANIPORTS": "15083", "TATAMOTORS": "3456", "TATASTEEL": "3499",
            "GOLD": "234454", "SILVER": "234455"
        };

        const isCommodity = uSym === "GOLD" || uSym === "SILVER";
        const finalExchange = (exchange || (isCommodity ? "MCX" : "NSE")).toUpperCase();
        const mappedExchange = (finalExchange === "NSE" || finalExchange === "NFO") ? "NSE" : (finalExchange === "BSE" || finalExchange === "BFO" ? "BSE" : finalExchange);

        let finalToken = topStocksMap[uSym] || store.symbolToTokenMaster[uSym];
        if (!finalToken) throw new Error(`Token not found for ${symbol}`);

        const result = await getCandlesWithCache(uSym, finalToken, mappedExchange, finalInterval, formattedFromDate, formattedToDate);
        const candles = result.data;

        const { withDateTime } = require('../helper');
        let values = await prepareCandlesWithIndicators(type, candles, res);
        const finalData = withDateTime(values);
        return await res.json({ message: `Indicator fetched by ${type}`, statusCode: 200, data: finalData });

    } catch (error) {
        console.error("[IndicatorDetails] Error:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
}

const updateIndicator = async (req, res) => {

    try {

        if (!req.body && req.body.indicatorType) {
            return await res.json({ statusCode: 403, message: "Type must be defined" });
        } else {
            const { symbol, interval, fromdate, todate, fromDate, toDate, exchange } = req.query;

            const intervalMap = {
                "1": "ONE_MINUTE", "1m": "ONE_MINUTE", "one_minute": "ONE_MINUTE",
                "3": "THREE_MINUTE", "3m": "THREE_MINUTE", "three_minute": "THREE_MINUTE",
                "5": "FIVE_MINUTE", "5m": "FIVE_MINUTE", "five_minute": "FIVE_MINUTE",
                "10": "TEN_MINUTE", "10m": "TEN_MINUTE", "ten_minute": "TEN_MINUTE",
                "15": "FIFTEEN_MINUTE", "15m": "FIFTEEN_MINUTE", "fifteen_minute": "FIFTEEN_MINUTE",
                "30": "THIRTY_MINUTE", "30m": "THIRTY_MINUTE", "thirty_minute": "THIRTY_MINUTE",
                "60": "ONE_HOUR", "1h": "ONE_HOUR", "one_hour": "ONE_HOUR",
                "day": "ONE_DAY", "1d": "ONE_DAY", "d": "ONE_DAY", "one_day": "ONE_DAY"
            };
            const finalInterval = intervalMap[String(interval).toLowerCase()] || interval || "ONE_MINUTE";

            // Normalize parameter names
            const finalFromDate = fromdate || fromDate;
            const finalToDate = todate || toDate;

            const { formatDate, getCandlesWithCache } = require('../services/dbService');

            // Format dates if they are just YYYY-MM-DD
            let formattedFromDate = finalFromDate;
            let formattedToDate = finalToDate;

            if (typeof finalFromDate === 'string' && finalFromDate.length === 10) {
                formattedFromDate = formatDate(new Date(finalFromDate), isCommodity ? "09:00" : "09:15", finalInterval);
            }
            if (typeof finalToDate === 'string' && finalToDate.length === 10) {
                formattedToDate = formatDate(new Date(finalToDate), isCommodity ? "23:55" : "15:30", finalInterval);
            }

            const uSym = symbol.toUpperCase();
            const topStocksMap = {
                "TCS": "11536", "RELIANCE": "2885", "HDFCBANK": "1333", "ICICIBANK": "4963", "INFY": "1594",
                "SBIN": "3045", "BHARTIARTL": "10604", "HINDUNILVR": "1330", "ITC": "1660", "AXISBANK": "5900",
                "KOTAKBANK": "1922", "LT": "11483", "BAJFINANCE": "317", "MARUTI": "10999", "SUNPHARMA": "3351",
                "TITAN": "3506", "ADANIENT": "25", "ADANIPORTS": "15083", "TATAMOTORS": "3456", "TATASTEEL": "3499",
                "GOLD": "234454", "SILVER": "234455"
            };

            const isCommodity = uSym === "GOLD" || uSym === "SILVER";
            const finalExchange = (exchange || (isCommodity ? "MCX" : "NSE")).toUpperCase();
            const mappedExchange = (finalExchange === "NSE" || finalExchange === "NFO") ? "NSE" : (finalExchange === "BSE" || finalExchange === "BFO" ? "BSE" : finalExchange);

            let finalToken = topStocksMap[uSym] || store.symbolToTokenMaster[uSym];
            if (!finalToken) throw new Error(`Token not found for ${symbol}`);

            const candleResult = await getCandlesWithCache(uSym, finalToken, mappedExchange, finalInterval, formattedFromDate, formattedToDate);
            const candles = candleResult.data;

            const body = req.body || {};
            const type = body.type || "RSI";

            let payload = { type };

            switch (type) {

                case "RSI":
                    payload = {
                        type,
                        source: body.source || "close",
                        length: body.length || 14,
                        maType: body.maType || "SMA",
                        maLength: body.maLength || 14,
                        bbStdDev: body.bbStdDev || 2
                    };
                    break;

                case "VWMA":
                    payload = {
                        type,
                        period: body.period || 20,
                        priceKey: body.priceKey || "close",
                        volumeKey: body.volumeKey || "volume"
                    };
                    break;

                case "EMA":
                    payload = {
                        type,
                        source: body.source || "close",
                        length: body.length || 9,
                        offset: body.offset || 0,
                        maLength: body.maLength || 14,
                        maType: body.maType || "none"
                    };
                    break;

                case "SMA":
                    payload = {
                        type,
                        source: body.source || "close",
                        length: body.length || 9,
                        offset: body.offset || 0,
                        maType: body.maType || "none",
                        maLength: body.maLength || "none",
                        bbStdDev: body.bbStdDev || 2

                    };
                    break;

                case "BB":
                    payload = {
                        type,
                        source: body.source || "close",
                        length: body.length || 20,
                        maType: body.maType || "SMA",
                        stdDev: body.stdDev || 2,
                        offset: body.offset || 0
                    };
                    break;

                case "BBW":
                    payload = {
                        type,
                        length: body.length || 20,
                        bbMult: body.bbMult || 2,
                        expansionLength: body.expansionLength || 125,
                        contractionLength: body.contractionLength || 125
                    };
                    break;

                case "MACD":
                    payload = {
                        type,
                        source: body.source || "close",
                        fastLength: body.fastLength || 12,
                        slowLength: body.slowLength || 26,
                        signalLength: body.signalLength || 9,
                        oscillatorMAType: body.oscillatorMAType || "EMA",
                        signalMAType: body.signalMAType || "EMA"
                    };
                    break;

                case "ICHIMOKU":
                    payload = {
                        type,
                        conversionLength: body.conversionLength || 9,
                        baseLength: body.baseLength || 26,
                        spanBLength: body.spanBLength || 52,
                        laggingSpan: body.laggingSpan || 26
                    };
                    break;

                case "ADX":
                    payload = {
                        type,
                        diLength: body.diLength || 14,
                        smoothing: body.smoothing || 14
                    };
                    break;

                case "VWAP":
                    payload = {
                        type,
                        source: body.source || "hlc3",
                        offset: body.offset || 0,
                        anchorPeriod: body.anchorPeriod || "Session",

                        // ✅ NEW
                        calculateMode: body.calculateMode || "CUMULATIVE",
                        hideOnDailyOrAbove: body.hideOnDailyOrAbove ?? false,

                        // ✅ band1, band2, band3
                        band1: body.band1 ?? 1,
                        band2: body.band2 ?? 2,
                        band3: body.band3 ?? 3,

                        // optional (agar use kar raha hai)
                        bandMode: body.bandMode || "STD"
                    };
                    break;

                case "TEMA":
                    payload = {
                        type,
                        source: body.source || "close",
                        length: body.length || 20
                    };
                    break;

                case "DEMA":
                    payload = {
                        type,
                        source: body.source || "close",
                        length: body.length || 20
                    };
                    break;

                case "WMA":
                    payload = {
                        type,
                        source: body.source || "close",
                        length: body.length || 14,
                        offset: body.offset || 0
                    };
                    break;

                case "HMA":
                    payload = {
                        type,
                        source: body.source || "close",
                        length: body.length || 20
                    };
                    break;

                case "KAMA":
                    payload = {
                        type,
                        source: body.source || "close",
                        ERLength: body.ERLength || 10,
                        fastLength: body.fastLength || 2,
                        slowLength: body.slowLength || 30
                    };
                    break;

                case "AO":
                    payload = { type };
                    break;

                case "MOM":
                    payload = {
                        type,
                        source: body.source || "close",
                        length: body.length || 10
                    };
                    break;

                case "ROC":
                    payload = {
                        type,
                        source: body.source || "close",
                        length: body.length || 10
                    };
                    break;

                case "CMO":
                    payload = {
                        type,
                        source: body.source || "close",
                        length: body.length || 14
                    };
                    break;

                case "TRIX":
                    payload = {
                        type,
                        source: body.source || "close",
                        length: body.length || 18
                    };
                    break;

                case "FT":
                    payload = {
                        type,
                        source: body.source || "hl2",
                        length: body.length || 9
                    };
                    break;

                case "KVO":
                    payload = {
                        type,
                        fastLength: body.fastLength || 34,
                        slowLength: body.slowLength || 55,
                        signalLength: body.signalLength || 13
                    };
                    break;

                case "STDDEV":
                    payload = {
                        type,
                        source: body.source || "close",
                        length: body.length || 20
                    };
                    break;

                case "KC":
                    payload = {
                        type,
                        source: body.source || "close",
                        length: body.length || 20,
                        mult: body.mult || 2,
                        useEMA: body.useEMA ?? true,
                        atrLength: body.atrLength || 10
                    };
                    break;

                case "DC":
                    payload = {
                        type,
                        length: body.length || 20,
                        offset: body.offset || 0
                    };
                    break;

                case "HV":
                    payload = {
                        type,
                        length: body.length || 20,
                        intraday: body.intraday ?? false,
                        dailyMultiplier: body.dailyMultiplier || 1
                    };
                    break;

                case "CCI":
                    payload = {
                        type,
                        source: body.source || "hlc3",
                        length: body.length || 20,
                        maType: body.maType || "SMA",
                        maLength: body.maLength || 14,
                        bbstdDev: body.bbstdDev || 2

                    };
                    break;

                case "CHOP":
                    payload = {
                        type,
                        length: body.length || 14,
                        offset: body.offset || 0
                    };
                    break;

                case "VOL":
                    payload = {
                        type,
                        maLength: body.maLength || 20
                    };
                    break;

                case "OBV":
                    payload = {
                        type,
                        maType: body.maType || "None",
                        maLength: body.maLength || 14,
                        bbstdDev: body.bbstdDev || 2,
                        bbLength: body.bbLength || 20
                    };
                    break;

                case "PVO":
                    payload = {
                        type,
                        fastLen: body.fastLen || 12,
                        slowLen: body.slowLen || 26,
                        sigLen: body.sigLen || 9,
                        oscType: body.oscType || "EMA",
                        sigType: body.sigType || "EMA"
                    };
                    break;

                case "AD":
                    payload = { type };
                    break;

                case "CMF":
                    payload = {
                        type,
                        length: body.length || 20
                    };
                    break;

                case "MFI":
                    payload = {
                        type,
                        length: body.length || 14
                    };
                    break;

                case "EOM":
                    payload = {
                        type,
                        length: body.length || 14,
                        divisor: body.divisor || 10000
                    };
                    break;

                case "NVI":
                    payload = {
                        type,
                        length: body.length || 255,
                        maLength: body.maLength || 255
                    };
                    break;

                case "PVI":
                    payload = {
                        type,
                        length: body.length || 255,
                        maLength: body.maLength || 255
                    };
                    break;

                case "VPVR":
                    payload = { type };
                    break;

                case "VPS":
                    payload = {
                        type,
                        start: body.start || 0,
                        end: body.end || 100,
                        rows: body.rows || 24,
                        valueAreaPercent: body.valueAreaPercent || 70
                    };
                    break;

                case "VPFR":
                    payload = {
                        type,
                        from: body.from || 0,
                        to: body.to || 100,
                        rows: body.rows || 24,
                        valueAreaPercent: body.valueAreaPercent || 70
                    };
                    break;

                case "VP":
                    payload = {
                        type,
                        source: body.source || "close",
                        lookback: body.lookback || 100,
                        rows: body.rows || 24,
                        valueArea: body.valueArea || 70
                    };
                    break;

                case "SUPERTREND":
                    payload = {
                        type,
                        atrPeriod: body.atrLength || 10,
                        factor: body.factor || 3,
                    };
                    break;

                case "CAMARILLA":
                    payload = {
                        type,
                        timeframe: body.timeframe || "D"
                    };
                    break;

                case "CKS":
                    payload = {
                        type,
                        atrPeriod: body.atrPeriod || 10,
                        atrMultiplier: body.atrMultiplier || 3,
                        stopLength: body.stopLength || 10
                    };
                    break;

                case "PSAR":
                    payload = {
                        type,
                        start: body.start || 0.02,
                        increment: body.increment || 0.02,
                        maximum: body.maximum || 0.2
                    };
                    break;

                case "AROON":
                    payload = {
                        type,
                        length: body.length || 14
                    };
                    break;

                case "STOCHRSI":
                    payload = {
                        type,
                        source: body.source || "close",
                        length: body.length || 14,
                        lengthStoch: body.lengthRSI || 14,
                        smoothK: body.kSmoothing || 3,
                        smoothD: body.dSmoothing || 3
                    };
                    break;

                case "STOCH":
                    payload = {
                        type,
                        kLength: body?.kLength || 14,
                        kSmoothing: body?.kSmoothing || 1,
                        dSmoothing: body.dSmoothing || 3
                    }
                    break;
                case "WPR":
                    payload = {
                        type,
                        source: body.source || "close",
                        length: body.length || 14
                    };
                    break;

                case "ATR":
                    payload = {
                        type,
                        length: body.length || 14,
                        smoothing: body.smoothing || "RMA"
                    };
                    break;

                case "UO":
                    payload = {
                        type,
                        length1: body.length1 || 7,
                        length2: body.length2 || 14,
                        length3: body.length3 || 28
                    };
                    break;

                case "ZIGZAG":
                    payload = {
                        type,
                        deviation: body.deviation || 5,
                        depth: body.depth || 10
                    };
                    break;

                default:
                    return res.send({ message: "Indicators not supported" });
            }

            const result = await indicatorEngine(candles, payload);

            // let PropControl = await prepareCandlesWithIndicators(type, candles, req.body);
            return await res.json({ message: `Indicator has been updated by ${req.body.type}`, statusCode: 200, data: result });
        }
    } catch (error) {
        console.log(error, "---------------------------06578987546789")
    }
}


const getTimeFrames = async (req, res) => {
    try {
        const timeframes = await Timeframe.findAll({ order: [["seconds", "ASC"]] });
        const grouped = timeframes.reduce((acc, tf) => {
            acc[tf.category] ??= [];
            acc[tf.category].push({
                label: tf.label,
                value: tf.value,
                seconds: tf.seconds
            });
            return acc;
        }, {});

        return await res.json({ statusCode: 200, message: 'Timeframes fetched successfully', data: grouped });
    } catch (error) {
        console.log(error, "-097658097658")
    }
}

const getIndicators = async (req, res) => {
    try {

        let findIndicators = await Indicator.findAll({});
        // let customIndicator = await CustomIndicator.findAll({
        //     order: [['createdAt', 'ASC']]
        // });
        // return res.send(customIndicator);

        // const divider = { type: "-----------------------------Custom Indicator-----------------------------" };

        // Combine data: standard indicators → divider → custom indicators
        // const response = [
        //     ...findIndicators,
        //    customIndicator 
        // ];


        const { q } = req.query;
        if (q) {
            const result = await findIndicators.filter((vall) => vall?.label == q);
            return await res.json({ statusCode: 200, message: 'Indicators fetched successfully', query: q, data: result });
        }
        else {
            return await res.json({ statusCode: 200, message: 'Indicators fetched successfully', query: q, data: findIndicators });
        }
    } catch (error) {
        console.log(error);
    }
}

const orderDispatch = async (req, res) => {
    try {
        if (!req.body || !req.body.tradingsymbol || !req.body.symboltoken || !req.body.transactiontype || !req.body.ordertype || !req.body.price || !req.body.quantity) {
            return await res.status(400).json({ statusCode: 400, message: 'Missing required fields in the request body' });
        } else {
            const { smartApi } = req.angel;

            const { tradingsymbol, symboltoken, transactiontype, ordertype, price, quantity, exchange, producttype, duration, variety, squareoff, stoploss } = req.body;
            let payload = {
                tradingsymbol: tradingsymbol,
                symboltoken: symboltoken,
                transactiontype: transactiontype,
                exchange: exchange,
                ordertype: ordertype,
                producttype: producttype,
                duration: duration,
                price: price,
                quantity: quantity,
                variety: variety,
                squareoff: squareoff,
                stoploss: stoploss
            };

            const dispatchResult = await dispatchOrder(smartApi, payload);
            return res.send(dispatchResult);

            // Extract the actual Angel One API response
            // const angelResponse = dispatchResult?.data;

            // ⚠️ Safety check (API fail case)
            // if (!dispatchResult || !dispatchResult.data || !dispatchResult.data.orderid) {
            //     return res.status(500).json({
            //         statusCode: 500,
            //         message: 'Order dispatch failed',
            //         data: dispatchResult
            //     });
            // }


            // return res.sen/d(dispatchResult);

            // 🔹 2. Save in DB
            const savedOrder = await Order.create({
                order_id: dispatchResult?.data?.data?.orderid,
                user_id: req.user.id,
                // client_id: dispatchResult?.data?.data?.clientid,
                strike_price: req.body.strike_price,
                expirey_date: req.body.expirey_date,
                uniqueorderid: dispatchResult?.data?.data?.uniqueorderid,
                tradingsymbol: tradingsymbol,
                symboltoken: symboltoken,
                transactiontype: transactiontype,
                ordertype: ordertype,
                price: price,
                quantity: quantity,
                exchange: exchange,
                product_type: producttype,
                duration: duration,
                status: 'OPEN',
                status_message: dispatchResult?.message || null,
                order_time: new Date(),
                raw_response: dispatchResult
            });

            // 🔹 3. Response
            return res.json({
                statusCode: 200,
                message: 'Order dispatched & saved successfully',
                data: {
                    order: savedOrder,
                    broker: dispatchResult
                }
            });

            return await res.json({ statusCode: 200, message: 'Order dispatched successfully', data: dispatchResult });
        }
    } catch (error) {
        console.error("Order Dispatch Error:", error);

        return res.status(500).json({
            statusCode: 500,
            message: 'Internal Server Error',
            error: error.message
        });
    }
}

const fetchOrders = async (req, res) => {
    try {
        const userId = req.user.id;
        const orders = await Order.findAll({
            where: { user_id: userId },
            order: [['order_time', 'DESC']],
            limit: 100
        });

        res.json({
            statusCode: 200,
            message: "Orders fetched successfully",
            data: orders
        });
    } catch (error) {
        console.error("Error fetching orders:", error);
        res.status(500).json({
            statusCode: 500,
            message: "Failed to fetch orders",
            error: error.message
        });
    }
};

const getOptionsChain = async (req, res) => {
    try {
        const { symbol, expiry } = req.query;
        if (!symbol) return res.status(400).json({ success: false, message: "Symbol is required" });

        const uSym = symbol.toUpperCase().trim();

        // 1. Get Underlying LTP
        // Try exact match first, then partial match if needed
        let stockEntry = store.stocks.find(s => s.name === uSym || s.userCode === uSym);
        const underlyingKey = stockEntry?.segment === "BSE" ? `${uSym}:BSE` : `${uSym}:NSE`;
        const underlyingData = store.latestMarketData[underlyingKey] || store.latestMarketData[uSym] || {};
        const underlyingLtp = parseFloat(underlyingData.last_traded_price || underlyingData.ltp || 0);

        // 2. Filter Master Data for this symbol's options (Exact name match)
        const allOptions = store.nfoMasterData.filter(o =>
            (o.name === uSym) && (o.instrumenttype === "OPTIDX" || o.instrumenttype === "OPTSTK")
        );

        if (allOptions.length === 0) {
            return res.status(404).json({ success: false, message: `No options found for ${uSym}` });
        }

        // 3. Get Expiries and choose one (Filter out past expiries)
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const uniqueExpiries = [...new Set(allOptions.map(o => o.expiry))]
            .filter(e => {
                const expDate = new Date(e);
                return expDate >= today;
            })
            .sort((a, b) => new Date(a) - new Date(b))
            .slice(0, 4); // Show only top 4 near-term expiries (Near, Next, Far + 1)
        const selectedExpiry = expiry || uniqueExpiries[0];

        // 4. Filter for selected expiry and group by strike
        const expiryOptions = allOptions.filter(o => o.expiry === selectedExpiry);
        const strikeMap = {};

        expiryOptions.forEach(o => {
            const strike = parseFloat(o.strike) / 100;
            if (!strikeMap[strike]) strikeMap[strike] = { strike, call: null, put: null };

            if (o.symbol.endsWith("CE")) strikeMap[strike].call = o;
            else if (o.symbol.endsWith("PE")) strikeMap[strike].put = o;
        });

        const strikes = Object.values(strikeMap).sort((a, b) => a.strike - b.strike);

        // 5. Fetch Live Data for all tokens in batches of 50
        const allTokens = expiryOptions.map(o => o.token);
        const liveMarketMap = {};

        // -- DB FALLBACK FOR OFF-HOURS --
        const { DailyOptionData } = require('../models');
        const todayStr = new Date().toISOString().split('T')[0];
        try {
            const dbFallbackData = await DailyOptionData.findAll({
                where: { token: allTokens, timestamp: todayStr },
                raw: true
            });
            dbFallbackData.forEach(d => {
                liveMarketMap[d.token] = {
                    ltp: d.ltp,
                    close: d.close,
                    opnInterest: d.oi,
                    tradeVolume: d.volume,
                    depth: {
                        buy: [{ price: d.bidPrice, quantity: d.bidQty }],
                        sell: [{ price: d.askPrice, quantity: d.askQty }]
                    }
                };
            });
        } catch(e) {
            console.error("[OptionChain REST] DB Fallback fetch failed:", e.message);
        }

        const batchSize = 50;
        for (let i = 0; i < allTokens.length; i += batchSize) {
            const batch = allTokens.slice(i, i + batchSize);
            try {
                // Check if we are inside market hours, if not and we have db data, we can skip API to save time
                // But let's just query API anyway to be safe, it will just return empty if closed
                const marketRes = await smartApi.marketData({
                    mode: "FULL",
                    exchangeTokens: { "NFO": batch }
                });

                if (marketRes?.data?.fetched) {
                    marketRes.data.fetched.forEach(item => {
                        liveMarketMap[item.symbolToken] = item; // API overwrites DB
                    });
                }
            } catch (err) {
                console.error(`[OptionChain] Batch ${i} failed:`, err.message);
            }
        }

        // 6. Format Final Response
        const finalChain = strikes.map(s => {
            const formatData = (opt) => {
                if (!opt) return null;
                const live = liveMarketMap[opt.token] || {};
                const ltp = parseFloat(live.ltp || 0);
                const close = parseFloat(live.close || 0);
                return {
                    symbol: opt.symbol,
                    token: opt.token,
                    ltp: ltp.toFixed(2),
                    change: (ltp - close).toFixed(2),
                    pChange: close > 0 ? (((ltp - close) / close) * 100).toFixed(2) : "0.00",
                    oi: live.opnInterest || "0",
                    oiChange: "0", // Angel One doesn't provide OI change directly in marketData
                    volume: live.tradeVolume || "0",
                    iv: "0", // IV not available in standard marketData
                    bidPrice: live.depth?.buy?.[0]?.price || "0",
                    askPrice: live.depth?.sell?.[0]?.price || "0",
                    bidQty: live.depth?.buy?.[0]?.quantity || "0",
                    askQty: live.depth?.sell?.[0]?.quantity || "0"
                };
            };

            return {
                strike: s.strike,
                isATM: Math.abs(s.strike - underlyingLtp) < (strikes[1].strike - strikes[0].strike) / 2, // Simple ATM logic
                call: formatData(s.call),
                put: formatData(s.put)
            };
        });

        res.json({
            success: true,
            symbol: uSym,
            underlyingLtp,
            expiry: selectedExpiry,
            allExpiries: uniqueExpiries,
            count: finalChain.length,
            chain: finalChain
        });

    } catch (error) {
        console.error("Error in getOptionsChain:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

const syncOptionsChainHistory = async (req, res) => {
    try {
        const { symbol, interval = "FIVE_MINUTE" } = req.body;
        if (!symbol) return res.status(400).json({ success: false, message: "Symbol is required" });

        const { fetchTop200Stocks } = require('../services/stockService');
        if (!store.nfoMasterData || store.nfoMasterData.length === 0) {
            console.log("[OptionSync] NFO Master Data empty, fetching...");
            await fetchTop200Stocks();
        }

        const uSym = symbol.toUpperCase().trim();
        const allOptions = store.nfoMasterData.filter(o =>
            (o.name === uSym || o.symbol.startsWith(uSym)) && (o.instrumenttype === "OPTIDX" || o.instrumenttype === "OPTSTK")
        );

        console.log(`[OptionSync] Found ${allOptions.length} options for ${uSym} in master data.`);

        if (allOptions.length === 0) {
            return res.status(404).json({
                success: false,
                message: `No options found for ${uSym}. Make sure master data is loaded.`,
                masterDataSize: store.nfoMasterData.length
            });
        }

        // Run in background to avoid timeout
        const startSync = async () => {
            const { syncFullHistoryForSymbol } = require('../services/optionSyncService');
            await syncFullHistoryForSymbol(uSym, 12);
        };
        startSync();

        res.json({
            status: true,
            message: `Started background sync for ${allOptions.length} contracts of ${uSym}. This may take a few minutes.`
        });
    } catch (error) {
        console.error("Error in syncOptionsChainHistory:", error);
        res.status(500).json({ status: false, message: error.message });
    }
};

const getHistoricalOptionChain = async (req, res) => {
    try {
        let { symbol, timestamp, fromDate, toDate, fromdate, todate, interval = "FIVE_MINUTE" } = req.query;
        if (!symbol) {
            return res.status(400).json({ success: false, message: "Symbol is required" });
        }

        const { formatDate } = require('../services/dbService');

        let finalFromDate = fromDate || fromdate;
        let finalToDate = toDate || todate;

        if (!timestamp && (!finalFromDate || !finalToDate)) {
            return res.status(400).json({ success: false, message: "Either 'timestamp' OR 'fromDate' and 'toDate' are required" });
        }

        // Auto-append market times if only Date (YYYY-MM-DD) is provided
        if (finalFromDate && finalFromDate.length === 10) {
            finalFromDate = formatDate(new Date(finalFromDate), "09:15", interval);
        }
        if (finalToDate && finalToDate.length === 10) {
            finalToDate = formatDate(new Date(finalToDate), "15:30", interval);
        }

        const uSym = symbol.toUpperCase().trim();
        const { OptionChain } = require('../models');

        // 1. Fetch all matching contracts from master data
        const allOptions = store.nfoMasterData.filter(o =>
            (o.name === uSym || o.symbol.startsWith(uSym)) && (o.instrumenttype === "OPTIDX" || o.instrumenttype === "OPTSTK")
        );

        // 2. Query DB for candles
        const whereClause = {
            underlying: uSym,
            interval: interval
        };

        if (timestamp) {
            whereClause.timestamp = new Date(timestamp);
        } else {
            whereClause.timestamp = {
                [Op.between]: [new Date(finalFromDate), new Date(finalToDate)]
            };
        }

        const candles = await OptionChain.findAll({
            where: whereClause,
            order: [['timestamp', 'ASC']]
        });

        if (candles.length === 0) {
            return res.status(404).json({
                status: false,
                message: `No historical data found in database for ${uSym}. Make sure to sync data first.`
            });
        }

        // 3. Group by timestamp
        const groupedByTime = {};

        candles.forEach(c => {
            const timeKey = c.timestamp.toISOString();
            if (!groupedByTime[timeKey]) {
                groupedByTime[timeKey] = {}; // strikeMap for this timestamp
            }

            const opt = allOptions.find(o => o.token === c.token);
            if (!opt) return;

            const strike = parseFloat(opt.strike) / 100;
            if (!groupedByTime[timeKey][strike]) {
                groupedByTime[timeKey][strike] = { strike, call: null, put: null };
            }

            const formatted = {
                symbol: opt.symbol,
                token: opt.token,
                open: c.open,
                high: c.high,
                low: c.low,
                close: c.close,
                volume: c.volume
            };

            if (opt.symbol.endsWith("CE")) groupedByTime[timeKey][strike].call = formatted;
            else if (opt.symbol.endsWith("PE")) groupedByTime[timeKey][strike].put = formatted;
        });

        // 4. Format output
        const allTimestamps = Object.keys(groupedByTime).sort();
        const totalTimestamps = allTimestamps.length;
        const dataRangeFrom = totalTimestamps > 0 ? allTimestamps[0] : null;
        const dataRangeTo = totalTimestamps > 0 ? allTimestamps[totalTimestamps - 1] : null;

        // If only a single timestamp was requested, return a simplified structure
        if (timestamp && totalTimestamps === 1) {
            const timeKey = allTimestamps[0];
            const sortedChain = Object.values(groupedByTime[timeKey]).sort((a, b) => a.strike - b.strike);
            return res.json({
                status: true,
                symbol: uSym,
                timestamp: timeKey,
                count: sortedChain.length,
                chain: sortedChain
            });
        }

        res.json({
            status: true,
            metadata: {
                symbol: uSym,
                interval: interval,
                totalTimestamps: totalTimestamps,
                dataRangeFrom: dataRangeFrom,
                dataRangeTo: dataRangeTo,
                requestedRange: { from: fromDate, to: toDate }
            },
            data: groupedByTime
        });
    } catch (error) {
        console.error("Error in getHistoricalOptionChain:", error);
        res.status(500).json({ status: false, message: error.message });
    }
};

const getStockOverview = async (req, res) => {
    try {
        const { symbol, exchange = "NSE" } = req.query;
        if (!symbol) return res.status(400).json({ success: false, message: "Symbol is required" });

        const uSym = symbol.toUpperCase().trim();
        const exch = exchange.toUpperCase().trim();

        // Find token
        let token = null;
        if (exch === "NSE" || exch === "BSE") {
            token = store.symbolToTokenMaster[uSym] || store.symbolToTokenMaster[`${uSym}_${exch}`];
            if (!token) {
                const stock = store.stocks.find(s => s.name === uSym && s.segment === exch);
                if (stock) token = stock.token;
            }
        } else {
            const nfoStock = store.nfoMasterData.find(f => f.symbol === uSym && f.exch_seg === exch);
            if (nfoStock) token = nfoStock.token;
        }

        if (!token) {
            return res.status(404).json({ success: false, message: `Symbol ${uSym} not found on ${exch}` });
        }

        const smartApi = require('../services/smartApi');
        if (!smartApi.access_token) {
            return res.status(503).json({ success: false, message: "API still authenticating..." });
        }

        // Fetch FULL market data
        const payload = {
            mode: "FULL",
            exchangeTokens: {
                [exch]: [token]
            }
        };

        const response = await smartApi.marketData(payload);

        if (response && response.status && response.data && response.data.fetched && response.data.fetched.length > 0) {
            const raw = response.data.fetched[0];

            // Format to match user requested profile
            const profile = {
                symbol: uSym,
                exchange: exch,
                activity: {
                    open: raw.open,
                    high: raw.high,
                    low: raw.low,
                    close: raw.close,
                    ltp: raw.ltp
                },
                priceDetails: {
                    averagePrice: raw.avgPrice || 0, // Average Trade Price
                    volume: raw.tradeVolume || 0,        // Volume
                    openInterest: raw.opnInterest || 0,
                    bid: raw.depth && raw.depth.buy && raw.depth.buy.length > 0 ? raw.depth.buy[0].price : 0,
                    ask: raw.depth && raw.depth.sell && raw.depth.sell.length > 0 ? raw.depth.sell[0].price : 0
                },
                circuitLimits: {
                    lower: raw.lowerCircuit || 0,
                    upper: raw.upperCircuit || 0
                },
                fiftyTwoWeek: {
                    low: raw["52WeekLow"] || 0,
                    high: raw["52WeekHigh"] || 0
                },
                raw_data: raw // keeping raw data just in case
            };

            return res.json({ success: true, data: profile });
        } else {
            return res.status(400).json({ success: false, message: "Could not fetch market data from API" });
        }
    } catch (err) {
        console.error("Error in getStockOverview:", err);
        return res.status(500).json({ success: false, error: err.message });
    }
};

const getRSIScanner = async (req, res) => {
    try {
        const { calculateRSIIndicator } = require('../Indicators/rsi-indicator');
        const { Candle } = require('../models');

        // 1. Get Dynamic Parameters
        const { rsi_threshold = 60 } = req.body;
        const { interval = '5m', fromDate, toDate } = req.query;

        // 2. Map Interval
        const intervalMap = {
            "1m": "ONE_MINUTE", "3m": "THREE_MINUTE", "5m": "FIVE_MINUTE",
            "15m": "FIFTEEN_MINUTE", "30m": "THIRTY_MINUTE", "1h": "ONE_HOUR", "1d": "ONE_DAY"
        };
        const dbInterval = intervalMap[interval.toLowerCase()] || "FIVE_MINUTE";
        const threshold = parseFloat(rsi_threshold);

        const results = [];
        console.log(`[Scanner] Running Custom RSI > ${threshold} scan on ${dbInterval}...`);

        // Helper to enrich with live or historical data
        const enrichWithMarketData = (symbol, segment, extra, historicalLtp = null) => {
            const key = `${symbol}:${segment}`;
            const liveData = store.latestMarketData[key] || {};

            // If historical scan, use the historical close price
            const ltp = historicalLtp !== null ? parseFloat(historicalLtp) : parseFloat(liveData.last_traded_price || 0);
            const close = parseFloat(liveData.close_price || 0); // Previous day close (might be inaccurate for deep history, but standard for scanner)

            const rawChange = historicalLtp !== null ? 0 : (ltp - close); // For historical, change relative to itself is 0 unless we fetch prev candle
            const changeStr = historicalLtp === null ? (close > 0 ? (rawChange > 0 ? "+" : "") + rawChange.toFixed(2) : "0.00") : "0.00";
            const pChange = historicalLtp === null ? (close > 0 ? ((rawChange / close) * 100).toFixed(2) : "0.00") : "0.00";

            return {
                symbol,
                segment,
                ...extra,
                ltp: ltp.toFixed(2),
                change: changeStr,
                percent_change: pChange,
                sentiment: historicalLtp ? "historical" : (liveData.sentiment || "neutral")
            };
        };

        // 3. Scan Equities
        for (const stock of store.stocks) {
            try {
                const whereClause = { symbol: stock.name, interval: dbInterval };
                if (fromDate && toDate) {
                    const toDateObj = new Date(toDate);
                    toDateObj.setHours(23, 59, 59, 999); // Include end of day
                    whereClause.timestamp = { [Op.between]: [new Date(fromDate), toDateObj] };
                } else if (toDate) {
                    const toDateObj = new Date(toDate);
                    toDateObj.setHours(23, 59, 59, 999);
                    whereClause.timestamp = { [Op.lte]: toDateObj };
                }

                const candles = await Candle.findAll({
                    where: whereClause,
                    order: [['timestamp', 'DESC']],
                    limit: 100
                });

                if (candles.length >= 14) {
                    const chronCandles = candles.reverse();
                    const rsiData = await calculateRSIIndicator(chronCandles, { length: 14 });
                    const currentRSI = rsiData[rsiData.length - 1].rsi;
                    const histLtp = (fromDate || toDate) ? chronCandles[chronCandles.length - 1].close : null;

                    if (currentRSI > threshold) {
                        results.push(enrichWithMarketData(stock.name, stock.segment, {
                            rsi: currentRSI.toFixed(2),
                            type: 'EQUITY'
                        }, histLtp));
                    }
                }
            } catch (e) {
                // ignore
                console.error(e)
            }
        }

        // 4. Scan Futures (Disabled per user request)
        // const stockNames = store.stocks.map(s => s.name);
        // for (const name of stockNames) { ... }

        res.json({
            success: true,
            parameters: { interval: interval, threshold: threshold, fromDate, toDate },
            count: results.length,
            data: results
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

const getLiveGold = async (req, res) => {
    try {
        const smartApi = require('../services/smartApi');
        const store = require('../services/marketStore');

        // Search for Gold Futures contracts in MCX
        const goldContracts = (store.mcxMasterData || []).filter(s =>
            (s.name === 'GOLD' || s.name === 'GOLDM' || s.name === 'GOLDPETAL' || s.name === 'GOLDGUINEA') &&
            s.instrumenttype === 'FUTCOM'
        );

        if (goldContracts.length === 0) {
            return res.status(404).json({ success: false, message: "No Gold futures found in MCX master data." });
        }


        // Group by name (e.g., GOLD, GOLDM) and pick the nearest active expiry for each
        const nearestContracts = {};
        const todayForExpiry = new Date();
        todayForExpiry.setHours(0, 0, 0, 0);

        for (const contract of goldContracts) {
            const expDate = new Date(contract.expiry);
            if (expDate < todayForExpiry) continue; // Skip expired

            if (!nearestContracts[contract.name]) {
                nearestContracts[contract.name] = contract;
            } else {
                const currentExpiry = new Date(nearestContracts[contract.name].expiry);
                if (expDate < currentExpiry) {
                    nearestContracts[contract.name] = contract;
                }
            }
        }

        const { fromDate, toDate, interval = "1d" } = req.query;

        // Map common interval strings to Angel One format
        const intervalMap = {
            "1m": "ONE_MINUTE", "3m": "THREE_MINUTE", "5m": "FIVE_MINUTE",
            "15m": "FIFTEEN_MINUTE", "30m": "THIRTY_MINUTE", "1h": "ONE_HOUR", "1d": "ONE_DAY"
        };
        const apiInterval = intervalMap[interval.toLowerCase()] || "ONE_DAY";

        // Default dates if not provided
        const tDate = toDate ? new Date(toDate) : new Date();
        const fDate = fromDate ? new Date(fromDate) : new Date();
        if (!fromDate) {
            fDate.setDate(tDate.getDate() - 30);
        }

        // Use 23:59 for the end date to ensure we get the latest data for that day
        const tDateStr = tDate.toISOString().split('T')[0] + " 23:59";
        const fDateStr = fDate.toISOString().split('T')[0] + " 00:00";


        const { getHistoricalCandle } = require('../services/angelOne');

        const results = [];
        for (const contract of Object.values(nearestContracts)) {
            try {
                const candles = await getHistoricalCandle({
                    symbol: contract.symbol,
                    interval: apiInterval,
                    fromDate: fDateStr,
                    toDate: tDateStr,
                    exchange: "MCX",
                    symboltoken: contract.token,
                    skipSave: true
                });

                if (candles && candles.length > 0) {
                    // Add IST Time for clarity
                    const enrichedCandles = candles.map(c => {
                        const istDate = new Date(c.timestamp);
                        istDate.setMinutes(istDate.getMinutes() + 330); // UTC to IST
                        return {
                            ...c,
                            timeIST: istDate.toISOString().replace('T', ' ').split('.')[0]
                        };
                    });

                    results.push({
                        name: contract.name,
                        symbol: contract.symbol,
                        token: contract.token,
                        expiry: contract.expiry,
                        exchange: "MCX",
                        data: enrichedCandles
                    });
                }
            } catch (err) {
                console.error(`Failed to fetch historical data for ${contract.symbol}`, err);
            }
        }

        return res.json({
            success: true,
            parameters: { interval: apiInterval, fromDate: fDateStr, toDate: tDateStr },
            count: results.length,
            data: results
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

const debugStore = (req, res) => {
    return res.json({
        nfoMasterCount: store.nfoMasterData.length,
        stocksCount: store.stocks.length,
        latestPriceKeys: Object.keys(store.latestMarketData).slice(0, 10),
        sampleMaster: store.nfoMasterData.slice(0, 2).map(o => ({ name: o.name, symbol: o.symbol, instrument: o.instrumenttype }))
    });
};

const triggerOptionSnapshot = async (req, res) => {
    try {
        const { symbols } = req.query;
        let symList;

        if (symbols) {
            symList = symbols.split(',');
        } else {
            // Default to ALL Indices + ALL Loaded Stocks
            const stockNames = store.stocks.map(s => s.name);
            const indices = ["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "SENSEX"];
            symList = [...new Set([...indices, ...stockNames])];
        }

        // Fire and forget so request doesn't timeout
        optionChainService.saveDailySnapshot(symList);

        return res.json({
            success: true,
            message: `Option chain snapshot triggered for ${symList.length} symbols.`,
            symbols: symList.slice(0, 10).concat("...")
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};

const getTrendingOptions = async (req, res) => {
    try {
        let { symbol = "NIFTY", type = "CALL" } = req.query;
        symbol = symbol.toUpperCase();
        type = type.toUpperCase();

        const suffix = type === "CALL" ? "CE" : "PE";

        // 1. Get Underlying LTP
        const underlyingToken = store.symbolToTokenMaster[symbol];
        const underlyingKey = `${symbol}:${store.tokenToExchange[underlyingToken] || "NSE"}`;
        const underlyingLtp = parseFloat(store.latestMarketData[underlyingKey]?.last_traded_price || 0);

        if (underlyingLtp === 0) {
            return res.status(404).json({ success: false, error: `Live price for ${symbol} not found.` });
        }

        // 2. Filter Master Data for this symbol and type
        const contracts = store.nfoMasterData.filter(o => o.name === symbol && o.symbol.endsWith(suffix));

        if (contracts.length === 0) {
            return res.status(404).json({ success: false, error: `No ${type} options found for ${symbol}.` });
        }

        // 3. Find unique expiries and pick the nearest one
        const expiries = [...new Set(contracts.map(c => c.expiry))].sort((a, b) => new Date(a) - new Date(b));
        const nearestExpiry = expiries[0];

        // 4. Filter for nearest expiry and find strikes near ATM
        const nearExpiryContracts = contracts.filter(c => c.expiry === nearestExpiry);

        // Sort by strike to find ATM
        nearExpiryContracts.sort((a, b) => parseFloat(a.strike) - parseFloat(b.strike));

        // Find ATM index
        let atmIndex = nearExpiryContracts.findIndex(c => parseFloat(c.strike) >= underlyingLtp);
        if (atmIndex === -1) atmIndex = nearExpiryContracts.length - 1;

        // Take 3-5 strikes near ATM
        const start = Math.max(0, atmIndex - 2);
        const selectedContracts = nearExpiryContracts.slice(start, start + 5);

        // 5. Fetch Live Data for these tokens
        const tokens = selectedContracts.map(c => c.token);
        const livePrices = await optionChainService.getLivePricesForTokens(tokens);

        // 6. Format Response
        const data = selectedContracts.map(c => {
            const live = livePrices[c.token] || {};
            const ltp = parseFloat(live.last_traded_price || 0);
            const close = parseFloat(live.close_price || 0);
            const rawChange = ltp - close;
            const changeStr = close > 0 ? (rawChange > 0 ? "+" : "") + rawChange.toFixed(2) : "0.00";
            const pChange = close > 0 ? ((rawChange / close) * 100).toFixed(2) : "0.00";

            // Format date for display: 12MAY2026 -> 12 May 2026
            const day = c.expiry.substring(0, 2);
            const mon = c.expiry.substring(2, 5).toLowerCase();
            const year = c.expiry.substring(5);
            const months = { jan: 'Jan', feb: 'Feb', mar: 'Mar', apr: 'Apr', may: 'May', jun: 'Jun', jul: 'Jul', aug: 'Aug', sep: 'Sep', oct: 'Oct', nov: 'Nov', dec: 'Dec' };
            const formattedDate = `${day} ${months[mon]} ${year}`;

            return {
                displayName: `${c.name} ${formattedDate} ${parseFloat(c.strike)} ${suffix}`,
                symbol: c.symbol,
                token: c.token,
                exchange: "NSE FO",
                ltp: ltp.toFixed(2),
                change: changeStr,
                pChange: pChange,
                strike: c.strike,
                optionType: suffix
            };
        });

        res.json({
            success: true,
            symbol,
            type,
            expiry: nearestExpiry,
            data
        });

    } catch (error) {
        console.error("getTrendingOptions Error:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};


const getFormattedOptionChain = async (req, res) => {
    try {
        const { symbol, expiry } = req.query;
        if (!symbol) {
            return res.status(400).json({ success: false, error: "Symbol is required." });
        }
        const data = await optionChainService.getFormattedOptionChain(symbol, expiry);
        return res.json(data);
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};

const generateMasterWatchlistData = async () => {
    try {
        const formatItem = (item, isIndex = false) => {
            const exchange = isIndex ? "NSE" : (item.segment || "NSE");
            const key = `${item.name}:${exchange}`;

            // Try key-based lookup first
            let liveData = store.latestMarketData[key];

            // Fallback: search by token if key lookup fails
            if (!liveData && item.token) {
                liveData = Object.values(store.latestMarketData).find(d => String(d.token) === String(item.token));
            }

            if (!liveData) liveData = {};

            const ltpVal = liveData.last_traded_price || liveData.ltp || "0.00";
            const closeVal = liveData.close_price || liveData.close || "0.00";
            const ltp = parseFloat(ltpVal);
            const close = parseFloat(closeVal);

            let changeStr = liveData.change || "0.00";
            let pChange = liveData.percent_change || liveData.pChange || "0.00";

            // Recalculate if we have LTP and Close but no change (happens on some API responses)
            if (ltp !== 0 && close !== 0 && (changeStr === "0.00" || changeStr === "0")) {
                const diff = ltp - close;
                changeStr = (diff >= 0 ? "+" : "") + diff.toFixed(2);
                pChange = ((diff / close) * 100).toFixed(2);
            }

            return {
                name: item.name,
                token: item.token,
                ltp: ltpVal,
                change: changeStr,
                pChange: pChange,
                segment: item.segment || "NSE",
                isOptionable: !isIndex && store.nfoMasterData.some(o => o.name === item.name)
            };
        };

        const indices = (store.indices || []).map(i => formatItem(i, true));
        const equity = (store.stocks || []).map(s => formatItem(s));
        const futures = (store.futures || []).map(f => {
            const liveData = store.latestMarketData[`${f.symbol}:NFO`] || {};
            return {
                name: f.symbol,
                token: f.token,
                expiry: f.expiry,
                ltp: liveData.last_traded_price || "0.00",
                change: liveData.change || "0.00",
                pChange: liveData.percent_change || "0.00"
            };
        });

        // Helper to get trending options internally
        const getInternalTrending = async (symbol) => {
            try {
                const underlyingToken = store.symbolToTokenMaster[symbol];
                const underlyingKey = `${symbol}:${store.tokenToExchange[underlyingToken] || "NSE"}`;
                const underlyingLtp = parseFloat(store.latestMarketData[underlyingKey]?.last_traded_price || 0);
                if (underlyingLtp === 0) return [];

                const contracts = store.nfoMasterData.filter(o => o.name === symbol && (o.symbol.endsWith("CE") || o.symbol.endsWith("PE")));
                const expiries = [...new Set(contracts.map(c => c.expiry))].sort((a, b) => new Date(a) - new Date(b));
                const nearestExpiry = expiries[0];

                const nearExpiryContracts = contracts.filter(c => c.expiry === nearestExpiry);
                nearExpiryContracts.sort((a, b) => parseFloat(a.strike) - parseFloat(b.strike));

                // Get unique strikes and find ATM
                const uniqueStrikes = [...new Set(nearExpiryContracts.map(c => parseFloat(c.strike) / 100))].sort((a, b) => a - b);
                const atmStrike = uniqueStrikes.reduce((prev, curr) => Math.abs(curr - underlyingLtp) < Math.abs(prev - underlyingLtp) ? curr : prev);
                const atmIdx = uniqueStrikes.indexOf(atmStrike);

                // Take ATM, 1 strike above, and 1 strike below (Total 3 strikes)
                const targetStrikes = uniqueStrikes.slice(Math.max(0, atmIdx - 1), Math.min(uniqueStrikes.length, atmIdx + 2));

                const selected = [];
                targetStrikes.forEach(strike => {
                    const ce = nearExpiryContracts.find(c => parseFloat(c.strike) / 100 === strike && c.symbol.endsWith("CE"));
                    const pe = nearExpiryContracts.find(c => parseFloat(c.strike) / 100 === strike && c.symbol.endsWith("PE"));
                    if (ce) selected.push(ce);
                    if (pe) selected.push(pe);
                });

                const tokens = selected.map(c => c.token);
                const livePrices = await optionChainService.getLivePricesForTokens(tokens);

                // Auto-subscribe to these options for WebSocket updates if market is open
                if (store.wsClient && tokens.length > 0) {
                    store.wsClient.fetchData({
                        correlationID: `trending_opts_sub_${symbol}`,
                        action: 1, mode: 2, exchangeType: 2, // 2 is NFO
                        tokens: tokens
                    });
                }

                return selected.map(c => {
                    const live = livePrices[c.token] || {};
                    const ltp = live.ltp || live.last_traded_price || "0.00";
                    const change = live.netChange || live.net_change || live.change || "0.00";
                    const pChange = live.percentChange || live.pChange || "0.00";

                    return {
                        name: `${c.name} ${c.expiry} ${parseFloat(c.strike) / 100} ${c.symbol.endsWith("CE") ? "CE" : "PE"}`,
                        token: c.token,
                        ltp: ltp,
                        change: (parseFloat(change) > 0 ? "+" : "") + parseFloat(change).toFixed(2),
                        pChange: parseFloat(pChange).toFixed(2)
                    };
                });
            } catch (e) { return []; }
        };

        const trendingOptions = [
            ...(await getInternalTrending("NIFTY")),
            ...(await getInternalTrending("BANKNIFTY")),
            ...(await getInternalTrending("FINNIFTY")),
            ...(await getInternalTrending("MIDCPNIFTY"))
        ];

        return {
            indices,
            equity,
            futures,
            trendingOptions
        };
    } catch (error) {
        throw error;
    }
};

const getMasterWatchlist = async (req, res) => {
    try {
        const data = await generateMasterWatchlistData();
        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            data
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const addSMA = (candles) => {
    const closes = candles.map(c => parseFloat(c.close));

    const sma20 = SMA.calculate({ period: 20, values: closes });
    const sma50 = SMA.calculate({ period: 50, values: closes });
    const sma100 = SMA.calculate({ period: 100, values: closes });
    const sma200 = SMA.calculate({ period: 200, values: closes });

    return candles.map((candle, index) => ({
        ...candle,
        SMA_20: index >= 19 ? sma20[index - 19] : null,
        SMA_50: index >= 49 ? sma50[index - 49] : null,
        SMA_100: index >= 99 ? sma100[index - 99] : null,
        SMA_200: index >= 199 ? sma200[index - 199] : null
    }));
}

function checkSmaConditions(df, lookback = 3) {
    if (!df || df.length < lookback + 1) {
        return { trend: null, setup: null };
    }

    // Filter rows with all SMAs (Equivalent to dropna in Python)
    const valid_df = df.filter(x => x.SMA_20 && x.SMA_50 && x.SMA_100 && x.SMA_200);
    if (valid_df.length === 0) return { trend: null, setup: null };

    const row = valid_df[valid_df.length - 1];
    const o = parseFloat(row.open);
    const c = parseFloat(row.close);

    const smas = [
        row.SMA_20,
        row.SMA_50,
        row.SMA_100,
        row.SMA_200
    ];

    const max_sma = Math.max(...smas);
    const min_sma = Math.min(...smas);

    // Current candle structure
    const above_all = c > max_sma;
    const below_all = c < min_sma;

    const cross_last_up = (o <= max_sma && max_sma <= c);
    const cross_last_down = (c <= min_sma && min_sma <= o);

    if (!(above_all || cross_last_up || below_all || cross_last_down)) {
        return { trend: null, setup: null };
    }

    // Previous candles (Slicing same as Python df.iloc[-(lookback+1):-1])
    const last3 = valid_df.slice(-(lookback + 1), -1);

    let below_all_cnt = 0;
    let above_all_cnt = 0;
    let cross_any = false;

    for (const prev of last3) {
        const pc = parseFloat(prev.close);
        const prev_smas = [
            prev.SMA_20,
            prev.SMA_50,
            prev.SMA_100,
            prev.SMA_200
        ];

        const pmax = Math.max(...prev_smas);
        const pmin = Math.min(...prev_smas);

        if (pc < pmin) {
            below_all_cnt += 1;
        } else if (pc > pmax) {
            above_all_cnt += 1;
        } else {
            cross_any = true;
        }
    }

    // Final decision
    if (above_all || cross_last_up) {
        if (cross_any) {
            return { trend: "UP", setup: "CROSS_CONTINUATION" };
        }
        if (below_all_cnt === lookback) {
            return { trend: "UP", setup: "REVERSAL" };
        }
    }

    if (below_all || cross_last_down) {
        if (cross_any) {
            return { trend: "DOWN", setup: "CROSS_CONTINUATION" };
        }
        if (above_all_cnt === lookback) {
            return { trend: "DOWN", setup: "REVERSAL" };
        }
    }

    return { trend: null, setup: null };
}

module.exports = {
    getStocks,
    getLiveEquity,
    syncLiveEquityToDB,
    syncDynamicCandleData,
    getLiveOptions,
    getLiveFutures,
    getIndices,
    syncOptionsChainHistory,
    getHistoricalOptionChain,
    generateMasterWatchlistData,
    getStockOverview,
    getFuturesSymbols,
    getRSIScanner,
    getLiveGold,
    triggerOptionSnapshot,
    debugStore,
    getFormattedOptionChain,
    getTrendingOptions,
    getMasterWatchlist,
    indicatorDetails,
    updateIndicator,
    getTimeFrames,
    getIndicators,
    orderDispatch,
    fetchOrders,
    getOptionsChain
};
