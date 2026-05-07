const store = require("./marketStore");
const { indicatorEngine } = require("../helper");
const { Candle } = require("../models");
const EVENTS = require("../constants/socketEvents");

class AlertService {
    constructor() {
        this.activeAlerts = [];
        this.io = null;
        this.candleBuffer = {}; // { [token:interval]: candles[] }
        this.lastStates = {}; // { [alertId]: { value: lastValue, timestamp: lastTickTs } }
    }

    init(io) {
        this.io = io;
        console.log("[AlertService] Initialized.");
    }

    async addAlert(alert) {
        /**
         * alert: { 
         *   id, symbol, token, exchange, interval, 
         *   indicator, params: { type, length, sourceKey, etc }, 
         *   operator, value, triggerType: 'once' | 'once_per_bar' | 'every_tick'
         * }
         */
        const key = `${alert.token}:${alert.interval}`;
        const alertId = alert.id || `${alert.token}_${Date.now()}`;
        
        const newAlert = { ...alert, id: alertId, triggered: false, lastTriggerBarTime: null };
        this.activeAlerts.push(newAlert);
        
        // Pre-fetch candles if not in buffer (Need ~200 for most indicators to stabilize)
        if (!this.candleBuffer[key]) {
            await this.refreshBuffer(alert.symbol, alert.token, alert.exchange, alert.interval);
        }
        
        console.log(`[AlertService] Alert added: ${alert.symbol} ${alert.indicator} ${alert.operator} ${alert.value} (${alert.interval})`);
        return alertId;
    }

    removeAlert(alertId) {
        this.activeAlerts = this.activeAlerts.filter(a => a.id !== alertId);
        delete this.lastStates[alertId];
    }

    async refreshBuffer(symbol, token, exchange, interval) {
        const key = `${token}:${interval}`;
        try {
            const { getCandlesWithCache } = require("./dbService");
            
            // Need ~200 candles for stability, we fetch 250
            const result = await getCandlesWithCache(symbol, token, exchange, interval);
            const candles = result.data.slice(-250); 
            
            this.candleBuffer[key] = candles.map(c => ({
                time: Math.floor(new Date(c.timestamp).getTime() / 1000),
                open: Number(c.open),
                high: Number(c.high),
                low: Number(c.low),
                close: Number(c.close),
            }));

            console.log(`[AlertService] Buffer refreshed for ${symbol} (${candles.length} bars)`);
        } catch (err) {
            console.error(`[AlertService] Buffer refresh failed for ${symbol}:`, err.message);
        }
    }

