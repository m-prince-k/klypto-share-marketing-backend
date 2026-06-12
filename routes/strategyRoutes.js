const express = require('express');
const router  = express.Router();
const { getMarkers, saveTestingCsv, forwardToPredict, evaluatePythonStrategy, getScannerDashboard, runDynamicScanner } = require('../controllers/strategyController');

/**
 * GET /api/strategy/markers
 * Query params:
 *   symbol  - e.g. BOSCHLTD (default: BOSCHLTD)
 *   months  - e.g. 6 (default: 6)
 *   type    - BUY | SELL | ALL (default: ALL)
 */
router.get('/markers', getMarkers);

// POST /api/strategy/save-testing-csv
// Generates testing data and writes a CSV into the shubam folder
router.post('/save-testing-csv', saveTestingCsv);
// Convenience: allow GET for quick browser testing (calls same handler)
router.get('/save-testing-csv', saveTestingCsv);

// POST /api/strategy/predict
// Forwards generated historic_data and tick to an external predict endpoint.
router.post('/predict', forwardToPredict);

// POST /api/strategy/evaluate-python
// Evaluates the Python strategy via the local FastAPI server
router.post('/evaluate-python', evaluatePythonStrategy);

// GET /api/strategy/scanner-dashboard
// Dashboard route for the Multi-Stock Screener
router.get('/scanner-dashboard', getScannerDashboard);

// POST /api/strategy/run-scanner
// Dynamically runs the background scanner based on strategy_code sent from frontend
router.post('/run-scanner', runDynamicScanner);

module.exports = router;
