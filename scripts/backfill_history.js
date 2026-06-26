require('dotenv').config();
const db = require('../models');
const { login } = require('../services/authService');
const smartApi = require('../services/smartApi');
const store = require('../services/marketStore');
const { syncMasterScrips } = require('../services/stockService');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchWithRetry(params, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            await delay(1500); // Strict 1.5s delay to prevent rate limits
            const response = await smartApi.getCandleData(params);
            
            // Check if rate limited
            const isRateLimited = response && (
                (typeof response === 'string' && response.includes('exceeding access rate')) ||
                (response.message && response.message.includes('exceeding access rate')) ||
                (!response.status && response.errorcode === 'AG8001')
            );

            if (isRateLimited) {
                console.warn(`[API] Rate limited for ${params.symboltoken}. Retrying in ${3000 * (i+1)}ms...`);
                await delay(3000 * (i + 1));
                continue;
            }

            if (response && response.status && response.data) {
                return response.data;
            } else {
                // E.g. token expired
                if (response && (String(response.status) === "403" || response.errorcode === "AB1004" || String(response.message).includes("Invalid Token"))) {
                    console.log(`[API] Token Expired. Forcing Re-Login...`);
                    await login(true);
                    return await fetchWithRetry(params, retries - i);
                }
                console.log(`[API] Empty/Error response for ${params.symboltoken}:`, response);
                return [];
            }
        } catch (err) {
            console.error(`[API] Error on attempt ${i + 1}:`, err.message);
            await delay(3000 * (i + 1));
        }
    }
    return [];
}

async function run() {
    try {
        console.log("Starting Backfill Process...");
        
        // 1. Setup DB connection
        await db.sequelize.authenticate();
        console.log("DB connected successfully.");

        // 2. Login to Angel One
        await login();
        console.log("Angel One Login Successful.");

        // 3. Populate master scrip list
        console.log("Fetching Master Scrips...");
        await syncMasterScrips();
        console.log("Master Scrips populated.");

        // 4. Get DISTINCT symbols from historical_candles
        const [results] = await db.sequelize.query(`SELECT DISTINCT symbol FROM historical_candles`);
        const symbols = results.map(r => r.symbol);
        console.log(`Found ${symbols.length} distinct symbols in historical_candles.`);

        // The date chunks
        const chunks = [
            { from: "2024-10-01 09:15", to: "2024-10-31 15:30" },
            { from: "2024-11-01 09:15", to: "2024-11-30 15:30" },
            { from: "2024-12-01 09:15", to: "2024-12-31 15:30" }
        ];

        let processedCount = 0;

        for (const symbol of symbols) {
            processedCount++;
            console.log(`\n[${processedCount}/${symbols.length}] Processing ${symbol}...`);

            // Find token
            // Wait, store might use symbol with "-EQ" or without.
            let token = store.symbolToTokenMaster[symbol] || store.symbolToTokenMaster[symbol.toUpperCase()];
            if (!token) {
                // Try searching manualMap or store.stocks directly
                const stockObj = store.stocks.find(s => s.name === symbol || s.userCode === symbol || s.actualSymbol === symbol);
                if (stockObj) {
                    token = stockObj.token;
                }
            }

            if (!token) {
                console.log(`WARNING: Token not found for ${symbol}. Skipping.`);
                continue;
            }

            let allCandles = [];

            for (const chunk of chunks) {
                console.log(`  Fetching chunk ${chunk.from} to ${chunk.to}...`);
                const params = {
                    exchange: "NSE", // Assuming NSE equity
                    symboltoken: token,
                    interval: "FIVE_MINUTE",
                    fromdate: chunk.from,
                    todate: chunk.to
                };

                const data = await fetchWithRetry(params);
                console.log(`  Got ${data.length} candles.`);
                allCandles = allCandles.concat(data);
            }

            if (allCandles.length === 0) {
                console.log(`  No data found for ${symbol}. Moving to next.`);
                continue;
            }

            // Insert into historical_candles using raw query with ON CONFLICT DO NOTHING
            console.log(`  Inserting ${allCandles.length} records into DB for ${symbol}...`);

            // Sort to ensure chronological order just in case
            allCandles.sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime());

            // Prepare values for bulk insert
            // historical_candles structure: id (serial), symbol, datetime, open, high, low, close, volume
            const valuesParams = [];
            const bindParams = {};
            
            let paramIndex = 1;
            for (let i = 0; i < allCandles.length; i++) {
                const c = allCandles[i];
                let ts;
                const rawTs = c[0];
                if (typeof rawTs === 'string' && !rawTs.includes('T') && !rawTs.includes('Z') && !rawTs.includes('+')) {
                    ts = new Date(rawTs + " +05:30");
                } else {
                    ts = new Date(rawTs);
                }

                // Filter out records that are exactly at 2025-01-01 or later, just to be strictly safe
                if (ts.getTime() >= new Date("2025-01-01T00:00:00+05:30").getTime()) {
                    continue;
                }

                valuesParams.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`);
                
                bindParams[`v${paramIndex-7}`] = symbol;
                bindParams[`v${paramIndex-6}`] = ts;
                bindParams[`v${paramIndex-5}`] = parseFloat(c[1]);
                bindParams[`v${paramIndex-4}`] = parseFloat(c[2]);
                bindParams[`v${paramIndex-3}`] = parseFloat(c[3]);
                bindParams[`v${paramIndex-2}`] = parseFloat(c[4]);
                bindParams[`v${paramIndex-1}`] = parseInt(c[5]);
            }

            if (valuesParams.length > 0) {
                const queryStr = `
                    INSERT INTO historical_candles (symbol, datetime, open, high, low, close, volume)
                    VALUES ${valuesParams.join(", ")}
                    ON CONFLICT ON CONSTRAINT historical_candles_symbol_datetime_key DO NOTHING;
                `;
                
                // Convert bindParams to an array for sequelize query binding
                const bindArr = [];
                for (let i = 1; i < paramIndex; i++) {
                    bindArr.push(bindParams[`v${i}`]);
                }

                try {
                    await db.sequelize.query(queryStr, { bind: bindArr });
                    console.log(`  Successfully inserted missing records for ${symbol}.`);
                } catch (dbErr) {
                    // If ON CONFLICT ON CONSTRAINT fails due to wrong name, try ON CONFLICT (symbol, datetime)
                    if (dbErr.message.includes('does not match any constraint')) {
                        console.log("  Constraint name mismatch. Trying ON CONFLICT (symbol, datetime)...");
                        const fallbackQuery = `
                            INSERT INTO historical_candles (symbol, datetime, open, high, low, close, volume)
                            VALUES ${valuesParams.join(", ")}
                            ON CONFLICT (symbol, datetime) DO NOTHING;
                        `;
                        await db.sequelize.query(fallbackQuery, { bind: bindArr });
                        console.log(`  Successfully inserted missing records for ${symbol} using fallback ON CONFLICT.`);
                    } else {
                        console.error(`  DB Insert error for ${symbol}:`, dbErr.message);
                    }
                }
            } else {
                console.log(`  All fetched records for ${symbol} were skipped (e.g. >= 2025-01-01).`);
            }
        }

        console.log("\nDeep Scan Backfill Process Completed!");
        process.exit(0);

    } catch (e) {
        console.error("Fatal Error:", e);
        process.exit(1);
    }
}

run();
