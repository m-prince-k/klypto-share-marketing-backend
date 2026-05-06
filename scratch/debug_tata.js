const axios = require('axios');

async function test() {
    try {
        const response = await axios.get("https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json");
        const all = response.data;
        
        const tataSymbols = all.filter(s => s.symbol.startsWith("TATA") && s.exch_seg === "NSE" && s.instrumenttype === "")
                              .map(s => s.symbol);
        console.log(`TATA symbols in NSE:`, tataSymbols);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

test();
