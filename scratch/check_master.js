const axios = require('axios');

async function checkMaster() {
    try {
        console.log("Fetching Master Scrip...");
        const response = await axios.get("https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json");
        const allData = response.data;
        
        const search = "ZO";
        const matches = allData.filter(s => JSON.stringify(s).toUpperCase().includes(search));
        
        console.log(`'${search}' matches:`, matches.length);
        const uniqueNames = [...new Set(matches.map(s => s.name))];
        console.log("Unique names found:", uniqueNames);
        
        if (matches.length > 0) {
            console.log("First 5 matches:", JSON.stringify(matches.slice(0, 5), null, 2));
        }

        const optIdx = allData.filter(s => s.instrumenttype === "OPTIDX" && s.exch_seg === "NFO").slice(0, 3);
        console.log("Sample NFO Options:", JSON.stringify(optIdx, null, 2));

    } catch (err) {
        console.error("Error:", err.message);
    }
}

checkMaster();
