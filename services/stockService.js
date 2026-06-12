const axios = require("axios");
const store = require("./marketStore");
const { Stock, LivePrice, Candle, Future } = require('../models');
const smartApi = require('./smartApi');
const { formatDate } = require('./dbService');

const userSymbols = [
    "ABB", "ABBPOW", "ADAENT", "ADAGRE", "ADAPOR", "ADATRA", "ADICAP", "ALKLAB", "AMBCE", "AMBEN",
    "ANGBRO", "APLAPO", "APOHOS", "ASHLEY", "ASIPAI", "ASTPOL", "AURPHA", "AUBANK",
    "AXIBAN", "BAAUTO", "BAFINS", "BAJFI", "BAJHOL", "BANBAN", "BANBAR", "BANIND",
    "BHAAIR", "BHADYN", "BHAELE", "BHAFOR", "BHAINF", "BHAPET", "BHEL", "BIOCON",
    "BLUSTA", "BOSLIM", "BRIIND", "BSE", "CADHEA", "CAMS", "CANBAN", "CDSL", "CHOINV",
    "CIPLA", "COALIN", "COLPAL", "CONCOR", "CROMPTON", "CROGRE", "CUMIND",
    "DABIND", "DELLIM", "DIVLAB", "DIXTEC", "DLFLIM", "DMART", "DRREDD",
    "EICMOT", "EXIIND", "FEDBAN", "FORHEA", "FSNECO",
    "GAIL", "GLEPHA", "GMRAIRPORT", "GODCON", "GODPRO", "GRASIM",
    "HAVIND", "HCLTEC", "HDFAMC", "HDFBAN", "HDFSTA", "HERHON", "HINAER",
    "HINDAL", "HINLEV", "HINPET", "HINZIN", "HUDCO",
    "ICIBAN", "ICILOM", "ICIPRU", "IDECEL", "IDFBAN", "IEX", "IIFWEA",
    "INDUSINDBK", "INDEN", "INDHOT", "INDOIL", "INDREN",
    "INFEDG", "INFTEC", "INOWIN", "IRFC", "ITC",
    "JINDALSTEL", "JIOFIN", "JSWENE", "JSWSTE", "JUBFOO",
    "KALJEW", "KAYTEC", "KEIIND", "KFITEC", "KOTMAH", "KPITE",
    "LARTOU", "LAULAB", "LIC", "LICHF", "LTF", "LTM", "LUPIN",
    "LODHA", "MAHMAH", "MANAFI", "MARLIM", "MARUTI", "MAXFIN", "MAXHEA", "MAZDOC", "MCX",
    "MOTSUM", "MPHLIM", "MUTFIN",
    "NATALU", "NATMIN", "NBCC", "NESIND", "NHPC", "NIFFIN", "NIITEC", "NTPC", "NUVWEA",
    "OBEREA", "OILIND", "ONE97", "ONGC", "ORAFIN",
    "PAGIND", "PAYTM", "PERSYS", "PETLNG", "PGEL", "PHOMIL",
    "PIDIND", "PIIND", "PNBHOU", "POLI", "POLICYBZR", "POLYCAB", "POWFIN", "POWGRI",
    "PREMIERENE", "PREENR", "PUNBAN",
    "RAIVIK", "RBLBAN", "RECLTD", "RELIND", "RUCSOY",
    "SAIL", "SAMMAANCAP", "SBICAR", "SBILIF", "SHRCEM", "SHRTRA", "SIEMEN",
    "SOLIN", "SONBLW", "SRF", "STABAN", "SUNPHA", "SUPIND", "SUZENE", "SWIGGY", "SYNINT",
    "TATELX", "TATGLO", "TATMOT", "TATPOW", "TATSTE", "TATTEC", "TMPV", "TCS", "TECMAH",
    "TITIND", "TORPHA", "TORPOW", "TRENT", "TIINDIA", "TVSMOTOR",
    "ULTCEM", "UNIBAN", "UNISPI",
    "VARBEV", "VEDLIM", "VOLTAS",
    "WAAREEENER", "WIPRO", "YESBAN", "ETERNAL", "ZOMLIM", "IEX",
    "POWERINDIA", "INDIANB", "JUBLFOOD", "MANKIND", "UNOMINDA", "DALBHARAT", "PPLPHARMA", "UPL"
];

