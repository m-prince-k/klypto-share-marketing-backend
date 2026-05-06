const axios = require('axios');

async function test() {
    try {
        const response = await axios.get("https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json");
        const all = response.data;
        
        const optstk = all.filter(s => s.instrumenttype === "OPTSTK");
        const uniqueNames = new Set(optstk.map(o => o.name));
        
        if (uniqueNames.has("ZOMATO")) {
            console.log("ZOMATO found in OPTSTK underlying names!");
        } else {
            console.log("ZOMATO NOT found in OPTSTK underlying names.");
            // Print all names starting with Z
            const zNames = Array.from(uniqueNames).filter(n => n.startsWith("Z"));
            console.log("Names starting with Z:", zNames);
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

test();
