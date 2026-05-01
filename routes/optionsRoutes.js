const express = require('express');
const router = express.Router();
const stockController = require('../controllers/stockController');
const historicalController = require('../controllers/historicalController');

router.get('/live', stockController.getLiveOptions);
router.get('/historical', historicalController.getOptionsHistoricalData);
router.get('/chain', stockController.getOptionsChain);

module.exports = router;
