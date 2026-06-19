const fs = require('fs');
const path = require('path');
const { login } = require('../services/authService');
const smartApi = require('../services/smartApi');

// Need to load master data
const axios = require('axios');

function formatDate(date) {
    const d = new Date(date);
    const pad = (n) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function fetchInChunks(symbol, token, fromDate, toDate) {
    let allCandles = [];
    let currentFrom = new Date(fromDate);
    const end = new Date(toDate);

    while (currentFrom < end) {
        let currentTo = new Date(currentFrom);
        currentTo.setDate(currentTo.getDate() + 30); // Max 30 days for 5 min interval in AngelOne
        
        if (currentTo > end) currentTo = end;

        const fStr = formatDate(currentFrom);
        const tStr = formatDate(currentTo);

        console.log(`Fetching ${symbol} from ${fStr} to ${tStr}...`);

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
                console.log(`Received ${res.data.length} candles.`);
            } else {
                console.error(`Failed: ${res.message || res.errorcode}`);
            }
        } catch (e) {
            console.error(`Error: ${e.message}`);
        }

        currentFrom = currentTo;
        // Wait to avoid rate limits
        await new Promise(r => setTimeout(r, 1000));
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
        
        const symbols = ["BAJAJHLDNG", "BANDHANBNK"];
        
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const now = new Date();

        for (const symbol of symbols) {
            const match = master.find(s => s.symbol === symbol + "-EQ" && s.exch_seg === "NSE");
            if (!match) {
                console.error(`Could not find token for ${symbol}`);
                continue;
            }

            console.log(`Found token for ${symbol}: ${match.token}`);
            
            const candles = await fetchInChunks(symbol, match.token, sixMonthsAgo, now);
            
            if (candles.length > 0) {
                const dir = path.join(__dirname, '../historical_csv');
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                
                const filePath = path.join(dir, `${symbol}.csv`);
                const stream = fs.createWriteStream(filePath);
                stream.write("datetime,open,high,low,close,volume\n");
                
                for (const c of candles) {
                    const dt = new Date(c[0]);
                    const dtStr = dt.toISOString().replace('T', ' ').substring(0, 19);
                    stream.write(`${dtStr},${c[1]},${c[2]},${c[3]},${c[4]},${c[5]}\n`);
                }
                
                stream.end();
                console.log(`Saved ${candles.length} candles to ${filePath}`);
            }
        }

        console.log("Done.");
        process.exit(0);

    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

run();
