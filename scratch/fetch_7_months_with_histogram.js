const fs = require('fs');
const path = require('path');
const { login } = require('../services/authService');
const smartApi = require('../services/smartApi');
const axios = require('axios');
const { MACD } = require('technicalindicators');

function formatDate(date) {
    const d = new Date(date);
    const pad = (n) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchInChunks(symbol, token, fromDate, toDate) {
    let allCandles = [];
    let currentFrom = new Date(fromDate);
    const end = new Date(toDate);

    while (currentFrom < end) {
        let currentTo = new Date(currentFrom);
        currentTo.setDate(currentTo.getDate() + 25); // Use 25 days just to be safe (AngelOne limit is 30)
        
        if (currentTo > end) currentTo = end;

        const fStr = formatDate(currentFrom);
        const tStr = formatDate(currentTo);

        // console.log(`  [${symbol}] Fetching chunk ${fStr} to ${tStr}...`);

        let retries = 3;
        let success = false;
        
        while (retries > 0 && !success) {
            try {
                const res = await smartApi.getCandleData({
                    exchange: "NSE",
                    symboltoken: token,
                    interval: "FIVE_MINUTE",
                    fromdate: fStr,
                    todate: tStr
                });

                if (res.status && res.data) {
                    allCandles = allCandles.concat(res.data);
                    success = true;
                } else if (res.message && res.message.includes("Rate limit")) {
                    console.log(`  [${symbol}] Rate limit hit. Retrying in 2 seconds...`);
                    await sleep(2000);
                    retries--;
                } else {
                    // console.error(`  [${symbol}] API Error/No Data: ${res.message || res.errorcode}`);
                    success = true; // Break out, no data for this period
                }
            } catch (e) {
                console.error(`  [${symbol}] Exception: ${e.message}. Retrying...`);
                await sleep(2000);
                retries--;
            }
        }

        currentFrom = currentTo;
        // Wait to avoid rate limits
        await sleep(500);
    }

    return allCandles;
}

async function run() {
    try {
        console.log("Logging in...");
        await login();

        console.log("Fetching Scrip Master...");
        const response = await axios.get("https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json");
        const master = response.data;
        
        const dir = path.join(__dirname, '../historical_csv');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.csv'));
        const symbolsSet = new Set(files.map(f => f.replace('.csv', '')));
        
        // Ensure KAYNES and KALYANKJIL are added
        symbolsSet.add("KAYNES");
        symbolsSet.add("KALYANKJIL");
        
        const symbols = Array.from(symbolsSet);
        
        console.log(`Total symbols to fetch: ${symbols.length}`);

        const today = new Date();
        const sevenMonthsAgo = new Date();
        sevenMonthsAgo.setMonth(sevenMonthsAgo.getMonth() - 7);

        for (let i = 0; i < symbols.length; i++) {
            const symbol = symbols[i];
            const match = master.find(s => s.symbol === symbol + "-EQ" && s.exch_seg === "NSE");
            
            if (!match) {
                console.error(`[${i+1}/${symbols.length}] Could not find token for ${symbol}`);
                continue;
            }

            console.log(`[${i+1}/${symbols.length}] Fetching 7 months data for ${symbol}...`);
            
            const rawCandles = await fetchInChunks(symbol, match.token, sevenMonthsAgo, today);
            
            if (rawCandles.length > 0) {
                // Deduplicate and Sort
                const uniqueCandlesMap = new Map();
                for (const c of rawCandles) {
                    const dt = new Date(c[0]).getTime();
                    uniqueCandlesMap.set(dt, c);
                }
                
                const sortedKeys = Array.from(uniqueCandlesMap.keys()).sort((a, b) => a - b);
                const sortedCandles = sortedKeys.map(k => uniqueCandlesMap.get(k));
                
                // Calculate MACD Histogram
                const macdConfig = {
                    values: [],
                    fastPeriod: 12,
                    slowPeriod: 26,
                    signalPeriod: 9,
                    SimpleMAOscillator: false,
                    SimpleMASignal: false
                };
                
                const macd = new MACD(macdConfig);
                
                const filePath = path.join(dir, `${symbol}.csv`);
                const stream = fs.createWriteStream(filePath);
                stream.write("datetime,open,high,low,close,volume,histogram\n");
                
                for (const c of sortedCandles) {
                    const dt = new Date(c[0]);
                    const dtStr = dt.toISOString().replace('T', ' ').substring(0, 19);
                    const open = c[1];
                    const high = c[2];
                    const low = c[3];
                    const close = c[4];
                    const volume = c[5];
                    
                    const macdResult = macd.nextValue(parseFloat(close));
                    // Standard format: histogram = macdResult ? macdResult.histogram : 0
                    const histogram = macdResult && macdResult.histogram !== undefined ? macdResult.histogram.toFixed(4) : "0.0000";
                    
                    stream.write(`${dtStr},${open},${high},${low},${close},${volume},${histogram}\n`);
                }
                
                stream.end();
                console.log(`  -> Saved ${sortedCandles.length} rows to ${symbol}.csv`);
            } else {
                console.log(`  -> No data found for ${symbol} in this range.`);
            }
        }

        console.log("\nAll data fetching and calculation complete!");
        process.exit(0);

    } catch (e) {
        console.error("Critical Error:", e);
        process.exit(1);
    }
}

run();
