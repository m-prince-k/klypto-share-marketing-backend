const express = require('express');
const router  = express.Router();
const { getMarkers } = require('../controllers/strategyController');

/**
 * GET /api/strategy/markers
 * Query params:
 *   symbol  - e.g. BOSCHLTD (default: BOSCHLTD)
 *   months  - e.g. 6 (default: 6)
 *   type    - BUY | SELL | ALL (default: ALL)
 */
router.get('/markers', getMarkers);

module.exports = router;
