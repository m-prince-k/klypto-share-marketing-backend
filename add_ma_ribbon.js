const { Indicator } = require('./models');

async function addMARibbon() {
    try {
        const maRibbon = await Indicator.findOne({ where: { slug: 'ma_ribbon' } });
        if (!maRibbon) {
            await Indicator.create({
                label: 'MA Ribbon',
                slug: 'ma_ribbon',
                value: 1, // default value
                config: {
                    type: "MA_RIBBON",
                    ma1: { type: "EMA", source: "close", length: 20 },
                    ma2: { type: "SMA", source: "hlc3", length: 50 },
                    ma3: { type: "WMA", source: "close", length: 100 },
                    ma4: { type: "VWMA", source: "close", length: 200 }
                }
            });
            console.log("MA Ribbon successfully added to DB.");
        } else {
            console.log("MA Ribbon already exists in DB.");
        }
    } catch (error) {
        console.error("Error adding MA Ribbon:", error);
    }
}

addMARibbon();
