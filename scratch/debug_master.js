const axios = require('axios');

async function test() {
    try {
        const response = await axios.get("https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json");
        const all = response.data;
        
        const tataMatches = all.filter(s => s.symbol.includes("TATAMOTORS"));
        console.log(`TATAMOTORS matches:`, JSON.stringify(tataMatches, null, 2));
        
        const relianceMatches = all.filter(s => s.symbol === "RELIANCE-EQ");
        console.log(`RELIANCE matches:`, JSON.stringify(relianceMatches, null, 2));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

test();