const manualMap = {
    "ABB": "ABB", "ABBPOW": "ABBINDIA", "ADAENT": "ADANIENT", "ADAGRE": "ADANIGREEN", "ADAPOR": "ADANIPORTS",
    "ADATRA": "ADANIENSOL", "ADICAP": "ABCAPITAL", "ALKLAB": "ALKEM", "AMBCE": "AMBUJACEM", "AMBEN": "AMBER",
    "ANGBRO": "ANGELONE", "APLAPO": "APLAPOLLO", "APOHOS": "APOLLOHOSP", "ASHLEY": "ASHOKLEY",
    "ASIPAI": "ASIANPAINT", "ASTPOL": "ASTRAL", "AURPHA": "AUROPHARMA", "AUBANK": "AUBANK", "AXIBAN": "AXISBANK",
    "BAAUTO": "BAJAJ-AUTO", "BAFINS": "BAJAJFINSV", "BAJFI": "BAJFINANCE", "BAJHOL": "BAJAJHLDNG",
    "BANBAN": "BANDHANBNK", "BANBAR": "BANKBARODA", "BANIND": "BANKINDIA", "BHAAIR": "BHARTIARTL",
    "BHADYN": "BDL", "BHAELE": "BEL", "BHAFOR": "BHARATFORG", "BHAINF": "INDUSTOWER",
    "BHAPET": "BPCL", "BHEL": "BHEL", "BIOCON": "BIOCON", "BLUSTA": "BLUESTARCO",
    "BOSLIM": "BOSCHLTD", "BRIIND": "BRITANNIA", "BSE": "BSE", "CADHEA": "ZYDUSLIFE",
    "CAMS": "CAMS", "CANBAN": "CANBK", "CDSL": "CDSL", "CHOINV": "CHOLAFIN", "CIPLA": "CIPLA",
    "COALIN": "COALINDIA", "COLPAL": "COLPAL", "CONCOR": "CONCOR", "CROMPTON": "CROMPTON", "CROGRE": "CGPOWER",
    "CUMIND": "CUMMINSIND", "DABIND": "DABUR", "DELLIM": "DELHIVERY", "DIVLAB": "DIVISLAB",
    "DIXTEC": "DIXON", "DLFLIM": "DLF", "DMART": "DMART", "DRREDD": "DRREDDY", "EICMOT": "EICHERMOT",
    "EXIIND": "EXIDEIND", "FEDBAN": "FEDERALBNK", "FORHEA": "FORTIS", "FSNECO": "NYKAA",
    "GAIL": "GAIL", "GLEPHA": "GLENMARK", "GMRAIRPORT": "GMRAIRPORT", "GODCON": "GODREJCP",
    "GODPRO": "GODREJPROP", "GRASIM": "GRASIM", "HAVIND": "HAVELLS", "HCLTEC": "HCLTECH",
    "HDFAMC": "HDFCAMC", "HDFBAN": "HDFCBANK", "HDFSTA": "HDFCLIFE", "HERHON": "HEROMOTOCO",
    "HINAER": "HAL", "HINDAL": "HINDALCO", "HINLEV": "HINDUNILVR", "HINPET": "HINDPETRO",
    "HINZIN": "HINDZINC", "HUDCO": "HUDCO", "ICIBAN": "ICICIBANK", "ICILOM": "ICICIGI",
    "ICIPRU": "ICICIPRULI", "IDECEL": "IDEA", "IDFBAN": "IDFCFIRSTB", "IEX": "IEX", "IIFWEA": "360ONE",
    "INDUSINDBK": "INDUSINDBK", "INDEN": "INDIGO", "INDHO": "INDIANHOSP", "INDHOT": "INDHOTEL", "INDIBA": "INDIABULLS",
    "INDOIL": "IOC", "INDREN": "IREDA", "INFEDG": "NAUKRI", "INFTEC": "INFY",
    "INOWIN": "INOXWIND", "INTAVI": "INDIGO", "IRFC": "IRFC", "ITC": "ITC", "JINSP": "JSL",
    "JIOFIN": "JIOFIN", "JSWENE": "JSWENERGY", "JSWSTE": "JSWSTEEL", "JUBFOO": "JUBILANT", "JUBLFOOD": "JUBLFOOD",
    "KALJEW": "KALYANKJIL", "KALYANKJIL": "KALYANKJIL", "KAYTEC": "KAYNES", "KEIIND": "KEI", "KFITEC": "KFINTECH",
    "KOTMAH": "KOTAKBANK", "KPITE": "KPITTECH", "LARTOU": "LT", "LAULAB": "LAURUSLABS",
    "LIC": "LICI", "LICHF": "LICHSGFIN", "LTFINA": "LTF", "LTINFO": "LTM", "LTF": "LTF", "LTM": "LTM",
    "LUPIN": "LUPIN", "LODHA": "LODHA", "MACDEV": "LODHA", "MAHMAH": "M&M", "MANAFI": "MANAPPURAM",
    "MAPHA": "MAPMYINDIA", "MARLIM": "MARICO", "MARUTI": "MARUTI", "MAXFIN": "MFSL", "MFSL": "MFSL",
    "MAXHEA": "MAXHEALTH", "MAXHEALTH": "MAXHEALTH", "MAZDOC": "MAZDOCK", "MAZDOCK": "MAZDOCK", "MCX": "MCX", "MININD": "COALINDIA",
    "MOTSUM": "MOTHERSON", "MPHLIM": "MPHASIS", "MUTFIN": "MUTHOOTFIN", "NATALU": "NATIONALUM",
    "NATMIN": "NMDC", "NBCC": "NBCC", "NESIND": "NESTLEIND", "NHPC": "NHPC",
    "NIFFIN": "NIFTY FINANCIAL SERVICES", "NIITEC": "COFORGE", "NTPC": "NTPC",
    "NUVWEA": "NUVAMA", "OBEREA": "OBEROIRLTY", "OBEROIRLTY": "OBEROIRLTY", "ODICEM": "ULTRACEMCO", "OILIND": "OIL",
    "ONE97": "PAYTM", "PAYTM": "PAYTM", "ONGC": "ONGC", "ORAFIN": "OFSS", "PAGIND": "PAGEIND",
    "PBFINT": "PBフィンテック", "PERSYS": "PERSISTENT", "PETLNG": "PETRONET", "PGEL": "PGEL", "PGELEC": "POWERGRID",
    "PHOMIL": "PHOENIXLTD", "PHOENIXLTD": "PHOENIXLTD", "PIDIND": "PIDILITIND", "PIIND": "PIIND", "PIRPHA": "PIRPHARMA",
    "PNBHOU": "PNBHOUSING", "POLI": "POLYCAB", "POLICYBZR": "POLICYBZR", "POLYCAB": "POLYCAB",
    "POWFIN": "PFC", "POWGRI": "POWERGRID",
    "PREMIERENE": "PREMIERENE", "PREENR": "PRESTIGE", "PREEST": "PRESTIGE", "PUNBAN": "PNB",
    "RAIVIK": "RVNL", "RBLBAN": "RBLBANK", "RECLTD": "RECLTD", "RELIND": "RELIANCE",
    "RUCSOY": "PATANJALI", "RURELE": "RECLTD",
    "SAIL": "SAIL", "SAMMAANCAP": "SAMMAANCAP", "SBICAR": "SBICARD", "SBILIF": "SBILIFE", "SHRCEM": "SHREECEM", "SHREECEM": "SHREECEM",
    "SHRTRA": "SHRIRAMFIN", "SIEMEN": "SIEMENS", "SOLIN": "SOLARINDS", "SONBLW": "SONACOMS", "SONACOMS": "SONACOMS",
    "SRF": "SRF", "STABAN": "SBIN", "SUNPHA": "SUNPHARMA", "SUPIND": "SUPREMEIND", "SUPREMEIND": "SUPREMEIND",
    "SUZENE": "SUZLON", "SWIGGY": "SWIGGY", "SWILIM": "SWANENERGY", "SYNINT": "SYNGENE",
    "TATELX": "TATAELXSI", "TATGLO": "TATACONSUM", "TATCONSUM": "TATACONSUM", "TATMOT": "TATAMOTORS", "TATAMOTORS": "TATAMOTORS", "TATPOW": "TATAPOWER", "TATSTE": "TATASTEEL",
    "TATTEC": "TATATECH", "TATATECH": "TATATECH", "TCS": "TCS", "TECMAH": "TECHM", "TITIND": "TITAN",
    "TIINDIA": "TIINDIA", "TORPHA": "TORNTPHARM", "TORPOW": "TORNTPOWER", "TRENT": "TRENT", "TUBIN": "TIINDIA",
    "TVSMOTOR": "TVSMOTOR", "TVSMOT": "TVSMOTOR",
    "ULTCEM": "ULTRACEMCO", "UNIBAN": "UNIONBANK", "UNIP": "UNIPARTS",
    "UNISPI": "UNITDSPR", "VARBEV": "VBL", "VEDLIM": "VEDL", "VOLTAS": "VOLTAS",
    "WAAREEENER": "WAAREEENER", "WAAENE": "WAAREEENER", "WIPRO": "WIPRO", "YESBAN": "YESBANK", "ETERNAL": "ETERNAL", "ZOMLIM": "ZOMATO",
    "POWERINDIA": "POWERINDIA", "INDIANB": "INDIANB", "JUBLFOOD": "JUBLFOOD", "MANKIND": "MANKIND",
    "UNOMINDA": "UNOMINDA", "DALBHARAT": "DALBHARAT", "PPLPHARMA": "PPLPHARMA", "UPL": "UPL"
};