    async checkAlerts(tick) {
        const cleanToken = tick.token ? tick.token.replace(/\"/g, "").trim() : null;
        if (!cleanToken) return;

        const relevantAlerts = this.activeAlerts.filter(a => a.token === cleanToken);
        if (relevantAlerts.length === 0) return;

        for (const alert of relevantAlerts) {
            const key = `${alert.token}:${alert.interval}`;
            let historicalCandles = this.candleBuffer[key] || [];

            // Get live candle from store (usually 1-minute)
            const liveCandleOneMin = store.liveCandles[cleanToken];
            if (!liveCandleOneMin) continue;

            // Handle Interval Aggregation (Simple approach: use latest LTP as the 'forming' candle for the alert's interval)
            // TradingView real-time alerts use the current forming bar.
            // For a 5m bar, the time would be floor(min / 5) * 5.
            const intervalMs = this.getIntervalMs(alert.interval);
            const currentBarTime = Math.floor(Date.now() / intervalMs) * intervalMs;
            
            // Construct the latest "forming" candle
            const latestCandle = {
                time: Math.floor(currentBarTime / 1000),
                open: liveCandleOneMin.open, // Approximation: use current 1m open as bar open if it's the start
                high: liveCandleOneMin.high,
                low: liveCandleOneMin.low,
                close: Number(tick.last_traded_price),
                volume: liveCandleOneMin.volume
            };

            // If the historical candles already contain this bar time, replace it. Otherwise append.
            let combinedCandles = [...historicalCandles];
            const lastHist = combinedCandles[combinedCandles.length - 1];
            
            if (lastHist && lastHist.time === latestCandle.time) {
                combinedCandles[combinedCandles.length - 1] = latestCandle;
            } else if (lastHist && latestCandle.time > lastHist.time) {
                // New bar started since last refresh
                combinedCandles.push(latestCandle);
                // Optionally prune historical buffer to keep it at 250
                if (combinedCandles.length > 300) combinedCandles.shift();
            } else {
                combinedCandles.push(latestCandle);
            }

            try {
                // Calculate Indicator using helper's engine
                const indicatorData = await indicatorEngine(combinedCandles, alert.params || { type: alert.indicator });
                if (!indicatorData || indicatorData.length === 0) continue;

                const latestResult = indicatorData[indicatorData.length - 1];
                // Extract value based on indicator structure (some return {rsi: ...}, some {ema: ...})
                const currentValue = this.extractValue(latestResult, alert.indicator);
                
                if (currentValue === null || currentValue === undefined) continue;

                // Previous value for "Cross" detection
                const prevState = this.lastStates[alert.id] || { value: currentValue, time: latestCandle.time };
                const prevValue = prevState.value;

                // Check Condition
                let triggered = false;
                const threshold = Number(alert.value);

                switch (alert.operator) {
                    case ">": triggered = currentValue > threshold; break;
                    case "<": triggered = currentValue < threshold; break;
                    case ">=": triggered = currentValue >= threshold; break;
                    case "<=": triggered = currentValue <= threshold; break;
                    case "crosses": 
                        triggered = (prevValue <= threshold && currentValue > threshold) || 
                                    (prevValue >= threshold && currentValue < threshold); 
                        break;
                    case "crosses_up": 
                        triggered = (prevValue <= threshold && currentValue > threshold); 
                        break;
                    case "crosses_down": 
                        triggered = (prevValue >= threshold && currentValue < threshold); 
                        break;
                }

                if (triggered) {
                    this.processTrigger(alert, currentValue, latestCandle.time);
                }

                // Update state
                this.lastStates[alert.id] = { value: currentValue, time: latestCandle.time };

            } catch (err) {
                console.error(`[AlertService] Calculation Error for ${alert.symbol}:`, err.message);
            }
        }
    }

    processTrigger(alert, currentValue, barTime) {
        // TradingView Trigger Types:
        // 'once': trigger once and disable
        // 'once_per_bar': trigger once per candle
        // 'once_per_bar_close': only on close (not handled here as we are tick-based)
        // 'every_tick': trigger on every tick condition is met

        const type = alert.triggerType || 'once_per_bar';

        if (type === 'once' && alert.triggered) return;
        if (type === 'once_per_bar' && alert.lastTriggerBarTime === barTime) return;

        console.log(`[ALERT TRIGGERED] ${alert.symbol} ${alert.indicator} ${alert.operator} ${alert.value} | Current: ${currentValue.toFixed(2)}`);
        
        alert.triggered = true;
        alert.lastTriggerBarTime = barTime;

        if (this.io) {
            this.io.emit("ALERT_TRIGGERED", {
                alertId: alert.id,
                symbol: alert.symbol,
                token: alert.token,
                indicator: alert.indicator,
                operator: alert.operator,
                threshold: alert.value,
                currentValue: currentValue.toFixed(2),
                interval: alert.interval,
                timestamp: new Date().toISOString()
            });
        }

        if (type === 'once') {
            // Disable or remove? Let's just keep it as 'triggered'
        }
    }

    extractValue(result, indicatorName) {
        // Helper to get the primary value from indicator output
        // rsi-indicator returns { rsi: ... }
        // EMA returns { ema: ... }
        // indicatorEngine might return simple numbers or objects
        if (typeof result === 'number') return result;
        if (typeof result === 'object') {
            const keys = Object.keys(result);
            if (keys.includes(indicatorName.toLowerCase())) return result[indicatorName.toLowerCase()];
            if (keys.includes('value')) return result.value;
            // Fallback: first non-time key
            const valKey = keys.find(k => k !== 'time' && k !== 'status');
            return result[valKey];
        }
        return null;
    }

    getIntervalMs(interval) {
        const map = {
            "ONE_MINUTE": 60000,
            "THREE_MINUTE": 180000,
            "FIVE_MINUTE": 300000,
            "TEN_MINUTE": 600000,
            "FIFTEEN_MINUTE": 900000,
            "THIRTY_MINUTE": 1800000,
            "ONE_HOUR": 3600000,
            "ONE_DAY": 86400000
        };
        return map[interval] || 60000;
    }

    async loadAlerts() {
        try {
            const { Alert } = require("../models");
            const alerts = await Alert.findAll({ where: { active: true } });
            console.log(`[AlertService] Loading ${alerts.length} active alerts from DB...`);
            for (const alert of alerts) {
                await this.addAlert(alert.toJSON());
            }
        } catch (err) {
            console.error("[AlertService] Error loading alerts from DB:", err.message);
        }
    }
}

module.exports = new AlertService();
