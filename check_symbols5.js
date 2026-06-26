const axios = require('axios');
async function checkSymbols() {
    const res = await axios.get("https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json");
    const all = res.data;
    
    console.log("Symbols with TATAMOT:");
    console.log(all.filter(s => s.symbol.includes("TATAMOT")).map(s => s.symbol));
    
    console.log("Symbols with ZOM:");
    console.log(all.filter(s => s.symbol.includes("ZOM")).map(s => s.symbol));
}
checkSymbols();
