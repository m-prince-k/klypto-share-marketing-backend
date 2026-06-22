const { Candle, OptionChain } = require('../models');
const { Op } = require('sequelize');
const store = require('./marketStore');
const smartApi = require('./smartApi');

// ============================================================
// PRODUCTION-GRADE API RATE LIMITER
// Handles Angel One "exceeding access rate" with:
//   1. Serial queue — max 1 call per second guaranteed
//   2. Exponential backoff — waits 2s → 4s → 8s on rate limit
//   3. Auto-retry — up to 3 retries per request
//   4. Circuit breaker — pauses ALL calls for 60s when
//      Angel One is consistently refusing (3 failures in row)
// Result: Server NEVER gets stuck. Requests queue up calmly.
// ============================================================
let _apiQueue = Promise.resolve();
let _lastApiCallTime = 0;
let _consecutiveRateLimitFails = 0;
let _circuitOpenUntil = 0;

const API_MIN_INTERVAL_MS = 1100;   // 1 call/sec max
const MAX_RETRIES = 3;
const CIRCUIT_BREAK_DURATION_MS = 60000; // 60s pause when circuit opens
const CIRCUIT_FAIL_THRESHOLD = 3;        // 3 consecutive failures = open circuit

async function _executeApiCall(params, attempt = 1) {
    // Circuit breaker check
    if (Date.now() < _circuitOpenUntil) {
        const waitMs = _circuitOpenUntil - Date.now();
        console.warn(`[API Queue] Circuit OPEN — waiting ${Math.ceil(waitMs / 1000)}s before retrying...`);
        await new Promise(r => setTimeout(r, waitMs));
    }

    // Enforce minimum interval between calls
    const now = Date.now();
    const elapsed = now - _lastApiCallTime;
    if (elapsed < API_MIN_INTERVAL_MS) {
        await new Promise(r => setTimeout(r, API_MIN_INTERVAL_MS - elapsed));
    }
    _lastApiCallTime = Date.now();

    let response;
    try {
        response = await smartApi.getCandleData(params);
    } catch (err) {
        // Network / timeout error — treat as rate limit for safety
        if (attempt <= MAX_RETRIES) {
            const backoff = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
            console.warn(`[API Queue] Network error (attempt ${attempt}/${MAX_RETRIES}), backing off ${backoff}ms: ${err.message}`);
            _consecutiveRateLimitFails++;
            if (_consecutiveRateLimitFails >= CIRCUIT_FAIL_THRESHOLD) {
                _circuitOpenUntil = Date.now() + CIRCUIT_BREAK_DURATION_MS;
                console.error(`[API Queue] Circuit BREAKER TRIPPED — all API calls paused for 60s`);
            }
            await new Promise(r => setTimeout(r, backoff));
            return _executeApiCall(params, attempt + 1);
        }
        throw err;
    }

    // Check for rate limit in response body (Angel One sends it as a string in the response)
    const isRateLimited = response && (
        (typeof response === 'string' && response.includes('exceeding access rate')) ||
        (response.message && response.message.includes('exceeding access rate')) ||
        (!response.status && response.errorcode === 'AG8001')
    );

    if (isRateLimited) {
        _consecutiveRateLimitFails++;
        if (_consecutiveRateLimitFails >= CIRCUIT_FAIL_THRESHOLD) {
            _circuitOpenUntil = Date.now() + CIRCUIT_BREAK_DURATION_MS;
            console.error(`[API Queue] Circuit BREAKER TRIPPED — pausing all API calls for 60s`);
        }
        if (attempt <= MAX_RETRIES) {
            const backoff = Math.pow(2, attempt) * 1500; // 3s, 6s, 12s
            console.warn(`[API Queue] Rate limited (attempt ${attempt}/${MAX_RETRIES}), backing off ${backoff}ms`);
            await new Promise(r => setTimeout(r, backoff));
            return _executeApiCall(params, attempt + 1);
        }
        // All retries exhausted — return null-safe empty response
        console.error(`[API Queue] All ${MAX_RETRIES} retries exhausted for ${params.symboltoken}. Giving up.`);
        return { status: false, data: [], message: 'rate_limit_exhausted' };
    }

    // Success — reset circuit breaker counter
    if (_consecutiveRateLimitFails > 0) {
        console.log(`[API Queue] Circuit reset after success.`);
        _consecutiveRateLimitFails = 0;
    }
    return response;
}

function queuedApiCall(params) {
    _apiQueue = _apiQueue.then(() => _executeApiCall(params));
    return _apiQueue;
}
// ============================================================


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


