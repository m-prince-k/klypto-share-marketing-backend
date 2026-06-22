const axios = require('axios');

async function test() {
    try {
        const response = await axios.get("https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json");
        const all = response.data;
        
        const nifty = all.find(s => s.symbol === "NIFTY-EQ" && s.exch_seg === "NSE");
        console.log(`NIFTY:`, nifty);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

test();
