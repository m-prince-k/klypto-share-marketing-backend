const axios = require("axios");
const store = require("./marketStore");
const { Stock, LivePrice, Candle } = require('../models');
const smartApi = require('./smartApi');
const { formatDate } = require('./dbService');

async function fetchTop200Stocks() {
    const userSymbols = ["ABB","ABBPOW","ADAENT","ADAGRE","ADAPOR","ADATRA","ADICAP","ALKLAB","AMBCE","AMBEN","ANGBRO","APLAPO","APOHOS","ASHLEY","ASIPAI","ASTPOL","AURPHA","AUSMA","AVESUP","AXIBAN","BAAUTO","BAFINS",
        "BAJFI","BAJHOL","BANBAN","BANBAR","BANIND","BHAAIR","BHADYN","BHAELE","BHAFOR","BHAINF","BHAPET","BHEL","BIOCON","BLUSTA","BOSLIM","BRIIND","BSE","CADHEA","CANBAN","CDSL","CHOINV","CIPLA","CNXBAN",
        "COALIN","COLPAL","COMAGE","CONCOR","CROGR","CROGRE","CUMIND","DABIND","DELLIM","DIVLAB","DIXTEC","DLFLIM","DRREDD","EICMOT","EXIIND","FEDBAN","FORHEA","FSNECO","GAIL","GLEPHA","GMRINF","GODCON",
        "GODPRO","GRASIM","HAVIND","HCLTEC","HDFAMC","HDFBAN","HDFSTA","HERHON","HINAER","HINDAL","HINLEV","HINPET","HINZIN","HUDCO","ICIBAN","ICILOM","ICIPRU","IDECEL","IDFBAN","IIFWEA","INDBA","INDEN",
        "INDHO","INDHOT","INDIBA","INDOIL","INDR","INDREN","INFEDG","INFTEC","INOWIN","INTAVI","ITC","JINSP","JIOFIN","JSWENE","JSWSTE","JUBFOO","KALJEW","KAYTEC","KEIIND","KFITEC","KOTMAH","KPITE","LARTOU",
        "LAULAB","LIC","LICHF","LTFINA","LTINFO","LUPIN","MACDEV","MAHMAH","MANAFI","MAPHA","MARLIM","MARUTI","MAXFIN","MAXHEA","MAZDOC","MCX","MININD","MOTSUM","MPHLIM","MUTFIN","NATALU","NATMIN","NBCC",
        "NESIND","NHPC","NIFFIN","NIFNEX","NIFSEL","NIFTY","NIITEC","NTPC","NUVWEA","OBEREA","ODICEM","OILIND","ONE97","ONGC","ORAFIN","PAGIND","PBFINT","PERSYS","PETLNG","PGELEC","PHOMIL","PIDIND","PIIND",
        "PIRPHA","PNBHOU","POLI","POWFIN","POWGRI","PREENR","PREEST","PUNBAN","RAIVIK","RBLBAN","RELIND","RUCSOY","RURELE","SAIL","SBICAR","SBILIF","SHRCEM","SHRTRA","SIEMEN","SOLIN","SONBLW","SRF","STABAN",
        "SUNPHA","SUPIND","SUZENE","SWILIM","SYNINT","TATELX","TATGLO","TATMOT","TATPOW","TATSTE","TATTEC","TCS","TECMAH","TITIND","TORPHA","TORPOW","TRENT","TUBIN","TVSMOT","ULTCEM","UNIBAN","UNIP",
        "UNISPI","VARBEV","VEDLIM","VOLTAS","WAAENE","WIPRO","YESBAN","ZOMLIM"];

    try {
        console.log("Fetching Master Scrip list and filtering for your custom list...");
        const response = await axios.get("https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json");
        
        const nseEquity = response.data.filter(s => s.exch_seg === "NSE" && s.instrumenttype === "");

        const manualMap = {
            "RELIND": "RELIANCE", "STABAN": "SBIN", "ICIBAN": "ICICIBANK", "HDFBAN": "HDFCBANK",
            "AXIBAN": "AXISBANK", "KOTMAH": "KOTAKBANK", "BAJFI": "BAJFINANCE", "BAFINS": "BAJAJFINSV",
            "TATSTE": "TATASTEEL", "TATMOT": "TATAMOTORS", "INFTEC": "INFY", "HCLTEC": "HCLTECH",
            "HINLEV": "HINDUNILVR", "BHAAIR": "BHARTIARTL", "HINDAL": "HINDALCO", "JSWSTE": "JSWSTEEL",
            "BAAUTO": "BAJAJ-AUTO", "LARSEN": "LT", "LARTOU": "LT", "MUTFIN": "MUTHOOTFIN",
            "SUNPHA": "SUNPHARMA", "ULTCEM": "ULTRACEMCO", "ADAPOR": "ADANIPORTS", "ADAENT": "ADANIENT",
            "ADAGRE": "ADANIGREEN", "ADATRA": "ADANITRANS", "BHAPET": "BPCL", "HINPET": "HPCL",
            "INDHO": "INDIANHOSP", "APOHOS": "APOLLOHOSP", "AURPHA": "AUROPHARMA", "BIOCON": "BIOCON",
            "CADHEA": "ZYDUSLIFE", "CIPLA": "CIPLA", "DIVLAB": "DIVISLAB", "DRREDD": "DRREDDY",
            "EICMOT": "EICHERMOT", "GRASIM": "GRASIM", "HAVIND": "HAVELLS", "HERHON": "HEROMOTOCO",
            "ITC": "ITC", "JSWENE": "JSWENERGY", "LUPIN": "LUPIN", "MARUTI": "MARUTI",
            "NTPC": "NTPC", "ONGC": "ONGC", "POWGRI": "POWERGRID", "TATPOW": "TATAPOWER",
            "TITIND": "TITAN", "WIPRO": "WIPRO", "YESBAN": "YESBANK", "ZOMLIM": "ZOMATO",
            "BHAELE": "BEL", "BHAFOR": "BHARATFORG", "BHAINF": "INDUSTOWER", "CANBAN": "CANBK",
            "PUNBAN": "PNB", "BANBAR": "BANKBARODA", "BANIND": "BANKINDIA", "FEDBAN": "FEDERALBNK",
            "IDFBAN": "IDFCFIRSTB", "UNIBAN": "UNIONBANK", "LICHF": "LICHSGFIN", "PNBHOU": "PNBHOUSING",
            "POWFIN": "PFC", "RURELE": "REC", "RAIVIK": "RVNL", "IRFCON": "IRCON", "CONCOR": "CONCOR",
            "GAIL": "GAIL", "SAIL": "SAIL", "OILIND": "OIL", "COALIN": "COALINDIA", "NHPC": "NHPC",
            "NBCC": "NBCC", "HUDCO": "HUDCO"
        };

        const matchedStocks = [];
        const unmatched = [];

        userSymbols.forEach(userSym => {
            const cleanUserSym = userSym.toUpperCase().trim();
            let searchSym = manualMap[cleanUserSym] || cleanUserSym;

            let found = nseEquity.find(s => s.symbol === `${searchSym}-EQ` || s.symbol === searchSym);

            if (!found) {
                found = nseEquity.find(s => s.symbol.replace("-EQ", "").startsWith(searchSym.substring(0, 4)));
            }

            if (!found) {
                found = nseEquity.find(s => {
                    const cleanName = s.name.toUpperCase().replace(/\s/g, "");
                    return cleanName.includes(searchSym.substring(0, 4));
                });
            }
            
            if (!found) {
                found = nseEquity.find(s => s.symbol.startsWith(searchSym.substring(0, 3)));
            }

            if (found) {
                const officialSymbol = found.symbol.replace("-EQ", "");
                matchedStocks.push({
                    name: officialSymbol,
                    userCode: userSym,
                    token: found.token,
                    actualSymbol: found.symbol,
                    fullName: found.name
                });
                
                store.symbolToTokenMaster[userSym.toUpperCase()] = found.token;
                store.symbolToTokenMaster[officialSymbol.toUpperCase()] = found.token;
                store.tokenToName[found.token] = officialSymbol;
            } else {
                unmatched.push(userSym);
            }
        });

        console.log(`[MasterScrip] Matched: ${matchedStocks.length}, Unmatched: ${unmatched.length}`);
        if (unmatched.length > 0) {
            console.log(`[MasterScrip] Sample Unmatched: ${unmatched.slice(0, 5).join(", ")}`);
        }

        store.stocks = matchedStocks;
        
        // Sync to DB
        console.log(`[MasterScrip] Syncing ${matchedStocks.length} stocks to Database...`);
        let upsertCount = 0;
        for (const s of matchedStocks) {
            try {
                await Stock.upsert({
                    name: s.name,
                    userCode: s.userCode,
                    token: s.token,
                    actualSymbol: s.actualSymbol,
                    fullName: s.fullName,
                    segment: 'NSE'
                });
                upsertCount++;
            } catch (upsertErr) {
                console.error(`[MasterScrip] DB Upsert failed for ${s.name}:`, upsertErr.message);
            }
        }
        console.log(`[MasterScrip] Successfully upserted ${upsertCount} stocks to DB.`);
        
        console.log("Fetching NFO Master Scrip list for Options...");
        const nfoResponse = await axios.get("https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json");
        
        const stockNames = store.stocks.map(s => s.name);
        store.nfoMasterData = nfoResponse.data.filter(s => 
            s.exch_seg === "NFO" && 
            (s.instrumenttype === "OPTSTK" || s.instrumenttype === "OPTIDX" || s.instrumenttype === "FUTSTK" || s.instrumenttype === "FUTIDX") &&
            stockNames.some(name => s.name.startsWith(name))
        );
        console.log(`Successfully indexed ${store.nfoMasterData.length} F&O contracts.`);

        store.stocks.forEach(s => {
            store.latestMarketData[s.name] = {
                symbol: s.name,
                token: s.token,
                userCode: s.userCode,
                actualSymbol: s.actualSymbol,
                fullName: s.fullName,
                ltp: "0.00",
                status: "waiting for live data..."
            };
        });

        console.log(`[Mapping] Success: ${store.stocks.length}/201. Failed: ${unmatched.length}`);
    } catch (error) {
        console.error("Failed to fetch Master Scrip:", error.message);
        store.stocks = [{ name: "TCS", token: "11536" }];
    }
}

