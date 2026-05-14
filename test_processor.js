const fs = require('fs');
const path = require('path');
const { processStockTick } = require('./util/process-stock-tick');

const logFile = path.join(__dirname, 'testing.log');
const liveJson = path.join(__dirname, 'live-data.json');

// 1. Reset testing.log
fs.writeFileSync(logFile, `[${new Date().toLocaleString()}] --- RESUMING SIMULATION WITH LIVE-DATA.JSON ---\n`);

function log(msg) {
    const time = new Date().toLocaleString();
    fs.appendFileSync(logFile, `[${time}] ${msg}\n`);
}

async function startTest() {
    try {
        log("--- STARTING TEST: SOURCE = LIVE-DATA.JSON ---");

        if (!fs.existsSync(liveJson)) {
            log("ERROR: live-data.json not found.");
            return;
        }

        // 2. Load data from live-data.json
        let df = JSON.parse(fs.readFileSync(liveJson, 'utf8'));
        
        const historicalData = {
            'ABB': {
                df: df,
                last_seen: df[df.length - 1].datetime
            }
        };

        log(`Loaded ${df.length} rows from live-data.json. Starting simulation...`);

        // 3. Simulate ticks every 2 seconds
        setInterval(async () => {
            try {
                const currentDf = historicalData['ABB'].df;
                const last = currentDf[currentDf.length - 1];
                
                // Simulate some price change from the last known close
                const ltp = (parseFloat(last.close) + (Math.random() * 4 - 2)).toFixed(2);
                
                const tick = {
                    symbol: 'ABB',
                    exchange: 'NSE',
                    last_traded_price: ltp,
                    v: parseInt(last.volume) + Math.floor(Math.random() * 50),
                    datetime: new Date().toISOString(),
                };

                // Redirect console.log to our file
                const originalLog = console.log;
                console.log = (...args) => log("[LOG] " + args.join(" "));

                await processStockTick('ABB', tick, historicalData);

                // After processing, also explicitly log the RSI from the dataframe
                const updatedDf = historicalData['ABB'].df;
                const latest = updatedDf[updatedDf.length - 1];
                log(`[DEBUG] ABB CURRENT RSI: ${latest.RSI ? latest.RSI.toFixed(4) : 'N/A'}`);

                console.log = originalLog;

            } catch (err) {
                log(`ERROR: ${err.message}`);
            }
        }, 2000);

    } catch (error) {
        log(`CRITICAL ERROR: ${error.message}`);
    }
}

startTest();
