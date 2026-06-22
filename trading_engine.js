const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const { getCandlesWithCache, formatDate } = require('./services/dbService');
const { calculateSMA } = require('./Indicators/SMA');
const { calculateRSIIndicator } = require('./Indicators/rsi-indicator');
const { calculateSSLHybrid } = require('./Indicators/ssl-hybrid');
const store = require('./services/marketStore');

// =========================================================
// CONFIGURATION
// =========================================================
const historical_folder = path.join('NSE', 'equity_daily_Parameters');
const trade_folder = path.join('NSE', 'Trades_daily_equity');

if (!fs.existsSync(trade_folder)) {
    fs.mkdirSync(trade_folder, { recursive: true });
}

const MAX_ROWS = 300;
const TABLE_NAME = "live_equity_5m_raw";
const stock_store = {};

const STOCK_LIST = ["ABB", "ABBPOW", "ADAENT", "ADAGRE", "ADAPOR", "ADATRA", "ADICAP", "ALKLAB", "AMBCE", "AMBEN", "ANGBRO", "APLAPO", "APOHOS", "ASHLEY", "ASIPAI", "ASTPOL", "AURPHA", "AUSMA", "AVESUP", "AXIBAN", "BAAUTO", "BAFINS", "BAJFI", "BAJHOL", "BANBAN", "BANBAR", "BANIND", "BHAAIR", "BHADYN", "BHAELE", "BHAFOR", "BHAINF", "BHAPET", "BHEL", "BIOCON", "BLUSTA", "BOSLIM", "BRIIND", "BSE", "CADHEA", "CANBAN", "CDSL", "CHOINV", "CIPLA", "COALIN", "COLPAL", "COMAGE", "CONCOR", "CROGR", "CROGRE", "CUMIND", "DABIND", "DELLIM", "DIVLAB", "DIXTEC", "DLFLIM", "DRREDD", "EICMOT", "EXIIND", "FEDBAN", "FORHEA", "FSNECO", "GAIL", "GLEPHA", "GMRINF", "GODCON", "GODPRO", "GRASIM", "HAVIND", "HCLTEC", "HDFAMC", "HDFBAN", "HDFSTA", "HERHON", "HINAER", "HINDAL", "HINLEV", "HINPET", "HINZIN", "HUDCO", "ICIBAN", "ICILOM", "ICIPRU", "IDECEL", "IDFBAN", "IIFWEA", "INDBA", "INDEN", "INDHO", "INDHOT", "INDIBA", "INDOIL", "INDR", "INDREN", "INFEDG", "INFTEC", "INOWIN", "INTAVI", "ITC", "JINSP", "JIOFIN", "JSWENE", "JSWSTE", "JUBFOO", "KALJEW", "KAYTEC", "KEIIND", "KFITEC", "KOTMAH", "KPITE", "LARTOU", "LAULAB", "LIC", "LICHF", "LTFINA", "LTINFO", "LUPIN", "MACDEV", "MAHMAH", "MANAFI", "MAPHA", "MARLIM", "MARUTI", "MAXFIN", "MAXHEA", "MAZDOC", "MCX", "MININD", "MOTSUM", "MPHLIM", "MUTFIN", "NATALU", "NATMIN", "NBCC", "NESIND", "NHPC", "NIFTY", "NIITEC", "NTPC", "NUVWEA", "OBEREA", "ODICEM", "OILIND", "ONE97", "ONGC", "ORAFIN", "PAGIND", "PBFINT", "PERSYS", "PETLNG", "PGELEC", "PHOMIL", "PIDIND", "PIIND", "PIRPHA", "PNBHOU", "POLI", "POWFIN", "POWGRI", "PREENR", "PREEST", "PUNBAN", "RAIVIK", "RBLBAN", "RELIND", "RUCSOY", "RURELE", "SAIL", "SBICAR", "SBILIF", "SHRCEM", "SHRTRA", "SIEMEN", "SOLIN", "SONBLW", "SRF", "STABAN", "SUNPHA", "SUPIND", "SUZENE", "SWILIM", "TATELX", "TATGLO", "TATMOT", "TATPOW", "TATSTE", "TCS", "TECMAH", "TITIND", "TORPHA", "TORPOW", "TRENT", "TUBIN", "TVSMOT", "ULTCEM", "UNIBAN", "UNIP", "UNISPI", "VARBEV", "VEDLIM", "VOLTAS", "WAAENE", "WIPRO", "YESBAN", "ZOMLIM"];