async function fetchTop200Stocks() {
    try {
        console.log("Fetching Master Scrip list...");
        const response = await axios.get("https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json");
        const allScrips = response.data;

        const nseEquity = allScrips.filter(s => s.exch_seg === "NSE" && s.instrumenttype === "");
        const bseEquity = allScrips.filter(s => s.exch_seg === "BSE" && s.instrumenttype === "");
        const nfoScrips = allScrips.filter(s => s.exch_seg === "NFO" || s.exch_seg === "BFO");
        const mcxScrips = allScrips.filter(s => s.exch_seg === "MCX");

        store.nfoMasterData = nfoScrips;
        store.mcxMasterData = mcxScrips;

        const uniqueStocksMap = new Map();
        const indicesList = [];
        const currentFutures = [];

        // Process Indices
        const INDICES = [
            { name: "NIFTY", token: "26000", segment: "NSE" },
            { name: "BANKNIFTY", token: "26009", segment: "NSE" },
            { name: "FINNIFTY", token: "26037", segment: "NSE" },
            { name: "MIDCPNIFTY", token: "26035", segment: "NSE" }
        ];

        INDICES.forEach(idx => {
            store.symbolToTokenMaster[idx.name] = idx.token;
            store.tokenToName[idx.token] = idx.name;
            store.tokenToExchange[idx.token] = idx.segment;

            // Get nearest 3 expiries for Index Futures
            const idxFuts = nfoScrips.filter(f => f.name === idx.name && f.instrumenttype === "FUTIDX");
            const expiries = [...new Set(idxFuts.map(f => f.expiry))].sort((a, b) => new Date(a) - new Date(b)).slice(0, 3);

            indicesList.push({
                name: idx.name,
                userCode: idx.name,
                token: idx.token,
                actualSymbol: idx.name,
                fullName: idx.name,
                segment: idx.segment,
                expiry: expiries[0] || null,
                expiries: expiries
            });
        });

        // Index all for history support
        console.log(`[MasterScrip] Indexing all NSE (${nseEquity.length}) and BSE (${bseEquity.length}) symbols for global historical support...`);
        nseEquity.forEach(s => {
            const sym = s.symbol.replace("-EQ", "");
            store.symbolToTokenMaster[sym.toUpperCase()] = s.token;
            store.tokenToName[s.token] = sym;
            store.tokenToExchange[s.token] = "NSE";
        });
        bseEquity.forEach(s => {
            const sym = s.symbol.replace("-EQ", "");
            store.symbolToTokenMaster[`${sym.toUpperCase()}_BSE`] = s.token;
            store.tokenToName[s.token] = sym;
            store.tokenToExchange[s.token] = "BSE";
        });

        // Index MCX for historical support (specifically GOLD, SILVER, etc.)
        const commodityNames = ["GOLD", "GOLDM", "SILVER", "SILVERM", "CRUDEOIL", "NATURALGAS"];
        const todayForMCX = new Date();
        todayForMCX.setHours(0, 0, 0, 0);

        commodityNames.forEach(name => {
            const contracts = mcxScrips.filter(s => s.name === name && s.instrumenttype === 'FUTCOM');
            const active = contracts.filter(c => new Date(c.expiry) >= todayForMCX);
            if (active.length > 0) {
                const nearest = active.sort((a, b) => new Date(a.expiry) - new Date(b.expiry))[0];
                store.symbolToTokenMaster[name] = nearest.token;
                store.tokenToName[nearest.token] = name;
                store.tokenToExchange[nearest.token] = "MCX";
            }
        });

        // Always index the full symbol for specific contract lookups
        mcxScrips.forEach(s => {
            store.symbolToTokenMaster[s.symbol.toUpperCase()] = s.token;
            store.tokenToName[s.token] = s.symbol;
            store.tokenToExchange[s.token] = "MCX";
        });

        // Match user list (Only NSE Equity)
        for (const userSym of userSymbols) {
            const cleanUserSym = userSym.toUpperCase().trim();
            const searchSym = manualMap[cleanUserSym] || cleanUserSym;

            // Try exact match first
            let nseS = nseEquity.find(s => s.symbol === `${searchSym}-EQ` || s.symbol === searchSym);

            // Try startsWith if not found
            if (!nseS) {
                nseS = nseEquity.find(s => s.symbol.startsWith(`${searchSym}-`));
            }

            if (!nseS) {
                console.log(`[MasterSync] Missing symbol: ${userSym}`);
                continue;
            }

            // Get expiries for this symbol's futures
            const symFuts = nfoScrips.filter(f => f.name === searchSym && (f.instrumenttype === "FUTSTK" || f.instrumenttype === "FUTIDX"));
            const expiries = [...new Set(symFuts.map(f => f.expiry))].sort((a, b) => new Date(a) - new Date(b)).slice(0, 3);

            if (!INDICES.some(i => i.name === cleanUserSym)) {
                const sym = nseS.symbol.replace("-EQ", "");
                uniqueStocksMap.set(nseS.token, {
                    name: sym,
                    userCode: userSym,
                    token: nseS.token,
                    actualSymbol: nseS.symbol,
                    fullName: nseS.name,
                    segment: 'NSE',
                    expiry: expiries[0] || null,
                    expiries: expiries
                });
            }

            // Identify Futures for this symbol (NSE ONLY - NFO)
            const symFutures = nfoScrips.filter(f =>
                f.name === searchSym &&
                f.exch_seg === "NFO" &&
                (f.instrumenttype === "FUTSTK" || f.instrumenttype === "FUTIDX")
            );

            symFutures.forEach(f => {
                store.tokenToName[f.token] = f.symbol; // Use trading symbol for unique key
                store.tokenToExchange[f.token] = "NFO";
                currentFutures.push({
                    name: f.symbol, // Use symbol as name for display/lookup consistency
                    fullName: f.name,
                    symbol: f.symbol,
                    userCode: userSym,
                    segment: f.exch_seg,
                    type: 'FUTURE',
                    expiry: f.expiry,
                    token: f.token
                });
            });
        }

        const finalStocks = Array.from(uniqueStocksMap.values());
        console.log(`[MasterScrip] Matched ${finalStocks.length} unique NSE Equity stocks, ${indicesList.length} indices, and ${currentFutures.length} futures.`);
        store.stocks = finalStocks;
        store.indices = indicesList;
        store.futures = currentFutures;

        // Sync to DB (Only NSE Stocks)
        Stock.bulkCreate(finalStocks, { ignoreDuplicates: true }).catch(e => console.error("DB Sync Error (Stocks):", e.message));

        Future.destroy({ where: {}, truncate: true })
            .then(() => Future.bulkCreate(currentFutures, { ignoreDuplicates: true }))
            .catch(e => console.error("DB Sync Error (Futures):", e.message));

    } catch (err) {
        console.error("fetchTop200Stocks Error:", err.message);
    }
}

