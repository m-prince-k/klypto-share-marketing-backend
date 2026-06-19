const { fetchManualHistoricalData } = require('../services/historicalService');
const { login } = require('../services/authService');
const { fetchTop200Stocks } = require('../services/stockService');
const db = require('../models');

async function test() {
    await db.sequelize.authenticate();
    await login();
    await fetchTop200Stocks();
    
    // Test fetching from 12:36 to now
    const fromDate = new Date("2026-06-17T12:36:00+05:30");
    const toDate = new Date();
    
    console.log("Fetching from:", fromDate, "to:", toDate);
    
    try {
        const res = await fetchManualHistoricalData({
            symbol: "360ONE",
            interval: "FIVE_MINUTE",
            fromDate: fromDate,
            toDate: toDate,
            exchange: "NSE"
        });
        
        console.log("Source:", res.source);
        console.log("Data length:", res.data.length);
        if (res.data.length > 0) {
            console.log("First:", res.data[0].timestamp);
            console.log("Last:", res.data[res.data.length-1].timestamp);
        }
    } catch (err) {
        console.error("Error:", err);
    }
    process.exit(0);
}
test();
