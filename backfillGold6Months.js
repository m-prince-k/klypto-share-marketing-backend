/**
 * backfillGold6Months.js
 * Fetches and saves 6 months of historical GOLD (MCX) 1-minute data into the database.
 */

const { sequelize, Candle } = require('./models');
const { login } = require('./services/authService');
const { getCandlesWithCache, formatDate } = require('./services/dbService');
require('dotenv').config();

async function run() {
    try {
        console.log("--------------------------------------------------");
        console.log("🚀 STARTING GOLD 6-MONTH BACKFILL SCRIPT");
        console.log("--------------------------------------------------");

        // 1. Sync DB
        await sequelize.authenticate();
        console.log("✅ Database Connected.");

        // 2. Login to Angel One
        const loginData = await login();
        if (!loginData || !loginData.status) {
            console.error("❌ Angel One login failed. Check TOTP/Credentials.");
            process.exit(1);
        }
        console.log("✅ Angel One Session Generated.");

        const symbol = "GOLD";
        const token = "234454"; // Gold MCX Token
        const exchange = "MCX";
        const interval = "ONE_MINUTE";

        // 3. Define Range (6 months ago to today)
        const toDate = new Date();
        const fromDate = new Date();
        fromDate.setMonth(fromDate.getMonth() - 6);

        const fStr = formatDate(fromDate, "09:00");
        const tStr = formatDate(toDate, "23:55");

        console.log(`📡 Fetching ${symbol} from ${fStr} to ${tStr}...`);
        
        // This function automatically handles 30-day chunking and saving to DB
        const result = await getCandlesWithCache(symbol, token, exchange, interval, fStr, tStr);

        console.log("--------------------------------------------------");
        console.log(`🎉 BACKFILL COMPLETE!`);
        console.log(`📦 Source: ${result.source}`);
        console.log(`📊 Records Processed: ${result.data?.length || 0}`);
        console.log("--------------------------------------------------");
        
        process.exit(0);
    } catch (err) {
        console.error("❌ Error during backfill:", err);
        process.exit(1);
    }
}

run();
