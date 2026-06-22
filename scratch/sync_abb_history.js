require('dotenv').config();
const { OptionChain } = require('../models');
const { login } = require('../services/authService');
const store = require('../services/marketStore');
const { fetchTop200Stocks } = require('../services/stockService');
const { getHistoricalCandle } = require('../services/angelOne');
const { Op } = require('sequelize');

async function syncABB3MonthsBack() {
    console.log("Starting script...");
    
    // Initialize required services
    await fetchTop200Stocks();
    await login();

    const sym = "ABB";
    console.log("Checking DB for earliest entry for ABB...");
    const earliestEntry = await OptionChain.findOne({
        where: { underlying: sym },
        order: [['timestamp', 'ASC']]
    });

    if (!earliestEntry) {
        console.log("No existing data found for ABB.");
        return;
    }

    const toDate = new Date(earliestEntry.timestamp);
    console.log(`Earliest entry is: ${toDate.toISOString()}`);
    
    // We want 3 months backwards from the earliest entry
    const fromDate = new Date(toDate);
    fromDate.setMonth(toDate.getMonth() - 3);
    
    console.log(`Target Range to fetch: ${fromDate.toISOString()} TO ${toDate.toISOString()}`);

    // Get strikes and expiries
    const allOpts = store.nfoMasterData.filter(o => o.name === sym && (o.instrumenttype === "OPTSTK" || o.instrumenttype === "OPTIDX"));
    if (allOpts.length === 0) {
        console.log("No NFO data found for ABB in master");
        return;
    }

    // Since we don't have a reliable LTP from back then easily, we can just fetch data for ALL strikes available? 
    // Or just a wide range around the current LTP.
    const ltp = 8300; // Hardcoded approximate LTP of ABB to narrow down strikes if needed.
    
    const uniqueStrikes = [...new Set(allOpts.map(o => parseFloat(o.strike) / 100))].sort((a, b) => a - b);
    
    // Instead of ATM calculation from old dates, let's just use the current ATM and get +/- 10 strikes to be safe.
    let atmStrike = uniqueStrikes.reduce((prev, curr) => Math.abs(curr - ltp) < Math.abs(prev - ltp) ? curr : prev);
    
    // Or wait, just get the strikes that already exist in OptionChain for ABB
    const existingStrikes = await OptionChain.findAll({
        attributes: ['strike'],
        where: { underlying: sym },
        group: ['strike']
    });
    const strikesToFetch = existingStrikes.map(s => s.strike);
    console.log(`Will fetch for ${strikesToFetch.length} strikes that exist in DB.`);

    const allExpiries = [...new Set(allOpts.map(o => o.expiry))].sort((a, b) => new Date(a) - new Date(b));

    for (const targetExpiry of allExpiries) {
        console.log(`Processing Expiry: ${targetExpiry} for ${sym}`);
        for (const strike of strikesToFetch) {
            for (const type of ['CE', 'PE']) {
                const opt = allOpts.find(o => 
                    parseFloat(o.strike) / 100 === strike && 
                    o.symbol.endsWith(type) && 
                    o.expiry === targetExpiry
                );

                if (!opt) continue;

                // Chunking by 30 days
                for (let i = 0; i < 3; i++) {
                    const chunkToDate = new Date(toDate);
                    chunkToDate.setDate(toDate.getDate() - (i * 30));
                    const chunkFromDate = new Date(toDate);
                    chunkFromDate.setDate(toDate.getDate() - ((i + 1) * 30));

                    const fDateStr = chunkFromDate.toISOString().split('T')[0] + " 09:15";
                    const tDateStr = chunkToDate.toISOString().split('T')[0] + " 15:30";

                    console.log(`Fetching ${opt.symbol} (${opt.token}) from ${fDateStr} to ${tDateStr}...`);

                    try {
                        const candles = await getHistoricalCandle({
                            symbol: opt.symbol,
                            interval: "5m",
                            fromDate: fDateStr,
                            toDate: tDateStr,
                            exchange: opt.exch_seg,
                            symboltoken: opt.token
                        });

                        if (candles && candles.length > 0) {
                            const dbData = candles.map(c => ({
                                underlying: sym,
                                symbol: opt.symbol,
                                token: opt.token,
                                exchange: opt.exch_seg,
                                interval: "5m",
                                timestamp: c.timestamp,
                                strike: strike,
                                expiry: opt.expiry,
                                optionType: type,
                                open: c.open,
                                high: c.high,
                                low: c.low,
                                close: c.close,
                                volume: c.volume
                            }));

                            await OptionChain.bulkCreate(dbData, { ignoreDuplicates: true });
                            console.log(`Saved ${dbData.length} candles for ${opt.symbol}`);
                        }
                    } catch (e) {
                        console.error(`Error fetching for ${opt.symbol}: ${e.message}`);
                    }
                    
                    await new Promise(r => setTimeout(r, 1000));
                }
            }
        }
    }
    console.log("Done");
}

syncABB3MonthsBack().catch(console.error).finally(() => process.exit(0));
