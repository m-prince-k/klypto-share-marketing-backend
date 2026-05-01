const express = require('express');
const router = express.Router();
const stockController = require('../controllers/stockController');
const historicalController = require('../controllers/historicalController');

router.get('/live', stockController.getLiveFutures);
router.get('/historical', historicalController.getFuturesHistoricalData);
// router.post('/sync-continuous', historicalController.syncContinuousFutures);
// router.get('/sync-all', historicalController.syncAllFutures);

module.exports = router;
