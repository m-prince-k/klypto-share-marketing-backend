const axios = require('axios');

async function test() {
    try {
        const response = await axios.get("https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json");
        const all = response.data;
        
        const optstk = all.filter(s => s.instrumenttype === "OPTSTK");
        console.log(`Total OPTSTK: ${optstk.length}`);
        if (optstk.length > 0) {
            const uniqueNames = new Set(optstk.map(o => o.name));
            console.log(`Unique underlying names in OPTSTK (Sample 10):`, Array.from(uniqueNames).slice(0, 10));
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

test();
