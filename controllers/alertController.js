const { Alert } = require('../models');
const alertService = require('../services/alertService');

const createAlert = async (req, res) => {
    try {
        const { symbol, token, exchange, interval, indicator, params, operator, value, triggerType } = req.body;

        const alert = await Alert.create({
            symbol,
            token,
            exchange,
            interval,
            indicator,
            params,
            operator,
            value,
            triggerType,
            active: true
        });

        // Add to live service
        alertService.addAlert(alert.toJSON());

        res.status(201).json({
            success: true,
            message: "Alert created successfully",
            data: alert
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

const getAlerts = async (req, res) => {
    try {
        const alerts = await Alert.findAll({ order: [['createdAt', 'DESC']] });
        res.json({ success: true, data: alerts });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

const deleteAlert = async (req, res) => {
    try {
        const { id } = req.params;
        await Alert.destroy({ where: { id } });
        alertService.removeAlert(id);
        res.json({ success: true, message: "Alert deleted" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

const toggleAlert = async (req, res) => {
    try {
        const { id } = req.params;
        const alert = await Alert.findByPk(id);
        if (!alert) return res.status(404).json({ success: false, message: "Alert not found" });

        alert.active = !alert.active;
        await alert.save();

        if (alert.active) {
            alertService.addAlert(alert.toJSON());
        } else {
            alertService.removeAlert(id);
        }

        res.json({ success: true, data: alert });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

module.exports = {
    createAlert,
    getAlerts,
    deleteAlert,
    toggleAlert
};
