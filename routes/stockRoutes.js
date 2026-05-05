const express = require('express');
const router = express.Router();
const stockController = require('../controllers/stockController');
const historicalController = require('../controllers/historicalController');
const angelAuthMiddleware = require('../middleware/angelAuthMiddleware');
const { verifyToken } = require('../middleware/verifyToken');

router.get('/stocks', stockController.getStocks);
router.get('/indices', stockController.getIndices);
router.get('/live', stockController.getLiveEquity);
router.get('/sync-live', stockController.syncLiveEquityToDB); //means live abhi ki jaankaari milegi 
router.get('/sync-data', stockController.syncDynamicCandleData);// means pichle 24 hour ki poori jaankaari history of previous 24 hours 
router.get('/historical', historicalController.getHistoricalData);

router.get('/historical-v2', historicalController.getManualHistoricalData);


// ---------------------------indicator routes---------------------------
router.post("/indicatorDetails", stockController.indicatorDetails);
router.post("/updateIndicator", stockController.updateIndicator);

router.post("/getTimeframes", stockController.getTimeFrames);
router.post("/getIndicators", stockController.getIndicators);


router.post("/dispatchOrder", verifyToken, angelAuthMiddleware, stockController.orderDispatch); // New route for order dispatching  
router.get("/orders", verifyToken, stockController.fetchOrders); // Fetch all orders for a user

module.exports = router;