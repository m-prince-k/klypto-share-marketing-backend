import os
import time
import math
import numpy as np
import pandas as pd
import socketio
import requests

# Initialize Socket.IO client
sio = socketio.Client()

# =========================================================
# CONFIGURATION
# =========================================================
historical_folder = r"NSE\equity_daily_Parameters"
trade_folder = r"NSE\Trades_daily_equity"
os.makedirs(trade_folder, exist_ok=True)
MAX_ROWS = 300
TABLE_NAME = "live_equity_5m_raw"
stock_store = {}

# Add your 200 stock codes here
STOCK_LIST = ["ABB","ABBPOW","ADAENT","ADAGRE","ADAPOR","ADATRA","ADICAP","ALKLAB","AMBCE","AMBEN","ANGBRO","APLAPO","APOHOS","ASHLEY","ASIPAI","ASTPOL","AURPHA","AUSMA",   "AVESUP","AXIBAN","BAAUTO","BAFINS","BAJFI","BAJHOL","BANBAN","BANBAR","BANIND","BHAAIR","BHADYN","BHAELE","BHAFOR","BHAINF","BHAPET","BHEL","BIOCON","BLUSTA",             "BOSLIM","BRIIND","BSE","CADHEA","CANBAN","CDSL","CHOINV","CIPLA","COALIN","COLPAL","COMAGE","CONCOR","CROGR","CROGRE","CUMIND","DABIND","DELLIM",             "DIVLAB","DIXTEC","DLFLIM","DRREDD","EICMOT","EXIIND","FEDBAN","FORHEA","FSNECO","GAIL","GLEPHA","GMRINF","GODCON","GODPRO","GRASIM","HAVIND","HCLTEC",             "HDFAMC","HDFBAN","HDFSTA","HERHON","HINAER","HINDAL","HINLEV","HINPET","HINZIN","HUDCO","ICIBAN","ICILOM","ICIPRU","IDECEL","IDFBAN","IIFWEA","INDBA",             "INDEN","INDHO","INDHOT","INDIBA","INDOIL","INDR","INDREN","INFEDG","INFTEC","INOWIN","INTAVI","ITC","JINSP","JIOFIN","JSWENE","JSWSTE","JUBFOO","KALJEW",             "KAYTEC","KEIIND","KFITEC","KOTMAH","KPITE","LARTOU","LAULAB","LIC","LICHF","LTFINA","LTINFO","LUPIN","MACDEV","MAHMAH","MANAFI","MAPHA","MARLIM","MARUTI",             "MAXFIN","MAXHEA","MAZDOC","MCX","MININD","MOTSUM","MPHLIM","MUTFIN","NATALU","NATMIN","NBCC","NESIND","NHPC","NIFTY","NIITEC","NTPC","NUVWEA","OBEREA",             "ODICEM","OILIND","ONE97","ONGC","ORAFIN","PAGIND","PBFINT","PERSYS","PETLNG","PGELEC","PHOMIL","PIDIND","PIIND","PIRPHA","PNBHOU","POLI","POWFIN","POWGRI",             "PREENR","PREEST","PUNBAN","RAIVIK","RBLBAN","RELIND","RUCSOY","RURELE","SAIL","SBICAR","SBILIF","SHRCEM","SHRTRA","SIEMEN","SOLIN","SONBLW","SRF","STABAN",            "SUNPHA","SUPIND","SUZENE","SWILIM","TATELX","TATGLO","TATMOT","TATPOW","TATSTE","TCS","TECMAH","TITIND","TORPHA","TORPOW","TRENT","TUBIN",             "TVSMOT","ULTCEM","UNIBAN","UNIP","UNISPI","VARBEV","VEDLIM","VOLTAS","WAAENE","WIPRO","YESBAN","ZOMLIM"]

# Backend API URL (Update if your backend is running on a different URL/Port)
API_BASE_URL = "http://localhost:8000"

