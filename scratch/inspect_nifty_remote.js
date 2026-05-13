const axios = require('axios');

async function inspect() {
    console.log("Fetching Master Scrip list...");
    const response = await axios.get("https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json");
    const allScrips = response.data;
    
    const uSym = "NIFTY";
    const niftyOpts = allScrips.filter(o => 
        o.name === uSym && 
        (o.instrumenttype === "OPTSTK" || o.instrumenttype === "OPTIDX") &&
        (o.exch_seg === "NFO" || o.exch_seg === "BFO")
    );
    
    console.log(`Found ${niftyOpts.length} NIFTY options.`);
    
    const expiries = [...new Set(niftyOpts.map(o => o.expiry))].sort((a, b) => new Date(a) - new Date(b));
    console.log("Expiries found:", expiries);
    
    const farExpiries = expiries.filter(e => new Date(e).getFullYear() > 2026);
    console.log("Far expiries (>2026):", farExpiries);
}

inspect();
