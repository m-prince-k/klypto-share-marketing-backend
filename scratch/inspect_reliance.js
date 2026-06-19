const axios = require('axios');

async function inspect(uSym) {
    console.log(`Fetching Master Scrip list for ${uSym}...`);
    const response = await axios.get("https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json");
    const allScrips = response.data;
    
    const opts = allScrips.filter(o => 
        o.name === uSym && 
        (o.instrumenttype === "OPTSTK" || o.instrumenttype === "OPTIDX") &&
        (o.exch_seg === "NFO" || o.exch_seg === "BFO")
    );
    
    console.log(`Found ${opts.length} ${uSym} options.`);
    
    const expiries = [...new Set(opts.map(o => o.expiry))].sort((a, b) => new Date(a) - new Date(b));
    console.log("Expiries found:", expiries);
}

inspect("RELIANCE");
