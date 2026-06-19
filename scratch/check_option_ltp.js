const smartApi = require('../services/smartApi');
const store = require('../services/marketStore');
const { fetchTop200Stocks } = require('../services/stockService');

async function checkLtp() {
    try {
        console.log("Initializing Master Lists...");
        await fetchTop200Stocks();
        
        console.log("Waiting for SmartAPI...");
        await new Promise(r => setTimeout(r, 5000));

        // Find a NIFTY option
        const niftyOpt = store.nfoMasterData.find(o => o.name === 'NIFTY' && o.instrumenttype === 'OPTIDX');
        if (!niftyOpt) {
            console.log("No NIFTY options found in master data!");
            process.exit(1);
        }

        console.log(`Checking LTP for ${niftyOpt.symbol} (${niftyOpt.token})...`);
        const response = await smartApi.getCandleData({
            exchange: "NFO",
            symboltoken: niftyOpt.token,
            interval: "FIVE_MINUTE",
            fromdate: "2026-05-04 09:15",
            todate: "2026-05-05 15:30"
        });

        if (response.data && response.data.length > 0) {
            console.log(`SUCCESS! Found ${response.data.length} candles for ${niftyOpt.symbol}`);
        } else {
            console.log(`FAILED! No data for ${niftyOpt.symbol}. Message: ${response.message}`);
        }
        
        process.exit(0);
    } catch (err) {
        console.error("Error:", err.message);
        process.exit(1);
    }
}

checkLtp();
