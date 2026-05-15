const { Candle, OptionChain } = require('../models');
const { Op } = require('sequelize');
const store = require('./marketStore');
const smartApi = require('./smartApi');

const formatDate = (date, time, interval) => {
    if (!date) return null;
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');


    if (time) {
        return `${year}-${month}-${day} ${time}`;
    }
    return `${year}-${month}-${day}`;
};


async function getCandlesWithCache(symbol, token, exchange, interval, fromDate, toDate, extraInfo = null) {
    try {
        const isOption = extraInfo !== null || exchange === "NFO" || exchange === "BFO";
        const ModelToUse = isOption ? OptionChain : Candle;
        
        console.log(`[dbService] Fetching ${symbol} | Exchange: ${exchange} | isOption: ${isOption} | Model: ${ModelToUse?.name}`);

        // Default to last 30 days if no dates provided
        if (!fromDate || !toDate) {
            const now = new Date();
            const past = new Date();
            past.setDate(now.getDate() - 30);
            fromDate = formatDate(past, "09:15");
            toDate = formatDate(now, "15:30");
        }

        // 1. Check local DB first
        const dbCandles = await ModelToUse.findAll({
            where: {
                symbol: symbol.toUpperCase(),
                exchange: exchange,
                interval: interval,
                timestamp: { [Op.between]: [new Date(fromDate), new Date(toDate)] }
            },
            order: [['timestamp', 'ASC']]
        });

        // Only serve from DB if we have enough data
        if (dbCandles.length > 0) {
            const diffMs = new Date(toDate) - new Date(fromDate);
            const rangeDays = diffMs / (1000 * 60 * 60 * 24);
            
            const intervalInMinutes = {
                "ONE_MINUTE": 1, "THREE_MINUTE": 3, "FIVE_MINUTE": 5,
                "TEN_MINUTE": 10, "FIFTEEN_MINUTE": 15, "THIRTY_MINUTE": 30,
                "ONE_HOUR": 60, "ONE_DAY": 1440 // 1 candle per day
            }[interval] || 1;

            const marketHoursPerDay = interval === "ONE_DAY" ? 24 : 6.25; 
            const expectedCandlesPerDay = interval === "ONE_DAY" ? (5/7) : (marketHoursPerDay * 60) / intervalInMinutes;
            const expectedCount = Math.max(1, Math.floor(rangeDays * expectedCandlesPerDay) * 0.7); // 70% threshold

            const lastCandle = dbCandles[dbCandles.length - 1];
            const lastTs = new Date(lastCandle.timestamp);
            const targetTs = new Date(toDate);
            const nowTs = new Date().getTime();
            const effectiveTargetTs = targetTs.getTime() > nowTs ? new Date(nowTs) : targetTs;
            const gapHours = (effectiveTargetTs - lastTs) / (1000 * 60 * 60);

            const isToday = targetTs.toDateString() === new Date().toDateString();
            const gapThreshold = isToday ? 0.033 : 24; // If today, any gap > 2 mins triggers API fetch (Real-time sync)

            // If we have records and they are fresh enough OR we met the count threshold
            if ((dbCandles.length >= expectedCount && gapHours < gapThreshold) || (rangeDays < 0.1 && dbCandles.length > 0)) {
                console.log(`[DB Cache] Serving ${dbCandles.length} records from ${ModelToUse.name} for ${symbol} (Gap: ${gapHours.toFixed(1)}h, Threshold: ${gapThreshold}h)`);
                
                const finalData = dbCandles.map(c => {
                    const d = c.toJSON ? c.toJSON() : c;
                    return { ...d, time: Math.floor(new Date(d.timestamp).getTime() / 1000) };
                }).filter(c => {
                    const ts = new Date(c.timestamp);
                    const hours = ts.getHours();
                    const minutes = ts.getMinutes();
                    const timeVal = hours * 100 + minutes;

                    if (exchange === "MCX") {
                        return timeVal >= 900 && timeVal <= 2355;
                    } else {
                        if (interval === "ONE_DAY") return true;
                        return timeVal >= 915 && timeVal <= 1530;
                    }
                });

            // --- IMPROVED LIVE CANDLE MERGE (FOR ALL INTERVALS) ---
            const live = store.liveCandles[token] || store.liveCandles[symbol.toUpperCase()];
            const liveData = store.latestMarketData[`${symbol.toUpperCase()}:${exchange}`];
            
            if (live || liveData) {
                const intervalInMinutes = {
                    "ONE_MINUTE": 1, "THREE_MINUTE": 3, "FIVE_MINUTE": 5,
                    "TEN_MINUTE": 10, "FIFTEEN_MINUTE": 15, "THIRTY_MINUTE": 30,
                    "ONE_HOUR": 60
                }[interval] || 1;

                const now = new Date();
                const msPerInterval = intervalInMinutes * 60 * 1000;
                
                // Calculate the start time of the CURRENT forming candle for this interval
                const currentIntervalStartTs = Math.floor(now.getTime() / msPerInterval) * msPerInterval;
                const intervalStartTime = new Date(currentIntervalStartTs);

                const lastD = finalData[finalData.length - 1];
                const lastTs = lastD ? new Date(lastD.timestamp).getTime() : 0;

                // If the forming candle is newer than our last DB candle, push it
                // If it matches our last candle, update it.
                if (currentIntervalStartTs >= lastTs) {
                    let formingCandle;
                    
                    if (currentIntervalStartTs === lastTs) {
                        formingCandle = finalData[finalData.length - 1];
                    } else {
                        // Create a new forming candle based on the last tick or live candle
                        formingCandle = {
                            symbol: symbol.toUpperCase(),
                            token: token,
                            exchange,
                            interval,
                            timestamp: intervalStartTime,
                            time: Math.floor(currentIntervalStartTs / 1000),
                            open: live ? parseFloat(live.open) : parseFloat(liveData?.last_traded_price || 0),
                            high: live ? parseFloat(live.high) : parseFloat(liveData?.last_traded_price || 0),
                            low: live ? parseFloat(live.low) : parseFloat(liveData?.last_traded_price || 0),
                            close: liveData ? parseFloat(liveData.last_traded_price || liveData.ltp) : (live ? parseFloat(live.close) : 0),
                            volume: live ? parseFloat(live.volume || 0) : 0
                        };
                        if (isOption && extraInfo) Object.assign(formingCandle, extraInfo);
                        finalData.push(formingCandle);
                    }

                    // Update High/Low/Close from Live Tick
                    if (liveData && liveData.last_traded_price) {
                        const ltp = parseFloat(liveData.last_traded_price);
                        if (!isNaN(ltp) && ltp > 0) {
                            formingCandle.close = ltp;
                            if (ltp > formingCandle.high) formingCandle.high = ltp;
                            if (ltp < formingCandle.low) formingCandle.low = ltp;
                        }
                    }
                }
            }
            // --------------------------------------------------------

                return { 
                    source: "database", 
                    data: finalData,
                    raw_response: null 
                };
            }
            console.log(`[DB Cache] Gap too large (${gapHours.toFixed(1)}h) for ${symbol}. Falling back to API.`);
        }

        // 2. Fallback to Angel One API
        console.log(`[API Fallback] Fetching ${symbol} from Angel One (${exchange})... Threshold not met (Got ${dbCandles.length}, need ~${Math.floor(((new Date(toDate) - new Date(fromDate)) / (1000 * 60 * 60 * 24)) * (interval === "ONE_DAY" ? 5/7 : 1) * 0.7)})`);
        
        const maxDaysMap = {
            "ONE_MINUTE": 5, "THREE_MINUTE": 10, "FIVE_MINUTE": 15,
            "TEN_MINUTE": 30, "FIFTEEN_MINUTE": 60, "THIRTY_MINUTE": 90,
            "ONE_HOUR": 150, "ONE_DAY": 2000
        };
        const maxDaysPerChunk = maxDaysMap[interval] || 5;

        // Optimization: Instead of fetching the whole range from fromDate, 
        // we only fetch from the LAST available candle in our DB to fill the gap.
        let currentStartDate = new Date(fromDate);
        if (dbCandles.length > 0) {
            const lastTs = new Date(dbCandles[dbCandles.length - 1].timestamp);
            currentStartDate = new Date(lastTs.getTime() + 1000); // Start 1s after the last candle
            console.log(`[API Fallback] DB has ${dbCandles.length} records. Fetching only the gap starting from ${currentStartDate.toISOString()}`);
        } else {
            console.log(`[API Fallback] DB is empty. Fetching full range from ${currentStartDate.toISOString()}`);
        }

        const finalEndDate = new Date(toDate);
        let allCandles = [...dbCandles.map(c => {
            const d = c.toJSON ? c.toJSON() : c;
            return [d.timestamp, d.open, d.high, d.low, d.close, d.volume];
        })]; 
        
        // Ensure initial data is sorted
        allCandles.sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime());

        while (currentStartDate < finalEndDate) {
            let currentChunkEndDate = new Date(currentStartDate);
            currentChunkEndDate.setDate(currentChunkEndDate.getDate() + maxDaysPerChunk);
            if (currentChunkEndDate > finalEndDate) currentChunkEndDate = new Date(finalEndDate);

            const isMCX = exchange === "MCX";
            const isToday = currentChunkEndDate.toDateString() === new Date().toDateString();
            const now = new Date();
            const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            
            const fStr = formatDate(currentStartDate, isMCX ? "09:00" : "09:15", interval);
            const tStr = formatDate(currentChunkEndDate, isToday ? currentTimeStr : (isMCX ? "23:55" : "15:30"), interval);

            console.log(`[AngelOne API] Requesting ${symbol} (${token}) | Interval: ${interval} | From: ${fStr} | To: ${tStr}`);
            
            try {
                // Wrap API call in a timeout to prevent hanging
                const apiPromise = smartApi.getCandleData({
                    exchange,
                    symboltoken: token,
                    interval: interval,
                    fromdate: fStr,
                    todate: tStr
                });

                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error("Angel One API Timeout")), 12000)
                );

                const response = await Promise.race([apiPromise, timeoutPromise]);

                if (response && response.status && response.data) {
                    console.log(`[AngelOne API] Success for ${symbol}: Received ${response.data.length} candles.`);
                    allCandles.push(...response.data);
                } else {
                    console.log(`[API Chunk] ${symbol} Empty or Error response:`, JSON.stringify(response));
                    if (response && response.message && response.message.includes("exceeding access rate")) {
                        console.warn(`[API Fallback] Rate limited for ${symbol}. Stopping chunks.`);
                        break;
                    }
                }
            } catch (err) {
                console.error(`[API Chunk] Error fetching ${symbol}:`, err.message);
                // If it's a timeout or serious error, stop further chunks for this request
                if (err.message.includes("Timeout") || err.message.includes("429") || err.message.includes("exceeding access rate")) break;
            }

            currentStartDate = new Date(currentChunkEndDate.getTime() + 1000); // Ensure we move forward
            if (currentStartDate >= finalEndDate) break;
            await new Promise(resolve => setTimeout(resolve, 800)); // Reduced delay slightly
        }

        // 3. Save to DB and Return
        if (allCandles.length > 0) {
            console.log(`[API Result] Returning ${allCandles.length} candles for ${symbol}`);
        } else if (dbCandles.length > 0) {
            console.log(`[DB Fallback] API returned nothing, returning existing ${dbCandles.length} DB records for ${symbol}`);
            return { 
                source: "database_fallback", 
                data: dbCandles.map(c => {
                    const d = c.toJSON ? c.toJSON() : c;
                    return { ...d, time: Math.floor(new Date(d.timestamp).getTime() / 1000) };
                })
            };
        }

        const formattedData = allCandles.map(candle => {
            let ts;
            const rawTs = candle[0];
            if (typeof rawTs === 'string' && !rawTs.includes('T') && !rawTs.includes('Z') && !rawTs.includes('+')) {
                ts = new Date(rawTs + " +05:30");
            } else {
                ts = new Date(rawTs);
            }

            const base = {
                symbol: symbol.toUpperCase(),
                token: token,
                exchange,
                interval,
                timestamp: ts,
                time: Math.floor(ts.getTime() / 1000),
                open: parseFloat(candle[1]),
                high: parseFloat(candle[2]),
                low: parseFloat(candle[3]),
                close: parseFloat(candle[4]),
                volume: parseInt(candle[5])
            };

            if (isOption && extraInfo) {
                return {
                    ...base,
                    underlying: extraInfo.underlying,
                    strike: extraInfo.strike,
                    expiry: extraInfo.expiry,
                    optionType: extraInfo.optionType
                };
            }
            return base;
        });

        // Use a Map to ensure uniqueness by timestamp AND sort them
        const uniqueData = Array.from(new Map(
            formattedData
                .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
                .map(item => [item.timestamp.getTime(), item])
        ).values());
        
        // --- IMPROVED LIVE CANDLE MERGE (FOR ALL INTERVALS) ---
        const live = store.liveCandles[token] || store.liveCandles[symbol.toUpperCase()];
        const liveDataAPI = store.latestMarketData[`${symbol.toUpperCase()}:${exchange}`];
        
        if (live || liveDataAPI) {
            const intervalInMinutes = {
                "ONE_MINUTE": 1, "THREE_MINUTE": 3, "FIVE_MINUTE": 5,
                "TEN_MINUTE": 10, "FIFTEEN_MINUTE": 15, "THIRTY_MINUTE": 30,
                "ONE_HOUR": 60
            }[interval] || 1;

            const now = new Date();
            const msPerInterval = intervalInMinutes * 60 * 1000;
            const currentIntervalStartTs = Math.floor(now.getTime() / msPerInterval) * msPerInterval;
            const intervalStartTime = new Date(currentIntervalStartTs);

            const lastHist = uniqueData.length > 0 ? uniqueData[uniqueData.length - 1] : null;
            const lastTs = lastHist ? new Date(lastHist.timestamp).getTime() : 0;

            if (currentIntervalStartTs >= lastTs) {
                let formingCandle;
                if (currentIntervalStartTs === lastTs) {
                    formingCandle = uniqueData[uniqueData.length - 1];
                } else {
                    formingCandle = {
                        symbol: symbol.toUpperCase(),
                        token: token,
                        exchange,
                        interval,
                        timestamp: intervalStartTime,
                        time: Math.floor(currentIntervalStartTs / 1000),
                        open: live ? parseFloat(live.open) : parseFloat(liveDataAPI?.last_traded_price || 0),
                        high: live ? parseFloat(live.high) : parseFloat(liveDataAPI?.last_traded_price || 0),
                        low: live ? parseFloat(live.low) : parseFloat(liveDataAPI?.last_traded_price || 0),
                        close: liveDataAPI ? parseFloat(liveDataAPI.last_traded_price || liveDataAPI.ltp) : (live ? parseFloat(live.close) : 0),
                        volume: live ? parseFloat(live.volume || 0) : 0
                    };
                    if (isOption && extraInfo) Object.assign(formingCandle, extraInfo);
                    uniqueData.push(formingCandle);
                }

                if (liveDataAPI && liveDataAPI.last_traded_price) {
                    const ltp = parseFloat(liveDataAPI.last_traded_price);
                    if (!isNaN(ltp) && ltp > 0) {
                        formingCandle.close = ltp;
                        if (ltp > formingCandle.high) formingCandle.high = ltp;
                        if (ltp < formingCandle.low) formingCandle.low = ltp;
                    }
                }
            }
        }
        // ---------------------------------

        // --- SORT AND MARKET HOURS FILTERING ---
        const sortedData = uniqueData.sort((a, b) => a.timestamp - b.timestamp);

        const filteredData = sortedData.filter(c => {
            const ts = new Date(c.timestamp);
            const hours = ts.getHours();
            const minutes = ts.getMinutes();
            const timeVal = hours * 100 + minutes;

            if (exchange === "MCX") {
                return timeVal >= 900 && timeVal <= 2355;
            } else {
                // NSE / BSE / NFO / BFO
                if (interval === "ONE_DAY") return true; // Daily candles are fine
                return timeVal >= 915 && timeVal <= 1530;
            }
        });

        if (filteredData.length > 0) {
            await ModelToUse.bulkCreate(filteredData, { ignoreDuplicates: true });
            console.log(`[API Fallback] Saved ${filteredData.length} records to ${ModelToUse.name} for ${symbol}`);
        }



        return { source: "api_chunked", data: filteredData, raw_response: null };
    } catch (err) {
        throw err;
    }
}

module.exports = {
    getCandlesWithCache,
    formatDate
};