async function syncLivePrices() {
    let stocksToSync = store.stocks;
    
    if (!stocksToSync || stocksToSync.length === 0) {
        stocksToSync = await Stock.findAll({ where: { isActive: true } });
        store.stocks = stocksToSync.map(s => s.toJSON());
    }

    console.log(`[LiveSync] Syncing ${stocksToSync.length} stocks (FULL mode)...`);
    
    const results = [];
    const batchSize = 50;
    for (let i = 0; i < stocksToSync.length; i += batchSize) {
        const batch = stocksToSync.slice(i, i + batchSize);
        const tokens = batch.map(s => s.token);
        
        try {
            const response = await smartApi.marketData({
                mode: "FULL", 
                exchangeTokens: { "NSE": tokens }
            });

            if (response && response.status && response.data && response.data.fetched) {
                // Debug: Log the first item of the first batch to see the actual keys
                if (i === 0 && response.data.fetched.length > 0) {
                    console.log("[LiveSync] Sample API Response Item:", response.data.fetched[0]);
                }

                for (const item of response.data.fetched) {
                    const stock = batch.find(s => s.token === item.symbolToken);
                    if (!stock) continue;

                    // Mapping with multiple possible keys (handling both REST and WebSocket styles)
                    const liveData = {
                        symbol: stock.name,
                        token: stock.token,
                        ltp: item.ltp || item.last_traded_price || 0,
                        open: item.open || item.open_price_day || (item.ohlc ? item.ohlc.open : 0),
                        high: item.high || item.high_price_day || (item.ohlc ? item.ohlc.high : 0),
                        low: item.low || item.low_price_day || (item.ohlc ? item.ohlc.low : 0),
                        close: item.close || item.close_price || (item.ohlc ? item.ohlc.close : 0),
                        volume: item.volume || item.v || 0,
                        fetchedAt: new Date()
                    };

                    await LivePrice.upsert(liveData);
                    results.push(liveData);
                }
            }
            await new Promise(r => setTimeout(r, 300));
        } catch (err) {
            console.error(`[LiveSync] Error:`, err.message);
        }
    }
    return results;
}

