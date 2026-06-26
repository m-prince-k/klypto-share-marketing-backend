const axios = require('axios');
async function checkSymbols() {
    const res = await axios.get("https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json");
    const all = res.data;
    
    console.log("All matches for name Tata Motors:");
    console.log(all.filter(s => s.name.toUpperCase().includes("TATA MOTORS")).map(s => `${s.name} | ${s.symbol} (${s.exch_seg} - ${s.instrumenttype})`));

    console.log("All matches for name Zomato:");
    console.log(all.filter(s => s.name.toUpperCase().includes("ZOMATO")).map(s => `${s.name} | ${s.symbol} (${s.exch_seg} - ${s.instrumenttype})`));
}
checkSymbols();