# =========================================================
# FETCH LATEST TICKS FOR ALL STOCKS (VIA API)
# =========================================================
def fetch_latest_ticks():
    try:
        response = requests.get(f"{API_BASE_URL}/equity/live")
        data = response.json()
        
        if not data.get("success"):
            return []
            
        ticks = []
        for item in data.get("data", []):
            stock_code = item.get("symbol")
            if stock_code not in STOCK_LIST:
                continue
                
            # Fallbacks for field names depending on API response format
            close_price = item.get("last_traded_price") or item.get("ltp") or 0
            open_price = item.get("open_price_of_the_day") or close_price
            high_price = item.get("high_price_of_the_day") or close_price
            low_price = item.get("low_price_of_the_day") or close_price
            volume = item.get("volume_trade_for_the_day") or 0
            
            ticks.append({
                "stock_code": stock_code,
                "datetime": pd.Timestamp.now().isoformat(),
                "open": float(open_price),
                "high": float(high_price),
                "low": float(low_price),
                "close": float(close_price),
                "volume": int(volume)
            })
            
        return ticks
    except Exception as e:
        print(f"[API ERROR] fetching live ticks: {e}")
        return []



# =========================================================
# INDICATORS
# =========================================================
def WMA(series, period):
    weights = np.arange(1, period + 1)
    return series.rolling(period).apply(
        lambda x: np.dot(x, weights) / weights.sum(),
        raw=True
    )

def HMA(series, period):
    half = int(period / 2)
    sqrt_len = int(math.sqrt(period))
    return WMA(2 * WMA(series, half) - WMA(series, period), sqrt_len)

def calculate_sma(df):
    for p in [20, 50, 100, 200]:
        df[f"SMA_{p}"] = df["close"].rolling(p).mean()
    return df

def calculate_rsi(df, period=14):

    if len(df) < 2:
        df["RSI"] = None
        return df

    # Ensure required columns exist
    required_cols = ["Price_change", "Gain", "Loss","RMA_Gain", "RMA_Loss", "RS", "RSI"]

    for col in required_cols:
        if col not in df.columns:
            df[col] = None

    # If historical initialization not done
    if df["RMA_Gain"].isna().all() or df["RMA_Gain"].isnull().all():

        # Full initialization
        for i in range(1, len(df)):
            change = float(df.iloc[i]["close"]) - float(df.iloc[i - 1]["close"])
            gain = max(change, 0)
            loss = abs(min(change, 0))

            df.at[df.index[i], "Price_change"] = change
            df.at[df.index[i], "Gain"] = gain
            df.at[df.index[i], "Loss"] = loss

            if i == period:
                avg_gain = df["Gain"].iloc[1:period + 1].astype(float).mean()
                avg_loss = df["Loss"].iloc[1:period + 1].astype(float).mean()

                df.at[df.index[i], "RMA_Gain"] = avg_gain
                df.at[df.index[i], "RMA_Loss"] = avg_loss

            elif i > period:
                prev_idx = df.index[i - 1]
                curr_idx = df.index[i]

                prev_rma_g = float(df.at[prev_idx, "RMA_Gain"])
                prev_rma_l = float(df.at[prev_idx, "RMA_Loss"])

                rma_g = ((prev_rma_g * (period - 1)) + gain) / period
                rma_l = ((prev_rma_l * (period - 1)) + loss) / period

                df.at[curr_idx, "RMA_Gain"] = rma_g
                df.at[curr_idx, "RMA_Loss"] = rma_l

            # RSI calc
            if i >= period:
                rma_g = df.at[df.index[i], "RMA_Gain"]
                rma_l = df.at[df.index[i], "RMA_Loss"]

                if rma_l == 0:
                    df.at[df.index[i], "RSI"] = 100
                else:
                    rs = rma_g / rma_l
                    df.at[df.index[i], "RS"] = rs
                    df.at[df.index[i], "RSI"] = 100 - (100 / (1 + rs))

    else:
        # Incremental update only for last row
        curr = df.index[-1]
        prev = df.index[-2]

        change = float(df.at[curr, "close"]) - float(df.at[prev, "close"])
        gain = max(change, 0)
        loss = abs(min(change, 0))

        df.at[curr, "Price_change"] = change
        df.at[curr, "Gain"] = gain
        df.at[curr, "Loss"] = loss

        prev_rma_g = float(df.at[prev, "RMA_Gain"])
        prev_rma_l = float(df.at[prev, "RMA_Loss"])

        rma_g = ((prev_rma_g * (period - 1)) + gain) / period
        rma_l = ((prev_rma_l * (period - 1)) + loss) / period

        df.at[curr, "RMA_Gain"] = rma_g
        df.at[curr, "RMA_Loss"] = rma_l

        if rma_l == 0:
            df.at[curr, "RSI"] = 100
        else:
            rs = rma_g / rma_l
            df.at[curr, "RS"] = rs
            df.at[curr, "RSI"] = 100 - (100 / (1 + rs))

    return df

