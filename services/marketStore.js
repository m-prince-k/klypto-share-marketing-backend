// Global mappings and data store
module.exports = {
    stocks: [], // Top 200 + Auto-added stocks for WebSocket
    wsClient: null, // Global WebSocket instance
    symbolToTokenMaster: {}, // All NSE stocks for Historical Data
    tokenToName: {},
    latestMarketData: {},
    nfoMasterData: [], // Store NFO scripts for lookup
    liveCandles: {} // Real-time candle aggregation { [token]: { open, high, low, close, volume, minute } }
};
