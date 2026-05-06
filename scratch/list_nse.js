const axios = require('axios');
const fs = require('fs');

async function test() {
    try {
        console.log("Fetching master list...");
        const response = await axios.get("https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json");
        const all = response.data;
        console.log(`Total records: ${all.length}`);
        
        const symbols = all.filter(s => s.exch_seg === "NSE" && s.instrumenttype === "").map(s => s.symbol);
        fs.writeFileSync('scratch/nse_symbols.txt', symbols.join('\n'));
        console.log("Saved NSE symbols to scratch/nse_symbols.txt");

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

test();
