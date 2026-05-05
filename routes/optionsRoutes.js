const express = require('express');
const router = express.Router();
const stockController = require('../controllers/stockController');
const historicalController = require('../controllers/historicalController');

router.get('/live', stockController.getLiveOptions);
router.get('/historical', historicalController.getOptionsHistoricalData);
router.get('/chain', stockController.getOptionsChain);
router.get('/historical-chain', stockController.getHistoricalOptionChain);
router.post('/sync-chain-history', stockController.syncOptionsChainHistory);
router.post('/bulk-sync-history', async (req, res) => {
    const { syncAllUnderlyingsHistory, syncAllOptionsHistory } = require('../services/bulkSyncService');
    
    // Start in background
    syncAllUnderlyingsHistory().catch(e => console.error("Underlying sync failed:", e));
    syncAllOptionsHistory().catch(e => console.error("Options sync failed:", e));

    res.json({ success: true, message: "Mega Bulk Sync started in background. It will take many hours." });
});

module.exports = router;
