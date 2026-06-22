const axios = require('axios');

async function test() {
    try {
        const response = await axios.get("https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json");
        const all = response.data;
        
        const motorMatches = all.filter(s => s.symbol.toUpperCase().includes("MOTOR") && s.exch_seg === "NSE" && s.instrumenttype === "");
        console.log(`MOTOR matches:`, motorMatches.map(s => s.symbol));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

test();
