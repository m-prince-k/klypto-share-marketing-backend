// Global mappings and data store
module.exports = {
    stocks: [], // Top 200 + Auto-added stocks for WebSocket
    indices: [], // Market indices (NIFTY, BANKNIFTY etc.)
    wsClient: null, // Global WebSocket instance
    symbolToTokenMaster: {}, // All NSE stocks for Historical Data
    tokenToName: {},
    tokenToExchange: {}, // Map token to exchange (NSE, BSE, NFO) 
    latestMarketData: {},
    nfoMasterData: [], // Store NFO scripts for lookup
    mcxMasterData: [], // Store MCX scripts for lookup
    bseMasterData: [], // Store BSE scripts for lookup
    liveCandles: {}, // Real-time candle aggregation { [token]: { open, high, low, close, volume, minute } }
    alerts: [], // Real-time indicator alerts
    indicatorSubscriptions: new Map(), // Map<socketId, { symbol, type, interval, exchange }>
    subscribedTokens: new Set(), // Track all Angel One WS subscribed tokens to prevent duplicate subscriptions
    subscriptions: { nse: false, mcx: false }, // Track which market segments are subscribed
    lastTickTime: 0 // Timestamp of last received tick (for dead connection detection)
};
