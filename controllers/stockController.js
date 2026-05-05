const { prepareCandlesWithIndicators, dispatchOrder, indicatorEngine } = require('../helper');
const { getHistoricalCandle } = require('../services/angelOne');
const store = require('../services/marketStore');
const { syncLivePrices, syncCandleData } = require('../services/stockService');
const { Timeframe, Indicator, Order } = require('../models');
const { Sequelize, Op } = require('sequelize');
const { response } = require('express');

const getStocks = (req, res) => {
    const stocksWithPrice = store.stocks.map(s => {
        const key = `${s.name}:${s.segment}`;
        const liveData = store.latestMarketData[key] || {};

        const ltp = parseFloat(liveData.last_traded_price || 0);
        const close = parseFloat(liveData.close_price || 0);

        // Manual calculation to ensure accuracy
        const rawChange = ltp - close;
        const changeStr = close > 0 ? (rawChange > 0 ? "+" : "") + rawChange.toFixed(2) : "0.00";
        const pChange = close > 0 ? ((rawChange / close) * 100).toFixed(2) : "0.00";

        return {
            ...s,
            ltp: liveData.last_traded_price || "0.00",
            change: changeStr,
            percent_change: pChange,
            sentiment: liveData.sentiment || "neutral"
        };
    });

    res.json({
        success: true,
        count: stocksWithPrice.length,
        stocks: stocksWithPrice
    });
};