async function get_historical_for_engine(symbol) {
    if (stock_store[symbol]) return stock_store[symbol];

    // Ensure we have token
    const tokenKey = `${symbol}_NSE`;
    const token = store.symbolToTokenMaster[tokenKey] || store.symbolToTokenMaster[symbol];
    if (!token) throw new Error(`Token not found for ${symbol} in marketStore`);

    const now = new Date();
    const pastDate = new Date();
    pastDate.setDate(now.getDate() - 20); // Last 20 days as user requested

    const fromDateStr = formatDate(pastDate, "09:15");
    const toDateStr = formatDate(now, "15:30");

    const result = await getCandlesWithCache(symbol, token, "NSE", "FIVE_MINUTE", fromDateStr, toDateStr);

    if (!result || !result.data || result.data.length === 0) {
        throw new Error(`No historical data returned for ${symbol}`);
    }

    stock_store[symbol] = result.data.map(c => ({
        ...c,
        datetime: new Date(c.timestamp),
        open: parseFloat(c.open),
        high: parseFloat(c.high),
        low: parseFloat(c.low),
        close: parseFloat(c.close),
        volume: parseInt(c.volume, 10) || 0
    }));

    return stock_store[symbol];
}

async function update_indicators(df) {
    // SMA
    const sma20Res = await calculateSMA(df, { maType: "SMA", maLength: 20 });
    const sma50Res = await calculateSMA(df, { maType: "SMA", maLength: 50 });
    const sma100Res = await calculateSMA(df, { maType: "SMA", maLength: 100 });
    const sma200Res = await calculateSMA(df, { maType: "SMA", maLength: 200 });

    // RSI
    const rsiRes = await calculateRSIIndicator(df, { length: 14 });

    // SSL
    const sslRes = await calculateSSLHybrid(df, { maType: "HMA", baseLen: 60 });

    for (let i = 0; i < df.length; i++) {
        df[i].SMA_20 = sma20Res[i]?.smoothingMA || null;
        df[i].SMA_50 = sma50Res[i]?.smoothingMA || null;
        df[i].SMA_100 = sma100Res[i]?.smoothingMA || null;
        df[i].SMA_200 = sma200Res[i]?.smoothingMA || null;

        df[i].RSI = rsiRes[i]?.rsi || null;

        df[i].SSL_Line = sslRes[i]?.baseline || null;
        df[i].SSL_Trend = sslRes[i]?.buySignal ? "UP" : (sslRes[i]?.sellSignal ? "DOWN" : "FLAT");
    }

    return df;
}

