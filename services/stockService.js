const axios = require("axios");
const store = require("./marketStore");
const { Stock, LivePrice, Candle } = require('../models');
const smartApi = require('./smartApi');
const { formatDate } = require('./dbService');

async function fetchTop200Stocks() {
    store.stocks = [];
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
        const bseEquity = response.data.filter(s => s.exch_seg === "BSE" && s.instrumenttype === "");

        // --- MANUALLY ADD INDICES ---
        const INDICES = [
            { name: "NIFTY", token: "99926000", segment: "NSE" },
            { name: "BANKNIFTY", token: "99926009", segment: "NSE" },
            { name: "FINNIFTY", token: "99926037", segment: "NSE" },
            { name: "MIDCPNIFTY", token: "99926035", segment: "NSE" },
            { name: "NIFTYNEXT50", token: "99926004", segment: "NSE" },
            { name: "NIFTY100", token: "99926011", segment: "NSE" },
            { name: "NIFTY200", token: "99926012", segment: "NSE" },
            { name: "NIFTY500", token: "99926013", segment: "NSE" },
            { name: "NIFTY_IT", token: "99926014", segment: "NSE" },
            { name: "NIFTY_PHARMA", token: "99926021", segment: "NSE" },
            { name: "NIFTY_FMCG", token: "99926015", segment: "NSE" },
            { name: "NIFTY_METAL", token: "99926019", segment: "NSE" },
            { name: "NIFTY_AUTO", token: "99926016", segment: "NSE" },
            { name: "NIFTY_ENERGY", token: "99926017", segment: "NSE" },
            { name: "NIFTY_REALTY", token: "99926023", segment: "NSE" },
            { name: "NIFTY_PSE", token: "99926036", segment: "NSE" },
            { name: "NIFTY_INFRA", token: "99926018", segment: "NSE" },
            { name: "NIFTY_MEDIA", token: "99926020", segment: "NSE" },
            { name: "NIFTY_PSU_BANK", token: "99926040", segment: "NSE" },
            { name: "NIFTY_PVT_BANK", token: "99926039", segment: "NSE" },
            { name: "SENSEX", token: "99919000", segment: "BSE" },
            { name: "BANKEX", token: "99919012", segment: "BSE" }
        ];

        INDICES.forEach(idx => {
            store.symbolToTokenMaster[idx.name] = idx.token;
            store.symbolToTokenMaster[`${idx.name}_${idx.segment}`] = idx.token;
            store.tokenToName[idx.token] = idx.name;
            store.tokenToExchange[idx.token] = idx.segment;
            
            store.stocks.push({
                name: idx.name,
                userCode: idx.name,
                token: idx.token,
                actualSymbol: idx.name,
                fullName: idx.name,
                segment: idx.segment
            });
        });
        // ----------------------------

        const manualMap = {
            "RELIND": "RELIANCE", "STABAN": "SBIN", "ICIBAN": "ICICIBANK", "HDFBAN": "HDFCBANK",
            "AXIBAN": "AXISBANK", "KOTMAH": "KOTAKBANK", "BAJFI": "BAJFINANCE", "BAFINS": "BAJAJFINSV",
            "TATSTE": "TATASTEEL", "TATMOT": "TATAMOTORS", "INFTEC": "INFY", "HCLTEC": "HCLTECH",
            "HINLEV": "HINDUNILVR", "BHAAIR": "BHARTIARTL", "HINDAL": "HINDALCO", "JSWSTE": "JSWSTEEL",
            "BAAUTO": "BAJAJ-AUTO", "LARSEN": "LT", "LARTOU": "LT", "MUTFIN": "MUTHOOTFIN",
            "SUNPHA": "SUNPHARMA", "ULTCEM": "ULTRACEMCO", "ADAPOR": "ADANIPORTS", "ADAENT": "ADANIENT",
            "ADAGRE": "ADANIGREEN", "ADATRA": "ADANIENSOL", "BHAPET": "BPCL", "HINPET": "HPCL",
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
            "NBCC": "NBCC", "HUDCO": "HUDCO", "ABBPOW": "ABB", "ANGBRO": "ANGELONE", "APLAPO": "APLAPOLLO",
            "ASHLEY": "ASHOKLEY", "ASIPAI": "ASIANPAINT", "ASTPOL": "ASTRAL", "AUSMA": "AUBANK",
            "AVESUP": "DMART", "BAJHOL": "BAJAJHLDNG", "BANBAN": "BANDHANBNK", "BHADYN": "BDL",
            "BLUSTA": "BLUESTARCO", "BOSLIM": "BOSCHLTD", "BRIIND": "BRITANNIA", "CHOINV": "CHOLAFIN",
            "CROGRE": "CGPOWER", "CUMIND": "CUMMINSIND", "DABIND": "DABUR", "DIXTEC": "DIXON",
            "DLFLIM": "DLF", "EXIIND": "EXIDEIND", "GLEPHA": "GLENMARK", "GMRINF": "GMRINFRA",
            "GODCON": "GODREJCP", "GODPRO": "GODREJPROP", "HDFAMC": "HDFCAMC", "HDFSTA": "HDFCLIFE",
            "HINAER": "HAL", "HINZIN": "HINDZINC", "ICILOM": "ICICIGI", "ICIPRU": "ICICIPRULI",
            "IDECEL": "IDEA", "IIFWEA": "360ONE", "INDBA": "INDUSINDBK", "INDEN": "INDUSTOWER",
            "INDHOT": "INDHOTEL", "INDIBA": "IBULHSGFIN", "INDOIL": "IOC", "INDREN": "IREDA",
            "INFEDG": "NAUKRI", "JUBFOO": "JUBLFOOD", "KALJEW": "KALYANKJIL", "KPITE": "KPITTECH",
            "LAULAB": "LAURUSLABS", "LIC": "LICI", "LTFINA": "L&TFH", "LTINFO": "LTIM", "MAHMAH": "M&M",
            "MANAFI": "MANAPPURAM", "MAPHA": "MAXHEALTH", "MAXFIN": "MFSL", "MAXHEA": "MAXHEALTH",
            "MAZDOC": "MAZDOCK", "MPHLIM": "MPHASIS", "NATALU": "NATIONALUM", "NATMIN": "NMDC",
            "NESIND": "NESTLEIND", "NIITEC": "COFORGE", "OBEREA": "OBEROIRLTY", "ONE97": "PAYTM",
            "PAGIND": "PAGEIND", "PERSYS": "PERSISTENT", "PETLNG": "PETRONET", "PHOMIL": "PHOENIXLTD",
            "PIDIND": "PIDILITIND", "PIRPHA": "PIRPHARMA", "POLI": "POLYCAB", "PREENR": "RELIANCE",
            "PREEST": "PRESTIGE", "RBLBAN": "RBLBANK", "RUCSOY": "PATANJALI", "SBICAR": "SBICARD",
            "SHRCEM": "SHREECEM", "SHRTRA": "SHRIRAMFIN", "SIEMEN": "SIEMENS", "SONBLW": "SONACOMS",
            "SUPIND": "SUPREMEIND", "SUZENE": "SUZLON", "TATELX": "TATAELXSI", "TATGLO": "TATACONSUM",
            "TATTEC": "TATATECH", "TECMAH": "TECHM", "TORPHA": "TORNTPHARM", "TORNTPOWER": "TORNTPOWER",
            "TVSMOT": "TVSMOTOR", "UNIP": "UPL", "VARBEV": "VBL", "VEDLIM": "VEDL", "WAAENE": "WAREEENER",
            "ZOMLIM": "ZOMATO", "ADICAP": "ADANIPOWER", "ALKLAB": "ALKEM", "AMBCE": "AMBUJACEM",
            "COMAGE": "CAMS", "CROGR": "CROMPTON", "DELLIM": "DELHIVERY", "FORHEA": "FORTIS",
            "FSNECO": "NYKAA", "HINPET": "HINDPETRO", "INDHO": "INDHOTEL", "INDR": "IGL",
            "INOWIN": "INOXWIND", "INTAVI": "INDIGO", "JINSP": "JSL", "KAYTEC": "KAYNES",
            "KEIIND": "KEI", "KFITEC": "KFINTECH", "MACDEV": "LODHA", "MOTSUM": "MOTHERSON",
            "NUVWEA": "NUVOCO", "ODICEM": "ORIENTCEM", "ORAFIN": "OFSS", "PBFINT": "POLICYBZR",
            "PGELEC": "PGHH", "SOLIN": "SOLARINDS", "SYNINT": "SYNGENE", "TUBIN": "TIINDIA",
            "CNXBAN": "BANKNIFTY", "NIFFIN": "FINNIFTY", "NIFNEX": "NIFTYNXT50"
        };

        // --- NEW: INDEX ALL NSE AND BSE SYMBOLS FOR HISTORICAL DATA ---
        console.log(`[MasterScrip] Indexing all NSE (${nseEquity.length}) and BSE (${bseEquity.length}) symbols...`);
        nseEquity.forEach(s => {
            const officialSymbol = s.symbol.replace("-EQ", "");
            store.symbolToTokenMaster[officialSymbol.toUpperCase()] = s.token;
            store.symbolToTokenMaster[`${officialSymbol.toUpperCase()}_NSE`] = s.token;
            store.tokenToName[s.token] = officialSymbol;
            store.tokenToExchange[s.token] = "NSE";
        });
        bseEquity.forEach(s => {
            const officialSymbol = s.symbol.replace("-EQ", "");
            store.symbolToTokenMaster[`${officialSymbol.toUpperCase()}_BSE`] = s.token;
            store.tokenToName[s.token] = officialSymbol;
            store.tokenToExchange[s.token] = "BSE";
        });
        // ----------------------------------------------------------------

        const matchedStocks = [];
        const unmatched = [];

        userSymbols.forEach(userSym => {
            const cleanUserSym = userSym.toUpperCase().trim();
            let searchSym = manualMap[cleanUserSym] || cleanUserSym;

            // 1. Handle NSE
            let nseStock = nseEquity.find(s => s.symbol === `${searchSym}-EQ` || s.symbol === searchSym);
            if (!nseStock) {
                nseStock = nseEquity.find(s => s.name.toUpperCase().replace(/\s/g, "") === searchSym);
            }

            if (nseStock) {
                const officialSymbol = nseStock.symbol.replace("-EQ", "");
                matchedStocks.push({
                    name: officialSymbol,
                    userCode: userSym,
                    token: nseStock.token,
                    actualSymbol: nseStock.symbol,
                    fullName: nseStock.name,
                    segment: 'NSE'
                });
                
                store.symbolToTokenMaster[userSym.toUpperCase()] = nseStock.token;
                store.symbolToTokenMaster[`${userSym.toUpperCase()}_NSE`] = nseStock.token;
                store.tokenToName[nseStock.token] = officialSymbol;
                store.tokenToExchange[nseStock.token] = "NSE";
            }

            // 2. Handle BSE
            let bseStock = bseEquity.find(s => s.symbol === `${searchSym}-EQ` || s.symbol === searchSym);
            if (!bseStock) {
                bseStock = bseEquity.find(s => s.name.toUpperCase().replace(/\s/g, "") === searchSym);
            }

            if (bseStock) {
                const officialSymbol = bseStock.symbol.replace("-EQ", "");
                matchedStocks.push({
                    name: officialSymbol,
                    userCode: userSym,
                    token: bseStock.token,
                    actualSymbol: bseStock.symbol,
                    fullName: bseStock.name,
                    segment: 'BSE'
                });
                
                store.symbolToTokenMaster[`${userSym.toUpperCase()}_BSE`] = bseStock.token;
                store.tokenToName[bseStock.token] = officialSymbol;
                store.tokenToExchange[bseStock.token] = "BSE";
            }

            if (!nseStock && !bseStock) {
                unmatched.push(userSym);
            }
        });

        console.log(`[MasterScrip] Total Matched Entries: ${matchedStocks.length}, Unmatched: ${unmatched.length}`);
        if (unmatched.length > 0) {
            console.log(`[MasterScrip] Sample Unmatched: ${unmatched.slice(0, 5).join(", ")}`);
        }

        store.stocks = [...store.stocks, ...matchedStocks];
        
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
                    segment: s.segment
                });
                upsertCount++;
            } catch (upsertErr) {
                console.error(`[MasterScrip] DB Upsert failed for ${s.name} (${s.segment}):`, upsertErr.message);
            }
        }
        console.log(`[MasterScrip] Successfully upserted ${upsertCount} stocks to DB.`);
        
        console.log("Fetching NFO Master Scrip list for Options...");
        const nfoResponse = await axios.get("https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json");
        
        const stockNames = store.stocks.map(s => s.name);
        // Explicitly add Index names since their equity symbols often don't match their F&O names
        const indexNames = ["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "SENSEX", "BANKEX"];
        const allTargetNames = [...new Set([...stockNames, ...indexNames])];

        // Store ALL F&O contracts from NFO and BFO to support any symbol requested
        store.nfoMasterData = nfoResponse.data.filter(s => 
            (s.exch_seg === "NFO" || s.exch_seg === "BFO") && 
            (s.instrumenttype === "OPTSTK" || s.instrumenttype === "OPTIDX" || s.instrumenttype === "FUTSTK" || s.instrumenttype === "FUTIDX")
        );
        console.log(`Successfully indexed ${store.nfoMasterData.length} F&O contracts.`);
        
        // Populate F&O tokens to exchange mapping
        store.nfoMasterData.forEach(o => {
            store.tokenToExchange[o.token] = o.exch_seg;
        });

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
    const intervalMap = {
        "1": "ONE_MINUTE", "1m": "ONE_MINUTE", "one_minute": "ONE_MINUTE",
        "3": "THREE_MINUTE", "3m": "THREE_MINUTE", "three_minute": "THREE_MINUTE",
        "5": "FIVE_MINUTE", "5m": "FIVE_MINUTE", "five_minute": "FIVE_MINUTE",
        "10": "TEN_MINUTE", "10m": "TEN_MINUTE", "ten_minute": "TEN_MINUTE",
        "15": "FIFTEEN_MINUTE", "15m": "FIFTEEN_MINUTE", "fifteen_minute": "FIFTEEN_MINUTE",
        "30": "THIRTY_MINUTE", "30m": "THIRTY_MINUTE", "thirty_minute": "THIRTY_MINUTE",
        "60": "ONE_HOUR", "1h": "ONE_HOUR", "one_hour": "ONE_HOUR",
        "day": "ONE_DAY", "1d": "ONE_DAY", "d": "ONE_DAY", "one_day": "ONE_DAY"
    };
    
    const apiInterval = intervalMap[String(interval).toLowerCase()] || interval;
    
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
            // Determine exchange - use provided exchange or look up in store
            let finalExchange = "NSE";
            if (stock.exchange) {
                finalExchange = stock.exchange;
            } else if (store.tokenToExchange[stock.token]) {
                finalExchange = store.tokenToExchange[stock.token];
            } else if (stock.symbol && (stock.symbol.includes("CE") || stock.symbol.includes("PE") || stock.symbol.endsWith("FUT"))) {
                finalExchange = "NFO";
            }

            const res = await smartApi.getCandleData({
                exchange: finalExchange,
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
