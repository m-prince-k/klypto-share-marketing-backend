const fs = require('fs');
const path = require('path');
const { getCandlesWithCache } = require('./services/dbService');
const store = require('./services/marketStore');
const authService = require('./services/authService');
const stockService = require('./services/stockService');
const { sequelize } = require('./models');

const STOCK_LIST = [
  "ABB", "POWERINDIA", "ADANIENT", "ADANIGREEN", "ADANIPORTS", "ADANIENSOL",
  "ABCAPITAL", "ALKEM", "AMBUJACEM", "AMBER", "ANGELONE", "APLAPOLLO",
  "APOLLOHOSP", "ASHOKLEY", "ASIANPAINT", "ASTRAL", "AUROPHARMA", "AUBANK",
  "DMART", "AXISBANK", "BAJAJ-AUTO", "BAJAJFINSV", "BAJFINANCE", "BAJAJHLDNG",
  "BANDHANBNK", "BANKBARODA", "BANKINDIA", "BHARTIARTL", "BDL", "BEL",
  "BHARATFORG", "INDUSTOWER", "BPCL", "BHEL", "BIOCON", "BLUESTARCO",
  "BOSCHLTD", "BRITANNIA", "BSE", "ZYDUSLIFE", "CANBK", "CDSL", "CHOLAFIN",
  "CIPLA", "COALINDIA", "COLPAL", "CAMS", "CONCOR", "CROMPTON", "CGPOWER",
  "CUMMINSIND", "DABUR", "DELHIVERY", "DIVISLAB", "DIXON", "DLF", "DRREDDY",
  "EICHERMOT", "EXIDEIND", "FEDERALBNK", "FORTIS", "NYKAA", "GAIL", "GLENMARK",
  "GMRAIRPORT", "GODREJCP", "GODREJPROP", "GRASIM", "HAVELLS", "HCLTECH",
  "HDFCAMC", "HDFCBANK", "HDFCLIFE", "HEROMOTOCO", "HAL", "HINDALCO",
  "HINDUNILVR", "HINDPETRO", "HINDZINC", "HUDCO", "ICICIBANK", "ICICIGI",
  "ICICIPRULI", "IDEA", "IDFCFIRSTB", "360ONE", "INDUSINDBK", "IEX",
  "SAMMAANCAP", "INDHOTEL", "INDIANB", "IOC", "IRFC", "IREDA", "NAUKRI",
  "INFY", "INOXWIND", "INDIGO", "ITC", "JINDALSTEL", "JIOFIN", "JSWENERGY",
  "JSWSTEEL", "JUBLFOOD", "KALYANKJIL", "KAYNES", "KEI", "KFINTECH",
  "KOTAKBANK", "KPITTECH", "LT", "LAURUSLABS", "LICI", "LICHSGFIN", "LTF",
  "LTM", "LUPIN", "LODHA", "M&M", "MANAPPURAM", "MANKIND", "MARICO", "MARUTI",
  "MFSL", "MAXHEALTH", "MAZDOCK", "MCX", "UNOMINDA", "MOTHERSON", "MPHASIS",
  "MUTHOOTFIN", "NATIONALUM", "NMDC", "NBCC", "NESTLEIND", "NHPC", "COFORGE",
  "NTPC", "NUVAMA", "OBEROIRLTY", "DALBHARAT", "OIL", "PAYTM", "ONGC", "OFSS",
  "PAGEIND", "POLICYBZR", "PERSISTENT", "PETRONET", "PGEL", "PHOENIXLTD",
  "PIDILITIND", "PIIND", "PPLPHARMA", "PNBHOUSING", "POLYCAB", "PFC",
  "POWERGRID", "PREMIERENE", "PRESTIGE", "PNB", "RVNL", "RBLBANK", "RELIANCE",
  "PATANJALI", "RECLTD", "SAIL", "SBICARD", "SBILIFE", "SHREECEM", "SHRIRAMFIN",
  "SIEMENS", "SOLARINDS", "SONACOMS", "SRF", "SBIN", "SUNPHARMA", "SUPREMEIND",
  "SUZLON", "SWIGGY", "SYNGENE", "TATAELXSI", "TATACONSUM", "TMPV", "TATAPOWER",
  "TATASTEEL", "TATATECH", "TCS", "TECHM", "TITAN", "TORNTPHARM", "TORNTPOWER",
  "TRENT", "TIINDIA", "TVSMOTOR", "ULTRACEMCO", "UNIONBANK", "UPL", "UNITDSPR",
  "VBL", "VEDL", "VOLTAS", "WAAREEENER", "WIPRO", "YESBANK", "ETERNAL"
];

