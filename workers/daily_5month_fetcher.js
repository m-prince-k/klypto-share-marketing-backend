const fs = require('fs');
const path = require('path');
const { login } = require('../services/authService');
const { fetchTop200Stocks } = require('../services/stockService');
const { getScannerSymbols } = require('../services/scannerService');
const smartApi = require('../services/smartApi');
const store = require('../services/marketStore');

const DELAY_MS = 500; // Safe delay to avoid Angel One rate limits
const CHUNK_DAYS = 30; // Max allowed by Angel One per request
const TOTAL_MONTHS = 5;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function formatAngelDate(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function fetchChunk(token, fromDate, toDate) {
    try {
        const res = await smartApi.getCandleData({
            exchange: "NSE",
            symboltoken: token,
            interval: "FIVE_MINUTE",
            fromdate: formatAngelDate(fromDate),
            todate: formatAngelDate(toDate)
        });
        if (res && res.status && res.data) {
            return res.data;
        }
    } catch (e) {
        console.error(`Error fetching chunk for token ${token}:`, e.message);
    }
    return [];
}

async function runDailySync() {
    console.log('[Daily Fetcher] Starting 5-month historical data sync...');
    
    // 1. Authenticate
    const loginData = await login();
    if (!loginData || !loginData.status) {
        console.error('[Daily Fetcher] Angel One login failed.');
        process.exit(1);
    }
    
    // 2. Fetch Master list to get tokens
    await fetchTop200Stocks();
    
    // 3. Get symbols to process
    const symbols = getScannerSymbols();
    console.log(`[Daily Fetcher] Found ${symbols.length} symbols to sync.`);
    
    const csvDir = path.join(__dirname, '../historical_csv');

    for (const symbol of symbols) {
        console.log(`[Daily Fetcher] Syncing ${symbol}...`);
        
        // Handle token mapping
        const token = store.symbolToTokenMaster[symbol] || store.symbolToTokenMaster[`${symbol}:NSE`];
        if (!token) {
            console.warn(`[Daily Fetcher] Token not found for ${symbol}`);
            continue;
        }

        let allData = [];
        
        // Fetch 5 chunks of 30 days going backwards
        let currentToDate = new Date();
        
        for (let i = 0; i < (TOTAL_MONTHS * 30 / CHUNK_DAYS); i++) {
            let currentFromDate = new Date(currentToDate);
            currentFromDate.setDate(currentFromDate.getDate() - CHUNK_DAYS);
            
            console.log(`  - Fetching ${formatAngelDate(currentFromDate)} to ${formatAngelDate(currentToDate)}`);
            const chunk = await fetchChunk(token, currentFromDate, currentToDate);
            allData = allData.concat(chunk);
            
            currentToDate = new Date(currentFromDate);
            await sleep(DELAY_MS); // Crucial for rate limiting
        }

        if (allData.length > 0) {
            // Sort data chronologically (oldest to newest)
            allData.sort((a, b) => new Date(a[0]) - new Date(b[0]));
            
            // Format as CSV
            const csvLines = ['datetime,open,high,low,close,volume'];
            for (const c of allData) {
                // c is [time, open, high, low, close, volume]
                const dt = c[0].replace('T', ' ').substring(0, 19);
                csvLines.push(`${dt},${c[1]},${c[2]},${c[3]},${c[4]},${c[5]}`);
            }
            
            const filePath = path.join(csvDir, `${symbol}.csv`);
            fs.writeFileSync(filePath, csvLines.join('\n'));
            console.log(`[Daily Fetcher] Saved ${allData.length} candles to ${symbol}.csv`);
        }
    }
    
    console.log('[Daily Fetcher] Sync complete!');
    process.exit(0);
}

runDailySync();
