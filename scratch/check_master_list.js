const axios = require('axios');

async function test() {
    try {
        const response = await axios.get("https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json");
        const nse = response.data.filter(s => s.exch_seg === "NSE" && s.instrumenttype === "");
        
        const targets = ["ABB", "BHAINF", "INDHO", "LTINFO", "PREENR", "TATMOT", "ZOMLIM", "TATAMOTORS"];
        
        targets.forEach(t => {
            const match = nse.find(s => 
                s.symbol.includes(t) || 
                s.name.toUpperCase().includes(t)
            );
            if (match) {
                console.log(`Match for ${t}:`, JSON.stringify(match, null, 2));
            } else {
                console.log(`No match for ${t}`);
            }
        });
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

test();