const getIndices = (req, res) => {
    // Indices usually have tokens starting with 999 or are in this specific list
    const mainIndices = ["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "SENSEX", "BANKEX", "NIFTYNEXT50", "NIFTY100", "NIFTY200", "NIFTY500"];

    const indicesData = store.stocks
        .filter(s => mainIndices.includes(s.name) || s.name.startsWith("NIFTY_") || s.token.startsWith("999"))
        .map(s => {
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
    let data = Object.values(store.latestMarketData).filter(d => !d.symbol.includes("CE") && !d.symbol.includes("PE"));

    if (symbol) {
        data = data.filter(d => d.symbol.toUpperCase() === symbol.toUpperCase());
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

        // 2. Filter Master Data for this symbol's options (Flexible match)
        const allOptions = store.nfoMasterData.filter(o =>
            (o.name === uSym || o.symbol.startsWith(uSym)) && (o.instrumenttype === "OPTIDX" || o.instrumenttype === "OPTSTK")
        );

        if (allOptions.length === 0) {
            return res.status(404).json({ success: false, message: `No options found for ${uSym}` });
        }

        // 3. Get Expiries and choose one
        const uniqueExpiries = [...new Set(allOptions.map(o => o.expiry))].sort((a, b) => new Date(a) - new Date(b));
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

        const batchSize = 50;
        for (let i = 0; i < allTokens.length; i += batchSize) {
            const batch = allTokens.slice(i, i + batchSize);
            try {
                const marketRes = await smartApi.marketData({
                    mode: "FULL",
                    exchangeTokens: { "NFO": batch }
                });

                if (marketRes?.data?.fetched) {
                    marketRes.data.fetched.forEach(item => {
                        liveMarketMap[item.symbolToken] = item;
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
                    oi: live.oi || "0",
                    oiChange: live.net_change_oi || "0",
                    volume: live.volume || "0",
                    iv: live.iv || "0" // IV might not be available in standard data, but keeping for future
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

        const uSym = symbol.toUpperCase().trim();
        const allOptions = store.nfoMasterData.filter(o =>
            (o.name === uSym || o.symbol.startsWith(uSym)) && (o.instrumenttype === "OPTIDX" || o.instrumenttype === "OPTSTK")
        );

        if (allOptions.length === 0) {
            return res.status(404).json({ success: false, message: `No options found for ${uSym}` });
        }

        // Run in background to avoid timeout
        const startSync = async () => {
            console.log(`[Sync-OptionChain] Starting deep history sync for ${allOptions.length} contracts of ${uSym}...`);
            const now = new Date();
            const oneYearAgo = new Date();
            oneYearAgo.setFullYear(now.getFullYear() - 1);

            const fromDate = formatDate(oneYearAgo, "09:15", interval);
            const toDate = formatDate(now, "15:30", interval);

            let successCount = 0;
            for (const opt of allOptions) {
                try {
                    console.log(`[Sync-OptionChain] Syncing ${opt.symbol} (${opt.token})...`);
                    await getCandlesWithCache(opt.symbol, opt.token, opt.exch_seg, interval, fromDate, toDate);
                    successCount++;
                    // Delay between contracts to respect rate limits
                    await new Promise(r => setTimeout(r, 1500));
                } catch (err) {
                    console.error(`[Sync-OptionChain] Failed for ${opt.symbol}:`, err.message);
                }
            }
            console.log(`[Sync-OptionChain] Completed. Successfully synced ${successCount}/${allOptions.length} contracts.`);
        };

        startSync();

        res.json({
            success: true,
            message: `Deep sync started in background for ${allOptions.length} contracts of ${uSym}. This will take some time.`,
            estimatedTimeMinutes: Math.round((allOptions.length * 1.5 * (365 / 30)) / 60) // Rough estimation
        });

    } catch (error) {
        console.error("Error in syncOptionsChainHistory:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

const getHistoricalOptionChain = async (req, res) => {
    try {
        const { symbol, timestamp, interval = "FIVE_MINUTE" } = req.query;
        if (!symbol || !timestamp) {
            return res.status(400).json({ success: false, message: "Symbol and Timestamp are required" });
        }

        const uSym = symbol.toUpperCase().trim();
        const targetTime = new Date(timestamp);

        // 1. Fetch all candles for this symbol's options at this timestamp
        // We look for contracts in nfoMasterData first to get tokens
        const allOptions = store.nfoMasterData.filter(o =>
            (o.name === uSym || o.symbol.startsWith(uSym)) && (o.instrumenttype === "OPTIDX" || o.instrumenttype === "OPTSTK")
        );
        const { OptionChain, Candle } = require('../models');
        const uniqueExpiries = await OptionChain.findAll({
            attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('expiry')), 'expiry']],
            where: { underlying: uSym },
            raw: true
        });

        // 2. Query DB for candles at this timestamp for this underlying
        const whereClause = {
            underlying: uSym,
            interval: interval,
            timestamp: targetTime
        };
        // Removed the undefined 'expiry' check since we want all expiries for the option chain at this time.

        const candles = await OptionChain.findAll({ where: whereClause });

        if (candles.length === 0) {
            return res.status(404).json({
                success: false,
                message: `No historical data found in database for ${uSym} at ${timestamp}. Make sure to sync data first.`
            });
        }

        // 3. Map candles back to strikes
        const strikeMap = {};
        candles.forEach(c => {
            const opt = allOptions.find(o => o.token === c.token);
            if (!opt) return;

            const strike = parseFloat(opt.strike) / 100;
            if (!strikeMap[strike]) strikeMap[strike] = { strike, call: null, put: null };

            const formatted = {
                symbol: opt.symbol,
                token: opt.token,
                open: c.open,
                high: c.high,
                low: c.low,
                close: c.close,
                volume: c.volume
            };

            if (opt.symbol.endsWith("CE")) strikeMap[strike].call = formatted;
            else if (opt.symbol.endsWith("PE")) strikeMap[strike].put = formatted;
        });

        const sortedChain = Object.values(strikeMap).sort((a, b) => a.strike - b.strike);

        res.json({
            success: true,
            symbol: uSym,
            timestamp: targetTime,
            count: sortedChain.length,
            chain: sortedChain
        });

    } catch (error) {
        console.error("Error in getHistoricalOptionChain:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = {
    fetchOrders,
    getOptionsChain,
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
    getLiveFutures,
    getIndices,
    syncOptionsChainHistory,
    getHistoricalOptionChain
};