function check_sma_conditions(df, lookback = 3) {
    if (df.length < lookback + 1) return [null, null];

    const row = df[df.length - 1];
    const o = row.open;
    const c = row.close;

    const smas = [row.SMA_20, row.SMA_50, row.SMA_100, row.SMA_200];
    if (smas.includes(null) || smas.includes(undefined)) return [null, null];

    const max_sma = Math.max(...smas);
    const min_sma = Math.min(...smas);

    const above_all = c > max_sma;
    const below_all = c < min_sma;

    const cross_last_up = (o <= max_sma && max_sma <= c);
    const cross_last_down = (c <= min_sma && min_sma <= o);

    const full_cross_up = (o <= min_sma && c >= max_sma);
    const full_cross_down = (c <= min_sma && o >= max_sma);

    if (!(above_all || cross_last_up || below_all || cross_last_down || full_cross_up || full_cross_down)) {
        return [null, null];
    }

    const lookback_start = Math.max(0, df.length - lookback - 1);
    const window = df.slice(lookback_start);

    let crossed = false;
    let below_all_cnt = 0;
    let above_all_cnt = 0;

    for (const prev of window) {
        const po = prev.open;
        const pc = prev.close;

        const prev_smas = [prev.SMA_20, prev.SMA_50, prev.SMA_100, prev.SMA_200];
        if (prev_smas.includes(null)) continue;

        const pmax = Math.max(...prev_smas);
        const pmin = Math.min(...prev_smas);

        const prev_cross_up = (po <= pmax && pmax <= pc);
        const prev_full_up = (po <= pmin && pc >= pmax);
        const prev_cross_down = (pc <= pmin && pmin <= po);
        const prev_full_down = (pc <= pmin && po >= pmax);

        if (prev_cross_up || prev_full_up || prev_cross_down || prev_full_down) {
            crossed = true;
        }

        if (pc < pmin) below_all_cnt++;
        else if (pc > pmax) above_all_cnt++;
    }

    const current_up = above_all || cross_last_up || full_cross_up;
    const current_down = below_all || cross_last_down || full_cross_down;

    if (current_up) {
        if (crossed) return ["UP", "CROSS_CONTINUATION"];
        if (below_all_cnt >= lookback) return ["UP", "REVERSAL"];
    }

    if (current_down) {
        if (crossed) return ["DOWN", "CROSS_CONTINUATION"];
        if (above_all_cnt >= lookback) return ["DOWN", "REVERSAL"];
    }

    return [null, null];
}

function candle_filter(df, gap_threshold = 0.01, body_threshold = 0.015, wick_ratio = 2) {
    if (df.length < 2) {
        return [false, { gap_pct: null, body_pct: null, upper_wick: null, lower_wick: null, reason: "insufficient_data" }];
    }

    const row = df[df.length - 1];
    const prev = df[df.length - 2];

    const open_ = row.open;
    const close_ = row.close;
    const high_ = row.high;
    const low_ = row.low;
    const prev_close = prev.close;

    // GAP
    const gap_pct = (open_ - prev_close) / prev_close;
    const gap_flag = Math.abs(gap_pct) > gap_threshold;

    // BODY
    const body = Math.abs(close_ - open_);
    const body_pct = open_ !== 0 ? body / open_ : 0;
    const body_flag = body_pct > body_threshold;

    // WICKS
    const upper_wick = high_ - Math.max(open_, close_);
    const lower_wick = Math.min(open_, close_) - low_;

    const wick_flag = (upper_wick > body * wick_ratio) || (lower_wick > body * wick_ratio);

    const reject = gap_flag || body_flag || wick_flag;

    const reason = [];
    if (gap_flag) reason.push("gap");
    if (body_flag) reason.push("body");
    if (wick_flag) reason.push("wick");

    return [!reject, {
        gap_pct, body_pct, upper_wick, lower_wick, reason: reason.length ? reason.join(",") : "pass"
    }];
}