def calculate_ssl(df):

    required_cols = ["emaHigh", "emaLow","maHigh2", "maLow2","exitHigh", "exitLow",
                     "Baseline","ATR", "ATR_Upper", "ATR_Lower","HLV1", "HLV2", "HLV3",
                     "SSL_Line", "SSL_Trend","SSL2_Line", "SSL2_Trend","SSL_Exit"]

    for col in required_cols:
        if col not in df.columns:
            df[col] = None

    if len(df) < 60:
        return df

    # -------------------------------
    # HISTORICAL INITIALIZATION
    # -------------------------------
    if df["emaHigh"].isna().all() or df["emaHigh"].isnull().all():

        df["emaHigh"] = HMA(df["high"], 60)
        df["emaLow"] = HMA(df["low"], 60)

        df["maHigh2"] = HMA(df["high"], 5)
        df["maLow2"] = HMA(df["low"], 5)

        df["exitHigh"] = HMA(df["high"], 15)
        df["exitLow"] = HMA(df["low"], 15)

        df["Baseline"] = HMA(df["close"], 60)

        # ATR init
        tr_list = []
        for i in range(len(df)):
            if i == 0:
                tr = df.iloc[i]["high"] - df.iloc[i]["low"]
            else:
                tr = max(
                    df.iloc[i]["high"] - df.iloc[i]["low"],
                    abs(df.iloc[i]["high"] - df.iloc[i - 1]["close"]),
                    abs(df.iloc[i]["low"] - df.iloc[i - 1]["close"])
                )
            tr_list.append(tr)

        df["TR"] = tr_list
        df["ATR"] = df["TR"].rolling(14).mean()

        for i in range(1, len(df)):
            if pd.notna(df.iloc[i - 1]["ATR"]) and i >= 14:
                df.at[df.index[i], "ATR"] = (
                    (df.iloc[i - 1]["ATR"] * 13) + df.iloc[i]["TR"]
                ) / 14

        df["ATR_Upper"] = df["close"] + df["ATR"]
        df["ATR_Lower"] = df["close"] - df["ATR"]

        # HLV logic
        hlv1, hlv2, hlv3 = [], [], []

        prev1 = prev2 = prev3 = 1

        for i in range(len(df)):

            c = df.iloc[i]["close"]

            # SSL1
            h1, l1 = df.iloc[i]["emaHigh"], df.iloc[i]["emaLow"]
            if c > h1:
                prev1 = 1
            elif c < l1:
                prev1 = -1
            hlv1.append(prev1)

            # SSL2
            h2, l2 = df.iloc[i]["maHigh2"], df.iloc[i]["maLow2"]
            if c > h2:
                prev2 = 1
            elif c < l2:
                prev2 = -1
            hlv2.append(prev2)

            # SSL3
            h3, l3 = df.iloc[i]["exitHigh"], df.iloc[i]["exitLow"]
            if c > h3:
                prev3 = 1
            elif c < l3:
                prev3 = -1
            hlv3.append(prev3)

        df["HLV1"] = hlv1
        df["HLV2"] = hlv2
        df["HLV3"] = hlv3

        df["SSL_Line"] = np.where(df["HLV1"] == 1, df["emaLow"], df["emaHigh"])
        df["SSL_Trend"] = np.where(df["HLV1"] == 1, "UP", "DOWN")

        df["SSL2_Line"] = np.where(df["HLV2"] == 1, df["maLow2"], df["maHigh2"])
        df["SSL2_Trend"] = np.where(df["HLV2"] == 1, "UP", "DOWN")

        df["SSL_Exit"] = np.where(df["HLV3"] == 1, df["exitLow"], df["exitHigh"])

    # -------------------------------
    # INCREMENTAL LAST ROW UPDATE
    # -------------------------------
    else:
        curr = df.index[-1]
        prev = df.index[-2]

        df.at[curr, "emaHigh"] = HMA(df["high"], 60).iloc[-1]
        df.at[curr, "emaLow"] = HMA(df["low"], 60).iloc[-1]

        df.at[curr, "maHigh2"] = HMA(df["high"], 5).iloc[-1]
        df.at[curr, "maLow2"] = HMA(df["low"], 5).iloc[-1]

        df.at[curr, "exitHigh"] = HMA(df["high"], 15).iloc[-1]
        df.at[curr, "exitLow"] = HMA(df["low"], 15).iloc[-1]

        df.at[curr, "Baseline"] = HMA(df["close"], 60).iloc[-1]

        tr = max(
            df.at[curr, "high"] - df.at[curr, "low"],
            abs(df.at[curr, "high"] - df.at[prev, "close"]),
            abs(df.at[curr, "low"] - df.at[prev, "close"])
        )

        prev_atr = df.at[prev, "ATR"]
        df.at[curr, "ATR"] = ((prev_atr * 13) + tr) / 14
        df.at[curr, "ATR_Upper"] = df.at[curr, "close"] + df.at[curr, "ATR"]
        df.at[curr, "ATR_Lower"] = df.at[curr, "close"] - df.at[curr, "ATR"]

        # SSL1
        h1, l1 = df.at[curr, "emaHigh"], df.at[curr, "emaLow"]
        prev_hlv1 = df.at[prev, "HLV1"]
        hlv1 = 1 if df.at[curr, "close"] > h1 else (-1 if df.at[curr, "close"] < l1 else prev_hlv1)
        df.at[curr, "HLV1"] = hlv1
        df.at[curr, "SSL_Line"] = l1 if hlv1 == 1 else h1
        df.at[curr, "SSL_Trend"] = "UP" if hlv1 == 1 else "DOWN"

        # SSL2
        h2, l2 = df.at[curr, "maHigh2"], df.at[curr, "maLow2"]
        prev_hlv2 = df.at[prev, "HLV2"]
        hlv2 = 1 if df.at[curr, "close"] > h2 else (-1 if df.at[curr, "close"] < l2 else prev_hlv2)
        df.at[curr, "HLV2"] = hlv2
        df.at[curr, "SSL2_Line"] = l2 if hlv2 == 1 else h2
        df.at[curr, "SSL2_Trend"] = "UP" if hlv2 == 1 else "DOWN"

        # SSL3
        h3, l3 = df.at[curr, "exitHigh"], df.at[curr, "exitLow"]
        prev_hlv3 = df.at[prev, "HLV3"]
        hlv3 = 1 if df.at[curr, "close"] > h3 else (-1 if df.at[curr, "close"] < l3 else prev_hlv3)
        df.at[curr, "HLV3"] = hlv3
        df.at[curr, "SSL_Exit"] = l3 if hlv3 == 1 else h3

    return df

