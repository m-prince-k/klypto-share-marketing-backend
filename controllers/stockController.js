const { prepareCandlesWithIndicators, dispatchOrder, indicatorEngine } = require('../helper');
const { getHistoricalCandle } = require('../services/angelOne');
const store = require('../services/marketStore');
const { syncLivePrices, syncCandleData } = require('../services/stockService');
const { Timeframe, Indicator, Order } = require('../models');
const { response } = require('express');

const getStocks = (req, res) => {
    res.json({
        success: true,
        count: store.stocks.length,
        stocks: store.stocks
    });
};

const getLiveEquity = (req, res) => {
    res.json({
        success: true,
        data: Object.values(store.latestMarketData).filter(d => !d.symbol.includes("CE") && !d.symbol.includes("PE"))
    });
};

const syncLiveEquityToDB = async (req, res) => {
    try {
        const interval = req.query.interval;
        const symbol = req.query.symbol;
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
    res.json({
        success: true,
        data: Object.values(store.latestMarketData).filter(d => d.symbol.includes("CE") || d.symbol.includes("PE"))
    });
};

const getLiveFutures = (req, res) => {
    res.json({
        success: true,
        data: Object.values(store.latestMarketData).filter(d => d.symbol.endsWith("FUT"))
    });
};


//indicator details --- IGNORE ---
const indicatorDetails = async (req, res) => {

    try {
        const { type, symbol, interval, period, fromdate, todate, fromDate, toDate } = req.query;
        
        // Normalize parameter names
        const finalFromDate = fromdate || fromDate;
        const finalToDate = todate || toDate;

        // Format dates if they are just YYYY-MM-DD
        let formattedFromDate = finalFromDate;
        let formattedToDate = finalToDate;

        if (typeof finalFromDate === 'string' && finalFromDate.length === 10) {
            formattedFromDate = formatDate(new Date(finalFromDate), "09:15");
        }
        if (typeof finalToDate === 'string' && finalToDate.length === 10) {
            formattedToDate = formatDate(new Date(finalToDate), "15:30");
        }

        let data = {
            symbol: symbol, interval: interval,
            fromDate: formattedFromDate, toDate: formattedToDate
        }

        const candles = await getHistoricalCandle(data);

        let values = await prepareCandlesWithIndicators(type, candles, res);
        // return res.send(values);
        return await res.json({ message: `Indicator fetched by ${type}`, statusCode: 200, data: values });

    } catch (error) {
        console.log(error, "0987787879--------------------------------->>>>>>>>>.");
        throw error;
    }
}

const updateIndicator = async (req, res) => {

    try {

        if (!req.body && req.body.indicatorType) {
            return await res.json({ statusCode: 403, message: "Type must be defined" });
        } else {
            const { symbol, interval, period, fromdate, todate, fromDate, toDate } = req.query;
            
            // Normalize parameter names
            const finalFromDate = fromdate || fromDate;
            const finalToDate = todate || toDate;

            // Format dates if they are just YYYY-MM-DD
            let formattedFromDate = finalFromDate;
            let formattedToDate = finalToDate;

            if (typeof finalFromDate === 'string' && finalFromDate.length === 10) {
                formattedFromDate = formatDate(new Date(finalFromDate), "09:15");
            }
            if (typeof finalToDate === 'string' && finalToDate.length === 10) {
                formattedToDate = formatDate(new Date(finalToDate), "15:30");
            }

            let params = {
                symbol: symbol, interval: interval,
                fromDate: formattedFromDate, toDate: formattedToDate
            }

            const candles = await getHistoricalCandle(params);

            let paylaod = {};

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
                tradingsymbol: tradingsymbol || "SBIN-EQ",
                symboltoken: symboltoken || "3045",
                transactiontype: transactiontype || "BUY",
                exchange: exchange || "NSE",
                ordertype: ordertype || "LIMIT",
                producttype: producttype || "INTRADAY",
                duration: duration || "DAY",
                price: price || "600",
                quantity: quantity || 1,
                variety: variety || "NORMAL",
                squareoff: squareoff || "0",
                stoploss: stoploss || "0"
            };

            const dispatchResult = await dispatchOrder(smartApi, payload);

            // Extract the actual Angel One API response
            const angelResponse = dispatchResult.data;

            // ⚠️ Safety check (API fail case)
            if (!dispatchResult.success || !angelResponse || !angelResponse.status || !angelResponse.data || !angelResponse.data.orderid) {
                return res.status(500).json({
                    statusCode: 500,
                    message: 'Order dispatch failed',
                    data: dispatchResult
                });
            }


            // 🔹 2. Save in DB
            const savedOrder = await Order.create({
                order_id: angelResponse.data.orderid,
                user_id: req.user.id,
                client_id: req.user.client_id,

                tradingsymbol,
                symboltoken,
                transactiontype,
                ordertype,
                price,
                quantity,

                exchange: dispatchResult.data.exchange || null,
                product_type: dispatchResult.data.producttype || null,
                duration: dispatchResult.data.duration || 'DAY',

                status: 'OPEN',
                status_message: dispatchResult.message || null,

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

module.exports = {
    orderDispatch,
    getIndicators,
    getTimeFrames,
    updateIndicator,
    indicatorDetails,
    getStocks,
    getLiveEquity,
    syncLiveEquityToDB,
    syncDynamicCandleData,
    getLiveOptions,
    getLiveFutures
};
