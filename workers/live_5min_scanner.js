const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { login } = require('../services/authService');
const { fetchTop200Stocks } = require('../services/stockService');
const { getScannerSymbols } = require('../services/scannerService');
const smartApi = require('../services/smartApi');
const store = require('../services/marketStore');
const { StrategySignal } = require('../models');

const DELAY_MS = 500; // Safe delay

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function formatAngelDate(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Helper to read CSV and parse to objects
function readHistoricalCsv(symbol) {
    const filePath = path.join(__dirname, '../historical_csv', `${symbol}.csv`);
    if (!fs.existsSync(filePath)) return [];
    
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const data = [];
    // Skip header line 0
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const [datetime, open, high, low, close, volume] = line.split(',');
        data.push({ datetime, open, high, low, close, volume });
    }
    return data;
}

// Fetch latest 1-2 days to cover gap
async function fetchLatestData(token) {
    try {
        const toDate = new Date();
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - 2); // Get last 2 days just in case
        
        const res = await smartApi.getCandleData({
            exchange: "NSE",
            symboltoken: token,
            interval: "FIVE_MINUTE",
            fromdate: formatAngelDate(fromDate),
            todate: formatAngelDate(toDate)
        });
        
        if (res && res.status && res.data) {
            return res.data.map(c => ({
                datetime: c[0].replace('T', ' ').substring(0, 19),
                open: c[1],
                high: c[2],
                low: c[3],
                close: c[4],
                volume: c[5]
            }));
        }
    } catch (e) {
        console.error(`Error fetching latest data for token ${token}:`, e.message);
    }
    return [];
}

async function runLiveScanner() {
    console.log('[Live Scanner] Starting 5-minute scan cycle...');
    
    // Check Market Time (09:15 to 15:30 IST)
    const now = new Date();
    // Assuming the server timezone is IST. If not, calculate IST time:
    const istTime = new Date(now.getTime() + (330 * 60 * 1000) + (now.getTimezoneOffset() * 60000));
    const hours = istTime.getHours();
    const minutes = istTime.getMinutes();
    const timeValue = hours * 100 + minutes; // e.g. 915, 1530
    
    if (timeValue < 915 || timeValue > 1530) {
        console.log(`[Live Scanner] Market is closed (${hours}:${minutes}). Exiting...`);
        process.exit(0);
    }
    
    // Strategy is now handled directly inside the Python backend
    // No need to read active_strategy.py from disk

    // 1. Authenticate
    const loginData = await login();
    if (!loginData || !loginData.status) {
        console.error('[Live Scanner] Angel One login failed.');
        process.exit(1);
    }
    
    // 2. Fetch Master list
    await fetchTop200Stocks();
    
    const symbols = getScannerSymbols();
    console.log(`[Live Scanner] Scanning ${symbols.length} symbols...`);

    for (const symbol of symbols) {
        try {
            console.log(`  - Processing ${symbol}...`);
            const token = store.symbolToTokenMaster[symbol] || store.symbolToTokenMaster[`${symbol}:NSE`];
            if (!token) continue;

            // Load 5-month local data
            let historicalData = readHistoricalCsv(symbol);
            
            // Load latest data from Angel One
            const latestData = await fetchLatestData(token);
            await sleep(DELAY_MS); // Throttling
            
            // Merge without duplicates
            const existingTimes = new Set(historicalData.map(d => d.datetime));
            for (const c of latestData) {
                if (!existingTimes.has(c.datetime)) {
                    historicalData.push(c);
                }
            }
            
            // Ensure chronological order
            historicalData.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
            
            // Send to Python Engine
            const payload = {
                symbol: symbol,
                interval: "FIVE_MINUTE",
                strategy: "RSI", // Use built-in RSI strategy on python server
                params: {},
                historical_data: historicalData
            };
            
            const pythonRes = await axios.post('http://127.0.0.1:8000/api/evaluate-strategy', payload, { timeout: 30000 });
            
            // Process Python Response
            const resultData = pythonRes.data;
            if (Array.isArray(resultData) && resultData.length > 0) {
                // Find the latest marker (e.g. BUY/SELL signal)
                // Filter to items that have a 'type' property (assuming frontend outputs 'type' for signals)
                const signals = resultData.filter(d => d.type === 'BUY' || d.type === 'SELL');
                
                if (signals.length > 0) {
                    const latestSignal = signals[signals.length - 1]; // Get the last signal
                    
                    // Upsert into DB
                    await StrategySignal.upsert({
                        symbol: symbol,
                        signalType: latestSignal.type,
                        indicatorValues: latestSignal,
                        timestamp: new Date() // Time of evaluation
                    });
                    console.log(`    => Stored ${latestSignal.type} signal for ${symbol}`);
                } else {
                    // Update timestamp to show it was evaluated, but no signal
                    await StrategySignal.upsert({
                        symbol: symbol,
                        signalType: 'NONE',
                        indicatorValues: {},
                        timestamp: new Date()
                    });
                }
            }
        } catch (err) {
            console.error(`[Live Scanner] Error processing ${symbol}:`, err.message);
        }
    }

    console.log('[Live Scanner] Scan cycle complete.');
    process.exit(0);
}

runLiveScanner();
