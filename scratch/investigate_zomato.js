const axios = require('axios');

async function test() {
    try {
        const response = await axios.get("https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json");
        const all = response.data;
        
        const zomato = all.filter(s => s.symbol.startsWith("ZOMATO") && s.exch_seg === "NSE");
        console.log(`ZOMATO matches:`, zomato.map(s => `${s.symbol} | ${s.instrumenttype}`));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

test();