def update_indicators(df):
    df = calculate_sma(df)
    df = calculate_rsi(df)
    df = calculate_ssl(df)
    return df

def check_sma_conditions(df, lookback=3):
    if len(df) < lookback + 1:
        return None, None

    row = df.iloc[-1]

    o, c = row["open"], row["close"]

    smas = [
        row["SMA_20"],
        row["SMA_50"],
        row["SMA_100"],
        row["SMA_200"]
    ]

    max_sma = max(smas)
    min_sma = min(smas)

    above_all = c > max_sma
    below_all = c < min_sma

    cross_last_up = (o <= max_sma <= c)
    cross_last_down = (c <= min_sma <= o)

    full_cross_up = (o <= min_sma and c >= max_sma)
    full_cross_down = (c <= min_sma and o >= max_sma)

    if not (above_all or cross_last_up or below_all or cross_last_down or full_cross_up or full_cross_down):
        return None, None
        
    lookback_start = max(0, len(df) - lookback - 1)
    window = df.iloc[lookback_start:]

    crossed = False
    below_all_cnt = 0
    above_all_cnt = 0

    for _, prev in window.iterrows():

        po, pc = prev["open"], prev["close"]

        prev_smas = [
            prev["SMA_20"],
            prev["SMA_50"],
            prev["SMA_100"],
            prev["SMA_200"]
        ]

        pmax = max(prev_smas)
        pmin = min(prev_smas)

        prev_cross_up = (po <= pmax <= pc)
        prev_full_up = (po <= pmin and pc >= pmax)
        prev_cross_down = (pc <= pmin <= po)
        prev_full_down = (pc <= pmin and po >= pmax)

        if prev_cross_up or prev_full_up or prev_cross_down or prev_full_down:
            crossed = True

        if pc < pmin:
            below_all_cnt += 1
        elif pc > pmax:
            above_all_cnt += 1

    # Final decision
    current_up = above_all or cross_last_up or full_cross_up
    current_down = below_all or cross_last_down or full_cross_down

    if current_up:
        if crossed:
            return "UP", "CROSS_CONTINUATION"
        if below_all_cnt >= lookback:
            return "UP", "REVERSAL"

    if current_down:
        if crossed:
            return "DOWN", "CROSS_CONTINUATION"
        if above_all_cnt >= lookback:
            return "DOWN", "REVERSAL"

    return None, None

