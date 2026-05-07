const express = require('express');
const router = express.Router();
const alertController = require('../controllers/alertController');

router.post('/', alertController.createAlert);
router.get('/', alertController.getAlerts);
router.delete('/:id', alertController.deleteAlert);
router.patch('/:id/toggle', alertController.toggleAlert);

module.exports = router;
