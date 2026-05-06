const smartApi = require('../services/smartApi');
const { login } = require('../services/authService');
const store = require('../services/marketStore');

async function test() {
    try {
        await login();
        // Get a NIFTY token from master data (let's say a monthly expiry)
        const response = await require('axios').get("https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json");
        const niftyOptions = response.data.filter(s => s.name === "NIFTY" && s.exch_seg === "NFO" && s.instrumenttype === "OPTIDX");
        
        if (niftyOptions.length > 0) {
            const sample = niftyOptions[0];
            console.log(`Testing token ${sample.token} (${sample.symbol})...`);
            
            const now = new Date();
            const sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(now.getMonth() - 6);
            
            const fDate = "2025-11-01 09:15";
            const tDate = "2025-11-30 15:30";
            
            const res = await smartApi.getCandleData({
                exchange: "NFO",
                symboltoken: sample.token,
                interval: "ONE_DAY",
                fromdate: fDate,
                todate: tDate
            });
            
            console.log(`Response for ${sample.symbol} in Nov 2025:`, res.status ? `Success (${res.data.length} candles)` : `Failed: ${res.message}`);
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

test();