def candle_filter(df,
                  gap_threshold=0.01,
                  body_threshold=0.015,
                  wick_ratio=2):

    if len(df) < 2:
        return False, {
            "gap_pct": None,
            "body_pct": None,
            "upper_wick": None,
            "lower_wick": None,
            "reason": "insufficient_data"
        }

    row = df.iloc[-1]
    prev = df.iloc[-2]

    open_ = row["open"]
    close_ = row["close"]
    high_ = row["high"]
    low_ = row["low"]
    prev_close = prev["close"]

    # GAP
    gap_pct = (open_ - prev_close) / prev_close
    gap_flag = abs(gap_pct) > gap_threshold

    # BODY
    body = abs(close_ - open_)
    body_pct = body / open_ if open_ != 0 else 0
    body_flag = body_pct > body_threshold

    # WICKS
    upper_wick = high_ - max(open_, close_)
    lower_wick = min(open_, close_) - low_

    wick_flag = (
        (upper_wick > body * wick_ratio) or
        (lower_wick > body * wick_ratio)
    )

    reject = gap_flag or body_flag or wick_flag

    reason = []
    if gap_flag:
        reason.append("gap")
    if body_flag:
        reason.append("body")
    if wick_flag:
        reason.append("wick")

    return (not reject), {
        "gap_pct": gap_pct,
        "body_pct": body_pct,
        "upper_wick": upper_wick,
        "lower_wick": lower_wick,
        "reason": ",".join(reason) if reason else "pass"
    }

# =========================================================
# TRADE SAVE
# =========================================================
def save_trade(stock, trade_data):
    trade_file = os.path.join(trade_folder, f"{stock}_trade.csv")
    lock_file = trade_file + ".lock"

    new_df = pd.DataFrame([trade_data])

    if os.path.exists(trade_file):
        old_df = pd.read_csv(trade_file)
        new_df = pd.concat([old_df, new_df], ignore_index=True)

    new_df.to_csv(trade_file, index=False)

# =========================================================
# LOAD HISTORICAL (VIA API)
# =========================================================
def initialize_all_stocks():
    for stock in STOCK_LIST:
        try:
            url = f"{API_BASE_URL}/equity/historical?symbol={stock}&interval=5m&days=20"
            response = requests.get(url)
            data = response.json()
            
            if not data.get("success") or not data.get("data"):
                print(f"[MISSING API DATA] {stock}")
                continue
                
            df = pd.DataFrame(data["data"])
            
            # Format API response columns if they are list arrays instead of dicts
            if len(df.columns) >= 6 and 'datetime' not in df.columns and 'time' not in df.columns:
                df.columns = ["datetime", "open", "high", "low", "close", "volume"][:len(df.columns)]
                
            # Determine correct datetime column
            dt_col = "time" if "time" in df.columns else "datetime"
            
            if dt_col in df.columns:
                df["datetime"] = pd.to_datetime(
                    df[dt_col],
                    dayfirst=True,
                    format="mixed"
                )
            else:
                print(f"[INIT ERROR] {stock}: Missing datetime column in API response.")
                continue

            # Sort and take latest rows
            df = df.sort_values("datetime").tail(MAX_ROWS).reset_index(drop=True)
            
            # Ensure proper types
            for col in ["open", "high", "low", "close"]:
                if col in df.columns:
                    df[col] = df[col].astype(float)

            stock_store[stock] = {
                "df": df,
                "last_seen": None,
                "active_trade": None
            }

            print(f"[INIT] {stock} loaded from API")

        except Exception as e:
            print(f"[INIT ERROR] {stock}: {e}")

