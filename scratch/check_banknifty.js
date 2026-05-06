const axios = require('axios');

async function test() {
    try {
        const response = await axios.get("https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json");
        const all = response.data;
        
        const banknifty = all.filter(s => s.symbol.includes("BANKNIFTY") && s.exch_seg === "NSE");
        console.log(`BANKNIFTY in NSE:`, JSON.stringify(banknifty, null, 2));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

test();
