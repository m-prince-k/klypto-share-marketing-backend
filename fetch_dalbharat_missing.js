const { login } = require('./services/authService');
const smartApi = require('./services/smartApi');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const CSV_PATH = path.join(__dirname, 'historical_csv', 'DALBHARAT.csv');

function formatDate(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${mins}`;
}

async function run() {
    console.log("Logging into Angel One...");
    await login();

    const scripRes = await axios.get("https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json");
    const master = scripRes.data;
    const match = master.find(s => s.symbol === "DALBHARAT-EQ" && s.exch_seg === "NSE");
    const token = match.token;

    console.log(`Fetching MISSING DATA for DALBHARAT from 2026-05-08 to 2026-06-09...`);
    
    // Split into two 15-day chunks just to be absolutely safe from 30-day API limit errors
    const chunks = [
        { from: "2026-05-08 09:15", to: "2026-05-24 15:30" },
        { from: "2026-05-25 09:15", to: "2026-06-09 15:30" }
    ];

    let newCandles = [];

    for (const chunk of chunks) {
        console.log(`⏳ Fetching chunk: ${chunk.from} to ${chunk.to}...`);
        try {
            const reqData = {
                exchange: "NSE",
                symboltoken: token,
                interval: "FIVE_MINUTE",
                fromdate: chunk.from,
                todate: chunk.to
            };
            const response = await smartApi.getCandleData(reqData);
            
            if (response && response.status && response.data) {
                console.log(` ✅ Received ${response.data.length} candles.`);
                newCandles = newCandles.concat(response.data);
            } else {
                console.log(` ❌ API Error:`, response?.message || JSON.stringify(response));
            }
        } catch(e) {
            console.error(` ❌ Exception: ${e.message}`);
        }
        await new Promise(r => setTimeout(r, 1000));
    }

    if (newCandles.length === 0) {
        console.error("Failed to fetch new candles! Check API errors above.");
        process.exit(1);
    }

    // Read existing CSV
    const existingContent = fs.readFileSync(CSV_PATH, 'utf-8');
    const lines = existingContent.trim().split('\n');
    const header = lines[0];
    const dataLines = lines.slice(1);

    // Merge and deduplicate
    const uniqueMap = new Map();
    
    // Add existing
    for (const line of dataLines) {
        const cols = line.split(',');
        uniqueMap.set(cols[0], line);
    }

    // Add new
    for (const r of newCandles) {
        let dtStr = r[0];
        if (dtStr.includes("T")) dtStr = dtStr.replace("T", " ").substring(0, 19);
        const line = `${dtStr},${r[1]},${r[2]},${r[3]},${r[4]},${r[5]}`;
        uniqueMap.set(dtStr, line);
    }

    // Sort by datetime
    const sortedDates = Array.from(uniqueMap.keys()).sort((a, b) => new Date(a) - new Date(b));
    
    let finalCsv = header + '\n';
    for (const d of sortedDates) {
        finalCsv += uniqueMap.get(d) + '\n';
    }

    fs.writeFileSync(CSV_PATH, finalCsv, 'utf-8');
    console.log(`\n✅ Successfully added ${newCandles.length} recent candles!`);
    console.log(`Total rows in CSV: ${sortedDates.length}`);
    console.log(`Latest date in CSV: ${sortedDates[sortedDates.length - 1]}`);
}

run();