# =========================================================
# PROCESS STOCK
# =========================================================
def process_stock_tick(stock, tick):
    """
    Live engine version aligned with backtest logic.
    Uses latest appended row as evaluation point.
    """
    print(f"[ENTER] {stock}")

    try:
        if stock not in stock_store:
            print(f"[SKIP] {stock} not initialized")
            return

        stock_obj = stock_store[stock]
        df = stock_obj["df"]

        # ---------------------------------
        # BUILD NEW ROW
        # ---------------------------------
        new_row = pd.DataFrame([{
            "datetime": pd.to_datetime(tick["datetime"], dayfirst=True),
            "stock_code": stock,
            "open": float(tick["open"]),
            "high": float(tick["high"]),
            "low": float(tick["low"]),
            "close": float(tick["close"]),
            "volume": int(tick["volume"])
            # "open_interest": int(tick["open_interest"]) # only works for futures data
        }])

        # ---------------------------------
        # APPEND + CLEAN
        # ---------------------------------
        df = pd.concat([df, new_row], ignore_index=True)
        df = df.drop_duplicates(subset=["datetime"], keep="last")
        df = df.sort_values("datetime").tail(MAX_ROWS).reset_index(drop=True)

        if len(df) < 200:
            stock_obj["df"] = df
            stock_obj["last_seen"] = tick["datetime"]
            return

        # ---------------------------------
        # UPDATE INDICATORS
        # ---------------------------------
        df = update_indicators(df)

        row = df.iloc[-1]
        i = len(df) - 1

        print(f"[INDICATORS] {stock} RSI={row['RSI']} SSL={row['SSL_Trend']}")

        # ---------------------------------
        # ONLY 09:15 ENTRY
        # ---------------------------------
        if not (row["datetime"].hour == 9 and row["datetime"].minute == 15):
            stock_obj["df"] = df
            stock_obj["last_seen"] = tick["datetime"]
            print(f"[REJECT] {stock} not 09:15")
            return

        # ---------------------------------
        # SMA CONDITIONS
        # ---------------------------------
        trend, signal = check_sma_conditions(df)

        if trend is None:
            stock_obj["df"] = df
            stock_obj["last_seen"] = tick["datetime"]
            print(f"[REJECT] {stock} no trend")
            return

        # ---------------------------------
        # RSI FILTER
        # ---------------------------------
        rsi = row["RSI"]

        if pd.isna(rsi):
            stock_obj["df"] = df
            stock_obj["last_seen"] = tick["datetime"]
            print(f"[REJECT] {stock} RSI NaN")
            return

        if trend == "UP" and rsi <= 70:
            stock_obj["df"] = df
            stock_obj["last_seen"] = tick["datetime"]
            print(f"[REJECT] {stock} RSI weak for CALL")
            return

        if trend == "DOWN" and rsi > 30:
            stock_obj["df"] = df
            stock_obj["last_seen"] = tick["datetime"]
            print(f"[REJECT] {stock} RSI weak for PUT")
            return

        # ---------------------------------
        # CANDLE FILTER
        # ---------------------------------
        valid_candle, candle_info = candle_filter(df)

        if not valid_candle:
            stock_obj["df"] = df
            stock_obj["last_seen"] = tick["datetime"]
            print(f"[REJECT] {stock} candle fail -> {candle_info}")
            return

        # ---------------------------------
        # SSL FILTER
        # ---------------------------------
        entry_open = row["open"]
        entry_close = row["close"]
        ssl_line = row["SSL_Line"]

        ssl_between = (
            min(entry_open, entry_close) <= ssl_line <= max(entry_open, entry_close)
        )

        ssl_distance = abs(entry_open - ssl_line)
        ssl_pct = ssl_distance / entry_open

        if not (ssl_between or ssl_pct <= 0.005):
            stock_obj["df"] = df
            stock_obj["last_seen"] = tick["datetime"]
            print(f"[REJECT] {stock} SSL fail")
            return

        # ---------------------------------
        # TRADE SIGNAL
        # ---------------------------------
        trade_type = "CALL" if trend == "UP" else "PUT"

        trade_signal = {
            "Stock": stock,
            "Date": str(row["datetime"].date()),
            "Status": "TRADED",
            "Type": trade_type,

            "Entry_Time": str(row["datetime"]),
            "Entry_Price": entry_close,

            "RSI": float(rsi) if pd.notna(rsi) else None,
            "Trend": trend,
            "Signal": signal,

            "SSL_Line": float(ssl_line) if pd.notna(ssl_line) else None,
            "SSL_Trend_Entry": row["SSL_Trend"],
            "SSL_Between": bool(ssl_between),
            "SSL_Distance_Pct": float(ssl_pct),

            "Gap_Pct": float(candle_info["gap_pct"]) if pd.notna(candle_info["gap_pct"]) else None,
            "Body_Pct": float(candle_info["body_pct"]) if pd.notna(candle_info["body_pct"]) else None,
            "Upper_Wick": float(candle_info["upper_wick"]) if pd.notna(candle_info["upper_wick"]) else None,
            "Lower_Wick": float(candle_info["lower_wick"]) if pd.notna(candle_info["lower_wick"]) else None,

            "SMA_20": float(row["SMA_20"]) if pd.notna(row["SMA_20"]) else None,
            "SMA_50": float(row["SMA_50"]) if pd.notna(row["SMA_50"]) else None,
            "SMA_100": float(row["SMA_100"]) if pd.notna(row["SMA_100"]) else None,
            "SMA_200": float(row["SMA_200"]) if pd.notna(row["SMA_200"]) else None,
            
            "volume": int(row.get("volume", 0)) if pd.notna(row.get("volume", 0)) else None
        }

        # Emit the signal via WebSocket to the Node.js server
        if sio.connected:
            sio.emit('live_trade_signal_python', trade_signal)
            print(f"[WS] Emitted trade signal for {stock}")

        save_trade(stock, trade_signal)

        # ---------------------------------
        # SAVE STATE
        # ---------------------------------
        stock_obj["df"] = df
        stock_obj["last_seen"] = tick["datetime"]

        print(f"[TRADE] {stock} -> {trade_type}")

    except Exception as e:
        print(f"[PROCESS ERROR] {stock}: {e}")

