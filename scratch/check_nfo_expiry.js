const axios = require('axios');

async function test() {
    try {
        const response = await axios.get("https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json");
        const all = response.data;
        
        const nfo = all.filter(s => s.name === "ABB" && s.exch_seg === "NFO" && s.instrumenttype.startsWith("FUT"));
        console.log(`ABB Futures in NFO:`, JSON.stringify(nfo, null, 2));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

test();