async function syncCandleData(interval = "FIVE_MINUTE", isLive = false, targetSymbol = null) {
    // Map shorthand intervals to API names
    const intervalMap = {
        "1m": "ONE_MINUTE",
        "3m": "THREE_MINUTE",
        "5m": "FIVE_MINUTE",
        "10m": "TEN_MINUTE",
        "15m": "FIFTEEN_MINUTE",
        "30m": "THIRTY_MINUTE",
        "1h": "ONE_HOUR",
        "1d": "ONE_DAY"
    };
    
    const apiInterval = intervalMap[interval.toLowerCase()] || interval;
    
    // Filter stocks if targetSymbol is provided
    let stocksToSync = store.stocks;
    if (targetSymbol) {
        stocksToSync = store.stocks.filter(s => s.name.toUpperCase() === targetSymbol.toUpperCase());
        if (stocksToSync.length === 0) {
            console.log(`[CandleSync] Symbol ${targetSymbol} not found in store.`);
            return [];
        }
    }

    console.log(`[CandleSync] Syncing ${stocksToSync.length} stocks for ${apiInterval} (${isLive ? 'LIVE' : 'Historical'})...`);
    
    const allResults = [];
    const now = new Date();
    
    // If isLive is true, we only want the most recent data (e.g., last 30 mins to be safe)
    // Otherwise, we fetch the last 24 hours
    const fromDate = isLive 
        ? new Date(now.getTime() - 30 * 60 * 1000) 
        : new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    const fDate = formatDate(fromDate, isLive ? null : "09:15");
    const tDate = formatDate(now, isLive ? null : "15:30");

    console.log(`[CandleSync] Date Range: ${fDate} to ${tDate}`);

    for (const stock of stocksToSync) {
        try {
            const res = await smartApi.getCandleData({
                exchange: "NSE",
                symboltoken: stock.token,
                interval: apiInterval,
                fromdate: fDate,
                todate: tDate
            });

            if (res && res.data && res.data.length > 0) {
                // If it's live, we might only want the latest one, but returning all found in the range is safer
                const formatted = res.data.map(c => {
                    const ts = new Date(c[0]);
                    return {
                        symbol: stock.name,
                        token: stock.token,
                        exchange: "NSE",
                        interval: apiInterval,
                        timestamp: ts,
                        time: Math.floor(ts.getTime() / 1000), // Unix timestamp in seconds for Lightweight Charts
                        open: c[1],
                        high: c[2],
                        low: c[3],
                        close: c[4],
                        volume: c[5]
                    };
                });
                
                await Candle.bulkCreate(formatted, { ignoreDuplicates: true });
                
                // For live sync, we only return the most recent candle for each stock
                if (isLive) {
                    allResults.push(formatted[formatted.length - 1]);
                } else {
                    allResults.push(...formatted);
                }
            }
            await new Promise(r => setTimeout(r, 150)); // Faster delay for live sync
        } catch (err) {
            console.error(`[CandleSync] Failed for ${stock.name}:`, err.message);
        }
    }
    return allResults;
}

module.exports = { fetchTop200Stocks, syncLivePrices, syncCandleData };