# =========================================================
# MAIN LOOP
# =========================================================
def main():
    print("[SYSTEM] Starting engine...")

    # Connect to Node.js backend via WebSocket
    try:
        sio.connect(API_BASE_URL)
        print(f"[SYSTEM] Connected to Node.js WebSocket server at {API_BASE_URL}")
    except Exception as e:
        print(f"[SYSTEM] WebSocket connection failed: {e}")

    initialize_all_stocks()
    print(f"[SYSTEM] Loaded {len(stock_store)} stocks")

    while True:
        try:
            print("[LOOP] Fetching latest ticks from API...")

            ticks = fetch_latest_ticks()
            
            print(f"[DEBUG] ticks fetched: {len(ticks)}")
            print(ticks[:2])

            print(f"[LOOP] Received {len(ticks)} ticks")

            if len(ticks) == 0:
                print("[WARNING] No ticks returned")

            for tick in ticks:
                print(f"[PROCESSING] {tick['stock_code']} @ {tick['datetime']}")
                stock = tick.get("stock_code", "UNKNOWN")
                process_stock_tick(stock,tick)

            print("[LOOP] Cycle complete\n")

            time.sleep(1)

            break

        except Exception as e:
            print(f"[MAIN LOOP ERROR] {e}")
            time.sleep(5)

# =========================================================
# RUN
# =========================================================
if __name__ == "__main__":
    main()