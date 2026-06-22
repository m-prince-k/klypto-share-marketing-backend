const axios = require('axios');

async function test() {
    try {
        const response = await axios.get("https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json");
        const all = response.data;
        
        const tataNames = all.filter(s => s.name.toUpperCase().includes("TATA") && s.exch_seg === "NSE" && s.instrumenttype === "")
                             .map(s => `${s.symbol} (${s.name})`);
        console.log(`TATA names in NSE:`, tataNames);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

test();
