const { getHistoricalCandle } = require('./angelOne');
const store = require('./marketStore');

const fetchGoldHistory = async (interval = "1m", days = 30) => {
    try {
        // Search for Gold Futures contracts in MCX
        const goldContracts = (store.mcxMasterData || []).filter(s => 
            (s.name === 'GOLD' || s.name === 'GOLDM' || s.name === 'GOLDPETAL' || s.name === 'GOLDGUINEA') &&
            s.instrumenttype === 'FUTCOM'
        );

        if (goldContracts.length === 0) return [];

        // Pick nearest active expiry
        const nearestContracts = {};
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (const contract of goldContracts) {
            const expiryDate = new Date(contract.expiry);
            if (expiryDate < today) continue; // Skip expired

            if (!nearestContracts[contract.name]) {
                nearestContracts[contract.name] = contract;
            } else {
                const currentExpiry = new Date(nearestContracts[contract.name].expiry);
                if (expiryDate < currentExpiry) {
                    nearestContracts[contract.name] = contract;
                }
            }
        }

        const now = new Date();
        const fDate = new Date();
        fDate.setDate(now.getDate() - days);

        const fDateStr = fDate.toISOString().split('T')[0] + " 00:00";
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        const tDateStr = now.toISOString().split('T')[0] + ` ${hh}:${mm}`;

        const results = [];
        for (const contract of Object.values(nearestContracts)) {
            try {
                const candles = await getHistoricalCandle({
                    symbol: contract.symbol,
                    interval: interval,
                    fromDate: fDateStr,
                    toDate: tDateStr,
                    exchange: "MCX",
                    symboltoken: contract.token,
                    skipSave: true
                });

                if (candles && candles.length > 0) {
                    const enrichedCandles = candles.map(c => {
                        const istDate = new Date(c.timestamp);
                        istDate.setMinutes(istDate.getMinutes() + 330);
                        return {
                            ...c,
                            timeIST: istDate.toISOString().replace('T', ' ').split('.')[0]
                        };
                    });

                    results.push({
                        name: contract.name,
                        symbol: contract.symbol,
                        token: contract.token,
                        expiry: contract.expiry,
                        data: enrichedCandles
                    });
                }
            } catch (err) {
                console.error(`[CommodityService] Failed for ${contract.symbol}:`, err.message);
            }
        }
        return results;
    } catch (err) {
        console.error("[CommodityService] Error:", err.message);
        return [];
    }
};

module.exports = { fetchGoldHistory };
