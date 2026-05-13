const express = require('express');
const router = express.Router();
const stockController = require('../controllers/stockController');
const historicalController = require('../controllers/historicalController');

router.get('/live', stockController.getLiveOptions);
router.get('/historical', historicalController.getOptionsHistoricalData);
router.get('/chain', stockController.getOptionsChain);
router.get('/trending', stockController.getTrendingOptions);
router.get('/historical-chain', stockController.getHistoricalOptionChain);
router.post('/sync-chain-history', stockController.syncOptionsChainHistory);
router.post('/sync-priority-history', async (req, res) => {
    const { syncPriorityOptionsHistory } = require('../services/optionSyncService');
    syncPriorityOptionsHistory().catch(e => console.error("Priority Options Sync failed:", e));
    res.json({ success: true, message: "Priority Options Sync (20 symbols, 3 months, 5m) started in background." });
});

router.post('/bulk-sync-history', async (req, res) => {
    const { syncAllUnderlyingsHistory, syncAllOptionsHistory } = require('../services/bulkSyncService');
    syncAllUnderlyingsHistory().catch(e => console.error("Underlying sync failed:", e));
    syncAllOptionsHistory().catch(e => console.error("Options sync failed:", e));
    res.json({ success: true, message: "Mega Bulk Sync started in background. It will take many hours." });
});

router.post('/snapshot', async (req, res) => {
    const { saveDailySnapshot } = require('../services/optionChainService');
    const store = require('../services/marketStore');
    const stockNames = store.stocks.map(s => s.name);
    const indices = ["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "SENSEX"];
    const allSymbols = [...new Set([...indices, ...stockNames])];
    
    saveDailySnapshot(allSymbols).catch(e => console.error("Manual Snapshot failed:", e));
    res.json({ success: true, message: "Manual Option Chain Snapshot started for all symbols." });
});

module.exports = router;