function formatDate(d, time) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day} ${time}`;
}

async function main() {
    console.log("=========================================");
    console.log("   6-MONTH 5M HISTORICAL DATA FETCHER   ");
    console.log("=========================================\n");

    try {
        console.log("[1/3] Connecting to Database...");
        await sequelize.authenticate();
        await sequelize.sync();
        
        console.log("[2/3] Authenticating with Angel One...");
        await authService.login();

        console.log("[3/3] Loading Exchange Tokens...");
        await stockService.fetchTop200Stocks();

        // Create folder in root
        const csvFolder = path.join(__dirname, 'historical_csv');
        if (!fs.existsSync(csvFolder)) {
            fs.mkdirSync(csvFolder);
            console.log(`Created folder: ${csvFolder}`);
        }

        const now = new Date();
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(now.getMonth() - 6);
        
        const toDateStr = formatDate(now, "15:30");
        const fromDateStr = formatDate(sixMonthsAgo, "09:15");

        console.log(`\nDate Range: ${fromDateStr} to ${toDateStr}`);
        console.log(`Total Stocks to fetch: ${STOCK_LIST.length}\n`);

        for (let i = 0; i < STOCK_LIST.length; i++) {
            const symbol = STOCK_LIST[i];
            console.log(`[${i + 1}/${STOCK_LIST.length}] Fetching ${symbol}...`);

            try {
                // Angel One format token key
                const tokenKey = `${symbol}_NSE`;
                const token = store.symbolToTokenMaster[tokenKey] || store.symbolToTokenMaster[symbol];

                if (!token) {
                    console.log(`  -> [SKIP] Token not found for ${symbol} in store.`);
                    continue;
                }

                // Call internal service which handles API chunking and DB saving automatically!
                const result = await getCandlesWithCache(symbol, token, "NSE", "FIVE_MINUTE", fromDateStr, toDateStr);
                
                if (result && result.data && result.data.length > 0) {
                    const filePath = path.join(csvFolder, `${symbol}.csv`);
                    let csvContent = "datetime,open,high,low,close,volume\n";
                    
                    for (const candle of result.data) {
                        const ts = new Date(candle.timestamp);
                        // Format for CSV: YYYY-MM-DD HH:mm:ss
                        const formattedTs = ts.toISOString().replace('T', ' ').substring(0, 19);
                        csvContent += `${formattedTs},${candle.open},${candle.high},${candle.low},${candle.close},${candle.volume}\n`;
                    }
                    
                    fs.writeFileSync(filePath, csvContent);
                    console.log(`  -> [SUCCESS] Saved ${result.data.length} rows to historical_csv/${symbol}.csv`);
                } else {
                    console.log(`  -> [EMPTY] No data returned for ${symbol}.`);
                }
            } catch (err) {
                console.error(`  -> [ERROR] Failed to fetch ${symbol}: ${err.message}`);
                if (err.message.includes("429") || err.message.includes("exceeding access rate")) {
                    console.log("  -> [RATE LIMIT] Sleeping for 30 seconds before retrying next...");
                    await new Promise(resolve => setTimeout(resolve, 30000));
                }
            }

            // Sleep 2 seconds between stocks to prevent API ban
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        console.log("\n=========================================");
        console.log("        ALL FETCHING COMPLETED!         ");
        console.log("=========================================\n");

    } catch (e) {
        console.error("FATAL SCRIPT ERROR:", e);
    }

    process.exit(0);
}

main();
