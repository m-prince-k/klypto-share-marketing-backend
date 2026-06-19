const fs = require('fs');
const path = require('path');
const { login } = require('../services/authService');
const { fetchTop200Stocks } = require('../services/stockService');
const { fetchManualHistoricalData } = require('../services/historicalService');
const store = require('../services/marketStore');

const HISTORICAL_CSV_PATH = path.join(__dirname, '../historical_csv');

// Format date to YYYY-MM-DD HH:mm:ss
function formatCsvDate(dateObj) {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    const hours = String(dateObj.getHours()).padStart(2, '0');
    const minutes = String(dateObj.getMinutes()).padStart(2, '0');
    const seconds = String(dateObj.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

const lastDateCache = {};

async function getLastDateFromCsv(filePath) {
    try {
        if (!fs.existsSync(filePath)) return null;
        
        const stats = fs.statSync(filePath);
        if (stats.size === 0) return null;
        
        // Read the last 2048 bytes of the file instantly instead of streaming the whole 5MB file
        const fd = fs.openSync(filePath, 'r');
        const bufferSize = Math.min(stats.size, 2048);
        const buffer = Buffer.alloc(bufferSize);
        
        fs.readSync(fd, buffer, 0, bufferSize, stats.size - bufferSize);
        fs.closeSync(fd);
        
        const lines = buffer.toString('utf8').split('\n').filter(l => l.trim().length > 0);
        if (lines.length > 0) {
            const lastLine = lines[lines.length - 1];
            if (!lastLine.includes('datetime,open')) {
                const parts = lastLine.split(',');
                if (parts.length >= 6) {
                    const dateStr = parts[0];
                    return new Date(dateStr);
                }
            }
        }
        return null;
    } catch (error) {
        console.error(`[CSV Updater] Non-fatal error reading last date from ${filePath}:`, error.message);
        return null;
    }
}

async function updateCsvFile(file, filePath) {
    const symbol = file.replace('.csv', '');
    
    let lastDate = lastDateCache[symbol];
    if (!lastDate) {
        lastDate = await getLastDateFromCsv(filePath);
    }
    
    if (!lastDate) {
        console.log(`[CSV Updater] Skipping ${symbol} - No valid last date found.`);
        return;
    }

    const now = new Date();
    
    // If last date in CSV is very close to now (within 5 mins), skip
    const diffMins = (now - lastDate) / (1000 * 60);
    if (diffMins < 5) {
        // Just update cache in case it was missing
        lastDateCache[symbol] = lastDate;
        return;
    }

    // Format fromDate as lastDate + 1 minute to avoid duplicating the last candle
    const fetchFromDate = new Date(lastDate.getTime() + 60000);
    
    // We only want to fetch 5 min intervals
    try {
        console.log(`[CSV Updater] Fetching gap for ${symbol} from ${formatCsvDate(fetchFromDate)}...`);
        const result = await fetchManualHistoricalData({
            symbol: symbol,
            interval: 'FIVE_MINUTE',
            fromDate: fetchFromDate,
            toDate: now,
            exchange: 'NSE',
            forceApi: true
        });

        if (result && result.success && result.data && result.data.length > 0) {
            let appendedCount = 0;
            let appendStr = '';
            let newLastDate = lastDate;
            
            for (const candle of result.data) {
                // Ensure timestamp is strictly strictly greater than lastDate to prevent duplicate
                const candleTime = new Date(candle.timestamp);
                if (candleTime > lastDate) {
                    const csvLine = `\n${formatCsvDate(candleTime)},${candle.open},${candle.high},${candle.low},${candle.close},${candle.volume}`;
                    appendStr += csvLine;
                    appendedCount++;
                    if (candleTime > newLastDate) {
                        newLastDate = candleTime;
                    }
                }
            }

            if (appendedCount > 0) {
                try {
                    fs.appendFileSync(filePath, appendStr);
                    lastDateCache[symbol] = newLastDate; // Update memory cache
                    console.log(`[CSV Updater] Successfully appended ${appendedCount} rows to ${file}.`);
                } catch (fsErr) {
                    console.error(`[CSV Updater] File write error for ${file}:`, fsErr.message);
                }
            } else {
                console.log(`[CSV Updater] No new rows to append for ${file}.`);
            }
        } else {
            console.log(`[CSV Updater] API returned no new data for ${file}.`);
        }
    } catch (err) {
        console.error(`[CSV Updater] Error fetching data for ${symbol}:`, err.message);
    }
}

// List of NSE Trading Holidays (YYYY-MM-DD format)
// Update this array for each year's official NSE holiday calendar.
const MARKET_HOLIDAYS = [
    '2026-01-26', // Republic Day
    '2026-03-03', // Mahashivratri
    '2026-03-24', // Holi
    '2026-04-03', // Good Friday
    '2026-04-14', // Ambedkar Jayanti
    '2026-05-01', // Maharashtra Day
    '2026-08-15', // Independence Day
    '2026-10-02', // Gandhi Jayanti
    '2026-11-08', // Diwali (Approx)
    '2026-12-25'  // Christmas
];

function formatLocalYYYYMMDD(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

let lastLoginDateStr = null;

async function startUpdater() {
    console.log(`[CSV Updater] Starting CSV auto update process...`);
    
    const now = new Date();
    const day = now.getDay();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const currentTime = hours * 100 + minutes;
    const dateStr = formatLocalYYYYMMDD(now);
    
    // Check if outside market hours (Monday-Friday, 9:15 AM to 11:30 PM to get final candles and catchups), or Holiday
    if (day === 0 || day === 6 || currentTime < 915 || currentTime > 2330 || MARKET_HOLIDAYS.includes(dateStr)) {
        console.log(`[CSV Updater] [${now.toLocaleString()}] Market is closed (Weekend, Holiday, or Off-hours).`);
        return false; // Indicates market is closed
    }

    try {
        // Ensure valid session is always active (uses cached token if valid)
        await login();
        
        // Only fetch master tokens ONCE per day
        if (lastLoginDateStr !== dateStr) {
            console.log(`[CSV Updater] New day detected (${dateStr}). Fetching Master Tokens...`);
            await fetchTop200Stocks();
            console.log(`[CSV Updater] Successfully fetched Master Tokens.`);
            
            // Wait 2 seconds to ensure master tokens are populated in store
            await new Promise(r => setTimeout(r, 2000));
            
            lastLoginDateStr = dateStr;
        }

        if (!fs.existsSync(HISTORICAL_CSV_PATH)) {
            console.error(`[CSV Updater] Error: Folder ${HISTORICAL_CSV_PATH} not found.`);
            return;
        }

        const files = fs.readdirSync(HISTORICAL_CSV_PATH).filter(f => f.endsWith('.csv'));
        console.log(`[CSV Updater] Found ${files.length} CSV files to process.`);

        for (const file of files) {
            const filePath = path.join(HISTORICAL_CSV_PATH, file);
            await updateCsvFile(file, filePath);
            
            // Wait 800ms between each stock to guarantee we never hit Angel One API limits (which causes Fallback/Empty data)
            await new Promise(r => setTimeout(r, 800));
        }

        console.log(`[CSV Updater] [${new Date().toLocaleString()}] Cycle completed successfully.`);
        return true;

    } catch (err) {
        console.error(`[CSV Updater] Error during cycle:`, err);
        return true; // Still return true so it uses the standard 30s delay on random errors
    }
}

// Run recursively to prevent overlapping cycles
async function runAutoUpdaterLoop() {
    console.log(`[CSV Updater] Service is ONLINE. Automatically fetching during market hours...`);
    while (true) {
        const cycleStart = Date.now();
        const marketWasOpen = await startUpdater();
        
        const cycleDuration = (Date.now() - cycleStart) / 1000;
        console.log(`[CSV Updater] Cycle took ${cycleDuration.toFixed(1)} seconds.`);
        
        if (marketWasOpen === false) {
            // Market is closed, sleep for 5 minutes to reduce unnecessary checks and CPU usage
            console.log(`[CSV Updater] Sleeping for 5 minutes before next check...`);
            await new Promise(r => setTimeout(r, 5 * 60 * 1000));
        } else {
            // Market is open, wait 30 seconds before the next cycle. 
            // Since the cycle itself takes ~3 minutes (200 stocks * 800ms), sleeping 30s makes the total loop exactly ~3.5 mins.
            // This is perfect for fetching 5-minute candles without missing or lagging!
            console.log(`[CSV Updater] Sleeping for 30 seconds before next cycle...`);
            await new Promise(r => setTimeout(r, 30000));
        }
    }
}

runAutoUpdaterLoop();