async function getCandlesWithCache(symbol, token, exchange, interval, fromDate, toDate, extraInfo = null, forceApi = false) {
    try {
        const isOption = extraInfo !== null || exchange === "NFO" || exchange === "BFO";
        const ModelToUse = isOption ? OptionChain : Candle;
        
        console.log(`[dbService] Fetching ${symbol} | Exchange: ${exchange} | isOption: ${isOption} | Model: ${ModelToUse?.name} | forceApi: ${forceApi}`);

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

        // Only serve from DB if we have enough data and forceApi is false
        if (!forceApi && dbCandles.length > 0) {
            const diffMs = new Date(toDate) - new Date(fromDate);
            const rangeDays = diffMs / (1000 * 60 * 60 * 24);
            
            const intervalInMinutes = {
                "ONE_MINUTE": 1, "THREE_MINUTE": 3, "FIVE_MINUTE": 5,
                "TEN_MINUTE": 10, "FIFTEEN_MINUTE": 15, "THIRTY_MINUTE": 30,
                "ONE_HOUR": 60, "ONE_DAY": 1440 // 1 candle per day
            }[interval] || 1;

            const marketHoursPerDay = interval === "ONE_DAY" ? 24 : 6.25; 
            const expectedCandlesPerDay = interval === "ONE_DAY" ? (5/7) : (marketHoursPerDay * 60) / intervalInMinutes;
            const expectedCount = Math.max(1, Math.floor(rangeDays * expectedCandlesPerDay) * 0.6); // 60% threshold to prevent unnecessary API fetches for holidays

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
                    const istDate = new Date(ts.getTime() + 5.5 * 60 * 60 * 1000);
                    const timeVal = istDate.getUTCHours() * 100 + istDate.getUTCMinutes();

                    if (exchange === "MCX") {
                        // Restricted by user to 3:30 PM
                        return timeVal >= 900 && timeVal <= 1530;
                    } else {
                        if (interval === "ONE_DAY") return true;
                        return timeVal >= 915 && timeVal <= 1530;
                    }
                });

            // --- IMPROVED LIVE CANDLE MERGE (FOR ALL INTERVALS) ---
            const { isAnyMarketOpen } = require('./webSocketService');
            const live = store.liveCandles[token] || store.liveCandles[symbol.toUpperCase()];
            const liveData = store.latestMarketData[`${symbol.toUpperCase()}:${exchange}`];
            
            if ((live || liveData) && isAnyMarketOpen()) {
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
            "ONE_MINUTE": 30, "THREE_MINUTE": 90, "FIVE_MINUTE": 100,
            "TEN_MINUTE": 100, "FIFTEEN_MINUTE": 200, "THIRTY_MINUTE": 200,
            "ONE_HOUR": 400, "ONE_DAY": 2000
        };
        const maxDaysPerChunk = maxDaysMap[interval] || 5;

        // We will fetch the full range from fromDate to toDate.
        // Merging and deduplication is handled below.
        let currentStartDate = new Date(fromDate);
        console.log(`[API Fallback] Fetching full range from ${currentStartDate.toISOString()} to ${new Date(toDate).toISOString()}`);

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
            // Strictly cap at 15:30 for NSE/BSE even if current time is later
            let effectiveEndTime = isToday ? currentTimeStr : (isMCX ? "23:30" : "15:30");
            if (!isMCX && isToday && parseInt(currentTimeStr.replace(':', '')) > 1530) {
                effectiveEndTime = "15:30";
            }
            const tStr = formatDate(currentChunkEndDate, effectiveEndTime, interval);

            console.log(`[AngelOne API] Requesting ${symbol} (${token}) | Interval: ${interval} | From: ${fStr} | To: ${tStr}`);
            
            try {
                // Use the global queued API caller to prevent rate-limit floods
                const apiPromise = queuedApiCall({
                    exchange,
                    symboltoken: token,
                    interval: interval,
                    fromdate: fStr,
                    todate: tStr
                });

                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error("Angel One API Timeout")), 20000)
                );

                const response = await Promise.race([apiPromise, timeoutPromise]);

                if (response && response.status && response.data) {
                    console.log(`[AngelOne API] Success for ${symbol}: Received ${response.data.length} candles.`);
                    allCandles.push(...response.data);
                } else {
                    console.log(`[API Chunk] ${symbol} Empty or Error response:`, JSON.stringify(response));
                    // --- SELF HEALING: Token Expiry / 403 Recovery ---
                    if (response && (String(response.status) === "403" || response.errorcode === "AB1004" || String(response.message).includes("Invalid Token"))) {
                        console.log(`[DB Service] Token Expired/Invalid detected for ${symbol}! Forcing Re-Login...`);
                        const { login } = require('./authService');
                        await login(true); // Force fetch new token and save to file
                        // Retry this chunk once after login
                        console.log(`[DB Service] Retrying chunk for ${symbol} after re-login...`);
                        const retryResponse = await queuedApiCall({
                            exchange, symboltoken: token, interval: interval, fromdate: fStr, todate: tStr
                        });
                        if (retryResponse && retryResponse.status && retryResponse.data) {
                            allCandles.push(...retryResponse.data);
                        }
                        continue; // Proceed to next chunk
                    }
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
            // No extra delay needed - the global queue enforces 1100ms between calls
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
            const istDate = new Date(ts.getTime() + 5.5 * 60 * 60 * 1000);
            const timeVal = istDate.getUTCHours() * 100 + istDate.getUTCMinutes();

            if (exchange === "MCX") {
                // Restricted by user to 3:30 PM
                return timeVal >= 900 && timeVal <= 1530;
            } else {
                // NSE / BSE / NFO / BFO
                if (interval === "ONE_DAY") return true; // Daily candles are fine
                return timeVal >= 915 && timeVal <= 1530;
            }
        });

        if (filteredData.length > 0 && exchange !== "MCX") {
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
