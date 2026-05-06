const axios = require('axios');

async function test() {
    try {
        const response = await axios.get("https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json");
        const all = response.data;
        
        const bfo = all.filter(s => s.name === "ABB" && s.exch_seg === "BFO" && s.instrumenttype.startsWith("FUT"));
        console.log(`ABB Futures in BFO:`, JSON.stringify(bfo, null, 2));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

test();
