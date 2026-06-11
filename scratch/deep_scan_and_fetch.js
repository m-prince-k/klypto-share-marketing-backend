const fs = require('fs');
const path = require('path');
const csv = require('csvtojson');
const { createObjectCsvWriter } = require('csv-writer');
const { login } = require('../services/authService');
const smartApi = require('../services/smartApi');
const axios = require('axios');
const { MACD } = require('technicalindicators');

const dirPath = 'c:\\Users\\HP\\Desktop\\trading_klypto\\klypto-share-marketing-backend\\historical_csv';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function runDeepScan() {
    console.log("Logging into AngelOne API...");
    await login();

    console.log("Fetching Scrip Master...");
    const response = await axios.get("https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json");
    const master = response.data;

    // Step 1: Generate Master Calendar
    console.log("Generating Master Calendar from RELIANCE.csv and HDFCBANK.csv...");
    const masterDates = new Set();
    for (const refSymbol of ['RELIANCE', 'HDFCBANK', 'NIFTY']) {
        const refPath = path.join(dirPath, `${refSymbol}.csv`);
        if (fs.existsSync(refPath)) {
            const rows = await csv().fromFile(refPath);
            for (const r of rows) {
                if (r.datetime) {
                    masterDates.add(r.datetime.split(' ')[0]);
                }
            }
        }
    }
    const allTradingDays = Array.from(masterDates).sort();
    console.log(`Total active trading days found in master calendar: ${allTradingDays.length}`);

    // Step 2: Iterate and Fetch
    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.csv'));
    
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const symbol = file.replace('.csv', '');
        const filePath = path.join(dirPath, file);
        
        const rows = await csv().fromFile(filePath);
        if (rows.length === 0) continue;

        const fileDates = new Set();
        for (const r of rows) {
            if (r.datetime) fileDates.add(r.datetime.split(' ')[0]);
        }

        // Find Missing Dates
        const missingDates = [];
        for (const date of allTradingDays) {
            if (!fileDates.has(date)) {
                missingDates.push(date);
            }
        }

        if (missingDates.length > 0) {
            console.log(`[${i+1}/${files.length}] ${symbol} is missing ${missingDates.length} whole days (e.g., ${missingDates[0]}). Fetching...`);
            
            const match = master.find(s => s.symbol === symbol + "-EQ" && s.exch_seg === "NSE");
            if (!match) {
                console.error(`  -> Could not find token for ${symbol}. Skipping.`);
                continue;
            }

            let newCandlesCount = 0;
            // Fetch each missing date
            for (const mDate of missingDates) {
                const fStr = `${mDate} 09:15`;
                const tStr = `${mDate} 15:30`;

                let retries = 3;
                let success = false;
                
                while (retries > 0 && !success) {
                    try {
                        const res = await smartApi.getCandleData({
                            exchange: "NSE",
                            symboltoken: match.token,
                            interval: "FIVE_MINUTE",
                            fromdate: fStr,
                            todate: tStr
                        });

                        if (res.status && res.data && res.data.length > 0) {
                            for (const c of res.data) {
                                // AngelOne format: "2026-04-28T09:15:00+05:30"
                                // Just replace T with space and substring to get IST locally without timezone shifts!
                                const dtStr = c[0].replace('T', ' ').substring(0, 19);
                                
                                rows.push({
                                    datetime: dtStr,
                                    open: c[1],
                                    high: c[2],
                                    low: c[3],
                                    close: c[4],
                                    volume: c[5]
                                });
                                newCandlesCount++;
                            }
                            success = true;
                        } else if (res.message && res.message.includes("Rate limit")) {
                            await sleep(2000);
                            retries--;
                        } else {
                            // No data for this specific day? Maybe not traded.
                            success = true;
                        }
                    } catch (e) {
                        await sleep(2000);
                        retries--;
                    }
                }
                await sleep(400); // Prevent hitting rate limits across multiple dates
            }

            if (newCandlesCount > 0) {
                console.log(`  -> Fetched ${newCandlesCount} new candles. Recalculating MACD & Percentages...`);
                
                // Sort the entire array
                rows.sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());

                // Deduplicate just in case
                const uniqueRowsMap = new Map();
                for (const r of rows) uniqueRowsMap.set(r.datetime, r);
                const sortedRows = Array.from(uniqueRowsMap.values());

                // 1. Recalculate MACD Histogram
                const macdConfig = { values: [], fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false };
                const macd = new MACD(macdConfig);
                
                for (const r of sortedRows) {
                    const macdResult = macd.nextValue(parseFloat(r.close));
                    r.histogram = macdResult && macdResult.histogram !== undefined ? macdResult.histogram.toFixed(4) : "0.0000";
                }

                // 2. Recalculate Previous and Percentage columns
                const uniqueDates = [];
                const lastCandleOfDate = {};
                for (const r of sortedRows) {
                    const dateOnly = r.datetime.split(' ')[0];
                    if (!uniqueDates.includes(dateOnly)) uniqueDates.push(dateOnly);
                    lastCandleOfDate[dateOnly] = r;
                }

                for (const r of sortedRows) {
                    const dateOnly = r.datetime.split(' ')[0];
                    const dateIndex = uniqueDates.indexOf(dateOnly);
                    
                    let prevHist = "0.0000";
                    let prevClose = "0.0000";
                    if (dateIndex > 0) {
                        const prevDate = uniqueDates[dateIndex - 1];
                        prevHist = parseFloat(lastCandleOfDate[prevDate].histogram || 0).toFixed(4);
                        prevClose = parseFloat(lastCandleOfDate[prevDate].close || 0).toFixed(4);
                    }
                    
                    const cHist = parseFloat(r.histogram || 0);
                    const pHist = parseFloat(prevHist);
                    let percentageHist = "0.00";
                    if (pHist !== 0) percentageHist = (((cHist - pHist) / pHist) * 100).toFixed(2);
                    else percentageHist = cHist > 0 ? "100.00" : (cHist < 0 ? "-100.00" : "0.00");
                    
                    const cClose = parseFloat(r.close || 0);
                    const pClose = parseFloat(prevClose);
                    let percentageClose = "0.00";
                    if (pClose !== 0) percentageClose = (((cClose - pClose) / pClose) * 100).toFixed(2);
                    else percentageClose = cClose > 0 ? "100.00" : (cClose < 0 ? "-100.00" : "0.00");
                    
                    r.previoushistogram = prevHist;
                    r.percentagehistogram = percentageHist;
                    r.previousclose = prevClose;
                    r.percentageclose = percentageClose;
                }

                // 3. Save
                const header = Object.keys(sortedRows[0]).map(k => ({id: k, title: k}));
                const csvWriter = createObjectCsvWriter({ path: filePath, header: header });
                await csvWriter.writeRecords(sortedRows);
                console.log(`  -> Successfully saved ${file}!`);
            }
        }
    }
    
    console.log("\nDeep Scan & Fetch completed successfully!");
    process.exit(0);
}

runDeepScan().catch(console.error);
