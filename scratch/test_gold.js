
const { getHistoricalCandle } = require('../services/angelOne');
const store = require('../services/marketStore');
const { login } = require('../services/authService');
const axios = require('axios');

async function test() {
    try {
        console.log("Logging in...");
        const loginData = await login();
        if (!loginData || !loginData.status) {
            console.error("Login failed");
            return;
        }

        console.log("Fetching Master Scrip...");
        const response = await axios.get("https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json");
        store.mcxMasterData = response.data.filter(s => s.exch_seg === "MCX");
        store.nfoMasterData = response.data.filter(s => s.exch_seg === "NFO");

        const goldContracts = store.mcxMasterData.filter(s =>
            (s.name === 'GOLD' || s.name === 'GOLDM') &&
            s.instrumenttype === 'FUTCOM'
        );

        if (goldContracts.length === 0) {
            console.log("No Gold contracts found");
            return;
        }

        // Pick one
        const contract = goldContracts[0];
        console.log(`Testing with ${contract.symbol} (${contract.token})`);

        const now = new Date();
        const fDateStr = "2026-05-01 00:00";
        const tDateStr = now.toISOString().split('T')[0] + " 23:59";

        console.log(`Requesting data from ${fDateStr} to ${tDateStr} with ONE_DAY interval`);
        const candles = await getHistoricalCandle({
            symbol: contract.symbol,
            interval: "ONE_DAY",
            fromDate: fDateStr,
            toDate: tDateStr,
            exchange: "MCX",
            symboltoken: contract.token,
            skipSave: true
        });


        console.log(`Received ${candles.length} candles.`);
        candles.forEach(c => console.log(`Candle: ${c.timestamp} | IST: ${new Date(new Date(c.timestamp).getTime() + 330*60*1000).toISOString()}`));
        if (candles.length > 0) {
            console.log("Last candle:", candles[candles.length - 1]);
        }


        console.log(`Requesting data with FIVE_MINUTE interval`);
        const candles5m = await getHistoricalCandle({
            symbol: contract.symbol,
            interval: "FIVE_MINUTE",
            fromDate: now.toISOString().split('T')[0] + " 00:00",
            toDate: tDateStr,
            exchange: "MCX",
            symboltoken: contract.token,
            skipSave: true
        });
        console.log(`Received ${candles5m.length} candles for today (5m).`);
        if (candles5m.length > 0) {
            console.log("First candle today:", candles5m[0]);
            console.log("Last candle today:", candles5m[candles5m.length - 1]);
        }

    } catch (err) {
        console.error("Test error:", err);
    }
}

test();
