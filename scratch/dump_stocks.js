const store = require('./services/marketStore');
const { fetchTop200Stocks } = require('./services/stockService');

async function test() {
    await fetchTop200Stocks();
    console.log("Stocks count:", store.stocks.length);
    console.log("First 20 stocks:", store.stocks.slice(0, 20).map(s => s.name));
    
    // Check NFO options subscription logic
    const nearMonthFutures = [];
    const stockNames = store.stocks.map(s => s.name);
    
    stockNames.forEach(name => {
        const futures = store.nfoMasterData.filter(f => 
            f.name === name && (f.instrumenttype === "FUTSTK" || f.instrumenttype === "FUTIDX")
        );
        if (futures.length > 0) {
            const bestFut = futures.sort((a, b) => new Date(a.expiry) - new Date(b.expiry))[0];
            nearMonthFutures.push(bestFut);
        }
    });
    
    console.log("Futures count:", nearMonthFutures.length);
}

test();
