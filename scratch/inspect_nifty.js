const fs = require('fs');
const path = require('path');

// Mock store or try to find where it's loaded
// Usually it's in services/marketStore.js
const store = require('./services/marketStore');

async function inspect() {
    console.log("NFO Master Data Sample for NIFTY:");
    const niftyOpts = store.nfoMasterData.filter(o => o.name === 'NIFTY' && (o.instrumenttype === 'OPTIDX' || o.instrumenttype === 'OPTSTK'));
    
    console.log(`Found ${niftyOpts.length} NIFTY options.`);
    
    const expiries = [...new Set(niftyOpts.map(o => o.expiry))].sort((a, b) => new Date(a) - new Date(b));
    console.log("Expiries found:", expiries);
    
    if (niftyOpts.length > 0) {
        console.log("Sample contract:", niftyOpts[0]);
    }
}

// Since store might be empty if not initialized, we might need to load the master file if it exists
// But let's try to run it within the app context if possible, or just look at the code that loads it.
inspect();
