const axios = require("axios");
const store = require("./marketStore");
const { Stock, LivePrice, Candle, Future } = require('../models');
const smartApi = require('./smartApi');
const { formatDate } = require('./dbService');

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
    "HINAER": "HAL", "HINPET": "HINDPETRO", "HUDCO": "HUDCO", "ICILOM": "ICICIGI",
    "ICIPRU": "ICICIPRULI", "IDECEL": "IDEA", "IDFBAN": "IDFCFIRSTB", "IIFWEA": "360ONE",
    "INDHOT": "INDHOTEL", "INDIBA": "INDIABULLS", "INOWIN": "INOXWIND", "INTAVI": "INDIGO",
    "JIOFIN": "JIOFIN", "JSWENE": "JSWENERGY", "KALJEW": "KALYANKJIL", "KAYTEC": "KAYNES",
    "KFITEC": "KFINTECH", "KPITE": "KPITTECH", "LIC": "LICI", "LTFINA": "L&TFH",
    "LTINFO": "LTIM", "LUPIN": "LUPIN", "MACDEV": "LODHA", "MAHMAH": "M&M",
    "MANAFI": "MANAPPURAM", "MAPHA": "MAPMYINDIA", "MARLIM": "MARICO", "MARUTI": "MARUTI",
    "MAXFIN": "MFSL", "MAXHEA": "MAXHEALTH", "MAZDOC": "MAZDOCK", "MOTSUM": "MOTHERSON",
    "MPHLIM": "MPHASIS", "NBCC": "NBCC", "NESIND": "NESTLEIND", "NHPC": "NHPC",
    "OILIND": "OIL", "ONE97": "PAYTM", "ONGC": "ONGC", "ORAFIN": "OFSS",
    "PAGIND": "PAGEIND", "PERSYS": "PERSISTENT", "PETLNG": "PETRONET", "PGELEC": "POWERGRID",
    "PHOMIL": "PHOENIXLTD", "PIDIND": "PIDILITIND", "PIIND": "PIIND", "PIRPHA": "PIRPHARMA",
    "PNBHOU": "PNBHOUSING", "POLI": "POLYCAB", "POWFIN": "PFC", "PREENR": "PRESTIGE",
    "PREEST": "PRESTIGE", "PUNBAN": "PNB", "RAIVIK": "RVNL", "RBLBAN": "RBLBANK",
    "RUCSOY": "PATANJALI", "RURELE": "REC", "SAIL": "SAIL", "SBICAR": "SBICARD",
    "SBILIF": "SBILIFE", "SHRCEM": "SHREECEM", "SHRTRA": "SHRIRAMFIN", "SIEMEN": "SIEMENS",
    "SOLIN": "SOLARINDS", "SONBLW": "SONACOMS", "SRF": "SRF", "SUPIND": "SUPREMEIND",
    "SUZENE": "SUZLON", "TATELX": "TATAELXSI", "TATGLO": "TATACONSUM", "TATTEC": "TATATECH",
    "TECMAH": "TECHM", "TITIND": "TITAN", "TORPHA": "TORNTPHARM", "TORPOW": "TORNTPOWER",
    "TRENT": "TRENT", "TUBIN": "TIINDIA", "TVSMOT": "TVSMOTOR", "UNISPI": "UNITDSPR",
    "VARBEV": "VBL", "VEDLIM": "VEDL", "VOLTAS": "VOLTAS", "WAAENE": "WAREEENER",
    "ZOMLIM": "ZOMATO", "INDUSTOWER": "INDUSTOWER", "ABB": "ABB"
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

        const currentStocks = [];
        const currentFutures = [];

        // Add Indices
        const INDICES = [
            { name: "NIFTY", token: "26000", segment: "NSE" },
            { name: "BANKNIFTY", token: "26009", segment: "NSE" },
            { name: "FINNIFTY", token: "26037", segment: "NSE" },
            { name: "MIDCPNIFTY", token: "26035", segment: "NSE" },
            { name: "SENSEX", token: "99919000", segment: "BSE" }
        ];

        INDICES.forEach(idx => {
            store.symbolToTokenMaster[idx.name] = idx.token;
            store.tokenToName[idx.token] = idx.name;
            store.tokenToExchange[idx.token] = idx.segment;
            currentStocks.push({
                name: idx.name, userCode: idx.name, token: idx.token,
                actualSymbol: idx.name, fullName: idx.name, segment: idx.segment
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

        // Match user list
        for (const userSym of userSymbols) {
            const cleanUserSym = userSym.toUpperCase().trim();
            const searchSym = manualMap[cleanUserSym] || cleanUserSym;

            const nseS = nseEquity.find(s => s.symbol === `${searchSym}-EQ` || s.symbol === searchSym);
            if (nseS) {
                const sym = nseS.symbol.replace("-EQ", "");
                currentStocks.push({ name: sym, userCode: userSym, token: nseS.token, actualSymbol: nseS.symbol, fullName: nseS.name, segment: 'NSE' });
            }
            const bseS = bseEquity.find(s => s.symbol === `${searchSym}-EQ` || s.symbol === searchSym);
            if (bseS) {
                const sym = bseS.symbol.replace("-EQ", "");
                currentStocks.push({ name: sym, userCode: userSym, token: bseS.token, actualSymbol: bseS.symbol, fullName: bseS.name, segment: 'BSE' });
            }

            // Identify Futures for this symbol (NSE ONLY - NFO)
            const symFutures = nfoScrips.filter(f => 
                f.name === searchSym && 
                f.exch_seg === "NFO" && 
                (f.instrumenttype === "FUTSTK" || f.instrumenttype === "FUTIDX")
            );
            
            symFutures.forEach(f => {
                currentFutures.push({
                    name: f.name,
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

        console.log(`[MasterScrip] Matched ${currentStocks.length} stocks and ${currentFutures.length} futures.`);
        store.stocks = currentStocks;

        // Sync to DB (Truncate first to ensure only NSE futures remain)
        Stock.bulkCreate(currentStocks, { ignoreDuplicates: true }).catch(e => console.error("DB Sync Error (Stocks):", e.message));
        
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
    // Implementation for syncing live prices to DB if needed
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
