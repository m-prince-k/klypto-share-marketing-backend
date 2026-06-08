/**
 * socketEvents.js
 * Centralized registry for all Socket.io event names to ensure consistency 
 * across backend and frontend.
 */

module.exports = {
    // --- INPUT EVENTS (Client to Server) ---
    GET_HISTORICAL_DATA: "getManualHistoricalData", // Fetch historical candles
    GET_INDICATOR_DETAILS: "getIndicatorDetails",   // Fetch full indicator series
    GET_LIVE_INDICATOR: "getLiveIndicatorUpdate",   // Fetch single tick indicator value
    GET_RSI_SCANNER: "getRsiScanner",               // Trigger manual RSI scan
    SET_RSI_ALERT: "setRsiAlert",                   // Set background monitoring threshold
    GET_ALL_STOCKS: "getAllStocks",                 // Request initial stock list
    SUBSCRIBE_OPTION_CHAIN: "subscribeOptionChain", // Subscribe to live option chain updates
    UNSUBSCRIBE_OPTION_CHAIN: "unsubscribeOptionChain",
    GET_MASTER_WATCHLIST: "getMasterWatchlist",     // Request master watchlist data
    UPDATE_INDICATOR: "updateIndicator",            // Request dynamic indicator values
    GET_BACKTEST_DASHBOARD: "getBacktestDashboard", // Request backtest metrics
    
    // --- OUTPUT EVENTS (Server to Client) ---
    BACKTEST_DASHBOARD_RESPONSE: "backtestDashboardResponse",
    UPDATE_INDICATOR_RESPONSE: "updateIndicatorResponse",
    MASTER_WATCHLIST_RESPONSE: "masterWatchlistResponse",
    HISTORICAL_DATA_RESPONSE: "historicalDataResponse",
    HISTORICAL_DATA_ERROR: "historicalDataError",
    
    INDICATOR_DETAILS_RESPONSE: "indicatorDetailsResponse",
    INDICATOR_DETAILS_ERROR: "indicatorDetailsError",
    
    LIVE_INDICATOR_RESPONSE: "liveIndicatorResponse",
    
    RSI_SCANNER_RESPONSE: "rsiScannerResponse",
    RSI_SCANNER_ERROR: "rsiScannerError",
    
    STOCKS_LIST: "stocks",
    STOCK_UPDATE: "stockUpdate",
    LIVE_TICK: "liveTick",
    
    GOLD_UPDATE: "goldUpdate",
    ALERT_TRIGGERED: "ALERT_TRIGGERED",
    SYNC_STATUS: "syncStatus",
    OPTION_CHAIN_UPDATE: "optionChainUpdate",       // Real-time option chain data
    OPTION_CHAIN_ERROR: "optionChainError"
};
