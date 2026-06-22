const express = require('express');
const router = express.Router();
const { getMarkers, forwardToPredict, evaluatePythonStrategy, getScannerDashboard, runDynamicScanner } = require('../controllers/strategyController');

/**
 * GET /api/strategy/markers
 * Query params:
 *   symbol  - e.g. BOSCHLTD (default: BOSCHLTD)
 *   months  - e.g. 6 (default: 6)
 *   type    - BUY | SELL | ALL (default: ALL)
 */
router.get('/markers', getMarkers);



// GET /api/strategy/internal-sync
// Internal API to trigger background generation of BOSLIM cache (called by PM2 Cron)
const { generateInternalBoslimCache } = require('../controllers/strategyController');
router.get('/internal-sync', generateInternalBoslimCache);

// POST /api/strategy/predict
// Forwards generated historic_data and tick to an external predict endpoint.
router.all('/predict', forwardToPredict);

// POST /api/strategy/evaluate-python
// Evaluates the Python strategy via the local FastAPI server
router.post('/evaluate-python', evaluatePythonStrategy);

const authMiddleware = require('../middleware/authMiddleware');

// GET /api/strategy/scanner-dashboard
// Dashboard route for the Multi-Stock Screener
router.get('/scanner-dashboard', authMiddleware, getScannerDashboard);

// POST /api/strategy/run-scanner
// Dynamically runs the background scanner based on strategy_code sent from frontend
router.post('/run-scanner', authMiddleware, runDynamicScanner);




//shubam AI BUY/SELL LOGIN ENTPROINT CONFIGURE



module.exports = router;