async function process_stock_tick(stock, tick) {
    console.log(`[ENTER] ${stock}`);
    try {

        let stock_obj = await get_historical_for_engine(stock);

        const tickDate = tick.timestamp ? new Date(tick.timestamp) : new Date();

        // BUILD NEW ROW
        const new_row = {
            time: Math.floor(tickDate.getTime() / 1000),
            timestamp: tick.timestamp || tickDate.toISOString(),
            datetime: tickDate,
            stock_code: stock,
            open: parseFloat(tick.open),
            high: parseFloat(tick.high),
            low: parseFloat(tick.low),
            close: parseFloat(tick.close),
            volume: parseInt(tick.volume, 10) || 0
        };

        // APPEND + CLEAN (Merge if same time, else push)
        const lastCandle = stock_obj[stock_obj.length - 1];
        if (lastCandle && lastCandle.datetime.getTime() === tickDate.getTime()) {
            stock_obj[stock_obj.length - 1] = { ...lastCandle, ...new_row };
        } else {
            stock_obj.push(new_row);
        }

        // Limit memory footprint to last 2000 candles
        if (stock_obj.length > 2000) stock_obj.shift();

        stock_obj.sort((a, b) => a.datetime - b.datetime);

        // UPDATE INDICATORS
        stock_obj = await update_indicators(stock_obj);

        const row = stock_obj[stock_obj.length - 1];
        const df = stock_obj; // Map df to stock_obj for old logic compatibility


        // SMA CONDITIONS
        const [trend, signal] = check_sma_conditions(stock_obj);

        if (!trend) {
            stock_obj.df = df;
            stock_obj.last_seen = tick.datetime;
            console.log(`[REJECT] ${stock} no trend`);
            return;
        }

        // RSI FILTER
        const rsi = row.RSI;

        if (rsi === null || rsi === undefined || isNaN(rsi)) {
            stock_obj.df = df;
            stock_obj.last_seen = tick.datetime;
            console.log(`[REJECT] ${stock} RSI NaN`);
            return;
        }

        if (trend === "UP" && rsi <= 70) {
            stock_obj.df = df;
            stock_obj.last_seen = tick.datetime;
            console.log(`[REJECT] ${stock} RSI weak for CALL`);
            return;
        }

        if (trend === "DOWN" && rsi > 30) {
            stock_obj.df = df;
            stock_obj.last_seen = tick.datetime;
            console.log(`[REJECT] ${stock} RSI weak for PUT`);
            return;
        }

        // CANDLE FILTER
        const [valid_candle, candle_info] = candle_filter(df);

        if (!valid_candle) {
            stock_obj.df = df;
            stock_obj.last_seen = tick.datetime;
            console.log(`[REJECT] ${stock} candle fail -> ${JSON.stringify(candle_info)}`);
            return;
        }

        // SSL FILTER
        const entry_open = row.open;
        const entry_close = row.close;
        const ssl_line = row.SSL_Line;

        const ssl_between = (Math.min(entry_open, entry_close) <= ssl_line && ssl_line <= Math.max(entry_open, entry_close));
        const ssl_distance = Math.abs(entry_open - ssl_line);
        const ssl_pct = ssl_distance / entry_open;

        if (!(ssl_between || ssl_pct <= 0.005)) {
            stock_obj.df = df;
            stock_obj.last_seen = tick.datetime;
            console.log(`[REJECT] ${stock} SSL fail`);
            return;
        }

        // TRADE SIGNAL
        const trade_type = trend === "UP" ? "CALL" : "PUT";

        const trade_signal = {
            Stock: stock,
            Date: row.datetime.toISOString().split('T')[0],
            Status: "TRADED",
            Type: trade_type,

            Entry_Time: row.datetime.toISOString(),
            Entry_Price: entry_close,

            RSI: rsi,
            Trend: trend,
            Signal: signal,

            SSL_Line: ssl_line,
            SSL_Trend_Entry: row.SSL_Trend,
            SSL_Between: ssl_between,
            SSL_Distance_Pct: ssl_pct,

            Gap_Pct: candle_info.gap_pct,
            Body_Pct: candle_info.body_pct,
            Upper_Wick: candle_info.upper_wick,
            Lower_Wick: candle_info.lower_wick,

            SMA_20: row.SMA_20,
            SMA_50: row.SMA_50,
            SMA_100: row.SMA_100,
            SMA_200: row.SMA_200,

            volume: row.volume !== undefined ? row.volume : ""
        };
        return trade_signal;
    } catch (e) {
        console.error(`[PROCESS ERROR] ${stock}: ${e.message}`);
    }
}

// =========================================================
// RUN / EXPORT
// =========================================================
module.exports = {
    process_stock_tick,
    get_historical_for_engine
};
