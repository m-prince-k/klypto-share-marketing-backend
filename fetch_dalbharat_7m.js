const { login } = require('./services/authService');
const smartApi = require('./services/smartApi');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

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
    console.log("1. Logging into Angel One...");
    const loginData = await login();
    if (!loginData || !loginData.status) {
        console.error("Login failed!");
        process.exit(1);
    }
    console.log("✅ Login Success");

    console.log("2. Fetching Scrip Master for DALBHARAT...");
    const scripRes = await axios.get("https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json");
    const master = scripRes.data;
    const match = master.find(s => s.symbol === "DALBHARAT-EQ" && s.exch_seg === "NSE");
    if (!match) {
        console.error("DALBHARAT-EQ not found in master!");
        process.exit(1);
    }
    const token = match.token;
    console.log(`✅ Token Found: ${token}`);

    console.log("3. Fetching 7 Months Data (5-minute interval)...");
    
    // We will fetch 7 chunks of 30 days
    let allData = [];
    let toDate = new Date(); // Today
    toDate.setHours(15, 30, 0, 0);

    for (let i = 0; i < 7; i++) {
        let fromDate = new Date(toDate);
        fromDate.setDate(fromDate.getDate() - 30);
        fromDate.setHours(9, 15, 0, 0);

        const fStr = formatDate(fromDate);
        const tStr = formatDate(toDate);
        console.log(`⏳ Fetching chunk ${i+1}/7: ${fStr} to ${tStr}...`);

        try {
            const reqData = {
                exchange: "NSE",
                symboltoken: token,
                interval: "FIVE_MINUTE",
                fromdate: fStr,
                todate: tStr
            };
            const response = await smartApi.getCandleData(reqData);
            if (response && response.status && response.data) {
                console.log(` ✅ Received ${response.data.length} candles.`);
                allData = allData.concat(response.data);
            } else {
                console.log(` ⚠️ API Error/Empty:`, response?.message || "Unknown error");
            }
        } catch(e) {
            console.error(` ❌ Fetch failed: ${e.message}`);
        }

        // Set next chunk's 'to' date as current chunk's 'from' date
        toDate = new Date(fromDate);
        await new Promise(r => setTimeout(r, 1000)); // Sleep to prevent rate limit
    }

    if (allData.length === 0) {
        console.error("No data fetched at all!");
        process.exit(1);
    }

    // Process and sort unique data
    console.log("4. Processing and saving to CSV...");
    
    const uniqueMap = new Map();
    for (const row of allData) {
        // row format: [timestamp, open, high, low, close, volume]
        const dt = new Date(row[0]).getTime();
        uniqueMap.set(dt, row);
    }

    const sortedData = Array.from(uniqueMap.values()).sort((a, b) => new Date(a[0]) - new Date(b[0]));
    
    const header = "datetime,open,high,low,close,volume\n";
    const csvRows = sortedData.map(r => {
        // Format datetime slightly nicely if needed, or just keep it
        let dtStr = r[0];
        if (dtStr.includes("T")) dtStr = dtStr.replace("T", " ").substring(0, 19);
        return `${dtStr},${r[1]},${r[2]},${r[3]},${r[4]},${r[5]}`;
    });

    const finalCsv = header + csvRows.join("\n") + "\n";
    fs.writeFileSync(CSV_PATH, finalCsv, 'utf-8');
    
    console.log(`\n=========================================`);
    console.log(`🎉 SUCCESS! DALBHARAT 7-Months Data Saved`);
    console.log(`=========================================`);
    console.log(`📊 Total Unique Candles : ${sortedData.length}`);
    console.log(`📅 From                 : ${sortedData[0][0]}`);
    console.log(`📅 To                   : ${sortedData[sortedData.length - 1][0]}`);
    console.log(`📁 File Path            : ${CSV_PATH}`);
    
    process.exit(0);
}

run();