async function syncMasterScrips() {
    return await fetchTop200Stocks();
}

async function syncLivePrices() {
    try {
        const allItems = [
            ...(store.stocks || []),
            ...(store.indices || []),
            ...(store.futures || [])
        ];

        if (allItems.length === 0) {
            console.log("[LiveSync] No items in store to sync.");
            return;
        }

        console.log(`[LiveSync] Performing LTP sync for ${allItems.length} items...`);
        
        const chunks = [];
        for (let i = 0; i < allItems.length; i += 50) {
            chunks.push(allItems.slice(i, i + 50));
        }

        for (const chunk of chunks) {
            try {
                const exchangeTokens = {};
                chunk.forEach(item => {
                    const seg = item.segment || (item.exch_seg) || "NSE";
                    if (!exchangeTokens[seg]) exchangeTokens[seg] = [];
                    exchangeTokens[seg].push(item.token);
                });

                if (Object.keys(exchangeTokens).length === 0) continue;

                // Use smartApi instead of raw axios for session persistence
                const response = await smartApi.marketData({
                    mode: "FULL",
                    exchangeTokens: exchangeTokens
                });

                if (response && response.status && response.data && response.data.fetched) {
                    response.data.fetched.forEach(item => {
                        const token = String(item.symbolToken || item.token);
                        const name = store.tokenToName[token] || item.tradingSymbol || item.symbol;
                        const segment = item.exchange || "NSE";
                        const key = `${name}:${segment}`;

                        const ltp = parseFloat(item.ltp || 0);
                        const close = parseFloat(item.close || 0);
                        const rawChange = ltp - close;
                        const pChange = close > 0 ? ((rawChange / close) * 100).toFixed(2) : "0.00";

                        store.latestMarketData[key] = {
                            symbol: name,
                            token: token,
                            exchange: segment,
                            last_traded_price: ltp.toFixed(2),
                            close_price: close.toFixed(2),
                            change: (rawChange > 0 ? "+" : "") + rawChange.toFixed(2),
                            percent_change: pChange,
                            last_update_time: new Date().toISOString(),
                            status: "live"
                        };
                    });
                } else {
                    console.warn(`[LiveSync] Unexpected API response format:`, JSON.stringify(response));
                }
            } catch (chunkError) {
                console.error(`[LiveSync] Chunk Sync Failed:`, chunkError.message);
            }
            // Increase delay to 400ms to respect Angel One's 3 requests/sec rate limit
            await new Promise(r => setTimeout(r, 400));
        }
        console.log("[LiveSync] LTP sync completed.");
    } catch (err) {
        console.error("syncLivePrices Error:", err.message);
    }
}

async function syncCandleData() {
    // Implementation for syncing candle data if needed
}

module.exports = {
    fetchTop200Stocks,
    syncMasterScrips,
    syncLivePrices,
    syncCandleData
};
