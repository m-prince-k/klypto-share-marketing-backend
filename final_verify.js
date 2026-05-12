const { DailyOptionData } = require('./models');

async function verify() {
    const data = await DailyOptionData.findAll({ 
        limit: 50, 
        order: [['createdAt', 'DESC']] 
    });
    
    console.log('\n====================================');
    console.log(`📊 TOTAL RECORDS IN DB: ${await DailyOptionData.count()}`);
    console.log('LATEST ENTRIES:');
    data.forEach(r => {
        console.log(`Symbol: ${r.symbol.padEnd(20)} | LTP: ${String(r.ltp).padEnd(8)} | OI: ${String(r.oi).padEnd(10)} | Type: ${r.optionType}`);
    });
    console.log('====================================\n');
    process.exit(0);
}

verify();
