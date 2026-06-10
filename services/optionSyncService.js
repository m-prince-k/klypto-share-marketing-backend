const store = require('./marketStore');
const { getHistoricalCandle } = require('./angelOne');
const { OptionChain } = require('../models');
const smartApi = require('./smartApi');
const { formatDate, getCandlesWithCache } = require('./dbService');
const { Op } = require('sequelize');

async function syncPriorityOptionsHistory() {
    const symbols = [
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

    const interval = "5m";
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(toDate.getDate() - 365); // 1 Year

    console.log(`[PrioritySync] Starting sync for 20 symbols, 365 days, 5m interval...`);

    for (const userSym of symbols) {
        try {
            // Find actual NSE symbol from store
            const stockObj = store.stocks.find(s => s.userCode === userSym && s.segment === "NSE");
            const sym = stockObj ? stockObj.name : userSym;

            console.log(`[PrioritySync] Processing ${userSym} (Actual: ${sym})...`);

            // 1. Get LTP for ATM calculation
            let ltp = 0;
            const key = `${sym}:NSE`;
            if (store.latestMarketData[key]) {
                ltp = parseFloat(store.latestMarketData[key].last_traded_price || 0);
            }

            if (ltp === 0) {
                console.log(`[PrioritySync] LTP for ${sym} not in store. Fetching via API...`);
                const token = store.symbolToTokenMaster[sym];
                if (token) {
                    const resp = await smartApi.marketData({ 
                        mode: "LTP", 
                        exchangeTokens: { "NSE": [token] } 
                    });
                    if (resp && resp.data && resp.data.fetched && resp.data.fetched.length > 0) {
                        ltp = parseFloat(resp.data.fetched[0].ltp);
                    }
                }
            }

            if (ltp === 0) {
                console.log(`[PrioritySync] Could not resolve LTP for ${sym}. Using a default strike search.`);
                // If we can't get LTP, we can't reliably find ATM. Skip for now.
                continue;
            }

            console.log(`[PrioritySync] ${sym} Current LTP: ${ltp}`);

            // 2. Identify Strikes
            const allOpts = store.nfoMasterData.filter(o => o.name === sym && (o.instrumenttype === "OPTSTK" || o.instrumenttype === "OPTIDX"));
            if (allOpts.length === 0) {
                console.log(`[PrioritySync] No options found for ${sym} in NFO master.`);
                continue;
            }

            const uniqueStrikes = [...new Set(allOpts.map(o => parseFloat(o.strike) / 100))].sort((a, b) => a - b);
            if (uniqueStrikes.length === 0) continue;

            // Find closest strike (ATM)
            const atmStrike = uniqueStrikes.reduce((prev, curr) => Math.abs(curr - ltp) < Math.abs(prev - ltp) ? curr : prev);
            const atmIdx = uniqueStrikes.indexOf(atmStrike);
            
            // Get +/- 5 strikes
            const startIdx = Math.max(0, atmIdx - 5);
            const endIdx = Math.min(uniqueStrikes.length, atmIdx + 6);
            const targetStrikes = uniqueStrikes.slice(startIdx, endIdx);

            // Get all unique expiries for this symbol
            const allExpiries = [...new Set(allOpts.map(o => o.expiry))].sort((a, b) => new Date(a) - new Date(b));

            console.log(`[PrioritySync] Symbol: ${sym}, ATM: ${atmStrike}, Expiries Found: ${allExpiries.length}`);

            for (const targetExpiry of allExpiries) {
                console.log(`[PrioritySync] Processing Expiry: ${targetExpiry} for ${sym}`);
                for (const strike of targetStrikes) {
                for (const type of ['CE', 'PE']) {
                    const opt = allOpts.find(o => 
                        parseFloat(o.strike) / 100 === strike && 
                        o.symbol.endsWith(type) && 
                        o.expiry === targetExpiry
                    );

                    if (!opt) continue;

                    console.log(`[PrioritySync] Fetching ${opt.symbol} (${opt.token}) - 12 Chunks (1 Year)...`);
                    
                    // Fetch in 30-day chunks for 12 months total
                    for (let i = 0; i < 12; i++) {
                        const chunkToDate = new Date();
                        chunkToDate.setDate(toDate.getDate() - (i * 30));
                        const chunkFromDate = new Date();
                        chunkFromDate.setDate(toDate.getDate() - ((i + 1) * 30));

                        const fDateStr = chunkFromDate.toISOString().split('T')[0] + " 09:15";
                        const tDateStr = chunkToDate.toISOString().split('T')[0] + " 15:30";

                        // Check if we already have data for this range to avoid re-fetching
                        const existingCount = await OptionChain.count({
                            where: {
                                symbol: opt.symbol,
                                timestamp: { [Op.between]: [chunkFromDate, chunkToDate] }
                            }
                        });

                        if (existingCount > 1000) {
                            console.log(`[PrioritySync] Skipping ${opt.symbol} Chunk ${i+1} - already has ${existingCount} records.`);
                            continue;
                        }

                        const candles = await getHistoricalCandle({
                            symbol: opt.symbol,
                            interval: "5m",
                            fromDate: fDateStr,
                            toDate: tDateStr,
                            exchange: opt.exch_seg,
                            symboltoken: opt.token
                        });

                        if (candles && candles.length > 0) {
                            const dbData = candles.map(c => ({
                                underlying: sym,
                                symbol: opt.symbol,
                                token: opt.token,
                                exchange: opt.exch_seg,
                                interval: "5m",
                                timestamp: c.timestamp,
                                strike: strike,
                                expiry: opt.expiry,
                                optionType: type,
                                open: c.open,
                                high: c.high,
                                low: c.low,
                                close: c.close,
                                volume: c.volume
                            }));

                            await OptionChain.bulkCreate(dbData, { ignoreDuplicates: true });
                            console.log(`[PrioritySync] Saved ${dbData.length} candles for ${opt.symbol} (Chunk ${i+1})`);
                        }
                        
                        // Larger delay to respect rate limits for 1-year sync
                        await new Promise(r => setTimeout(r, 5000));
                    }
                }
            }
        }

        } catch (err) {
            console.error(`[PrioritySync] Failed for ${userSym}:`, err.message);
        }
    }

    console.log(`[PrioritySync] Completed Priority Sync.`);
}

async function syncFullHistoryForSymbol(symbol, months = 12) {
    const uSym = symbol.toUpperCase().trim();
    console.log(`[FullSync] Starting ${months}-month history sync for all ${uSym} options...`);

    const interval = "FIVE_MINUTE";
    const now = new Date();
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(now.getFullYear() - 1);

    const fromDate = formatDate(oneYearAgo, "09:15", interval);
    const toDate = formatDate(now, "15:30", interval);

    const allOptions = store.nfoMasterData.filter(o =>
        (o.name === uSym || o.symbol.startsWith(uSym)) && (o.instrumenttype === "OPTIDX" || o.instrumenttype === "OPTSTK")
    );

    if (allOptions.length === 0) {
        console.warn(`[FullSync] No options found for ${uSym}`);
        return;
    }

    console.log(`[FullSync] Found ${allOptions.length} contracts for ${uSym}.`);

    let successCount = 0;
    for (const opt of allOptions) {
        try {
            console.log(`[FullSync] Processing ${opt.symbol} (${opt.token})...`);

            const rawExp = opt.expiry;
            let formattedExpiry = rawExp;
            if (rawExp && rawExp.length >= 9) {
                const day = rawExp.substring(0, 2);
                const monthStr = rawExp.substring(2, 5);
                const year = rawExp.substring(5);
                const monthMap = { 'JAN': '01', 'FEB': '02', 'MAR': '03', 'APR': '04', 'MAY': '05', 'JUN': '06', 'JUL': '07', 'AUG': '08', 'SEP': '09', 'OCT': '10', 'NOV': '11', 'DEC': '12' };
                const month = monthMap[monthStr.toUpperCase()] || '01';
                formattedExpiry = `${year}-${month}-${day}`;
            }

            const extraInfo = {
                underlying: uSym,
                strike: parseFloat(opt.strike) / 100,
                expiry: formattedExpiry,
                optionType: opt.symbol.endsWith("CE") ? "CE" : "PE"
            };

            const result = await getCandlesWithCache(opt.symbol, opt.token, opt.exch_seg, interval, fromDate, toDate, extraInfo);
            if (result && result.data?.length > 0) successCount++;

            // Respect rate limits
            await new Promise(r => setTimeout(r, 1200));
        } catch (err) {
            console.error(`[FullSync] Failed for ${opt.symbol}:`, err.message);
        }
    }
    console.log(`[FullSync] Completed. Successfully synced data for ${successCount}/${allOptions.length} contracts.`);
}

module.exports = { syncPriorityOptionsHistory, syncFullHistoryForSymbol };
