const axios = require('axios');
const db = require('./models');

(async () => {
    const symbol = 'ABB';
    const docs = await db.sequelize.query(
        "SELECT * FROM historical_candles WHERE symbol = 'ABB' AND datetime >= '2024-10-01 00:00:00' ORDER BY datetime DESC LIMIT 100", 
        { type: db.sequelize.QueryTypes.SELECT }
    );
    let hist = docs.reverse().map(d => {
        const cTs = new Date(d.datetime);
        const istTime = new Date(cTs.getTime() + (330 * 60 * 1000));
        return {
            datetime: istTime.toISOString().replace('T', ' ').substring(0, 19),
            open: parseFloat(d.open), high: parseFloat(d.high), low: parseFloat(d.low), close: parseFloat(d.close), volume: parseInt(d.volume)
        };
    });
    
    // Minimal strategy code returning a BUY
    const strategy_code = `
markers.append({"time": str(df.index[1]), "position": "aboveBar", "text": "BUY", "tradetype": "CALL", "signal": "BUY", "entry_time": "09:15", "exit_time": "10:15"})
    `;
    
    try {
        const res = await axios.post('http://127.0.0.1:8000/api/evaluate-strategy', { 
            symbol, 
            interval: 'FIVE_MINUTE', 
            strategy_code, 
            historical_data: hist 
        });
        const data = res.data;
        const signals = data.filter(d => (d.text || '').toUpperCase() === 'BUY' || (d.signal || '').toUpperCase() === 'BUY');
        console.log('Signals found:', signals.length);
        if(signals.length > 0) {
            console.log(signals[0]);
        }
    } catch(e) {
        console.error(e.response ? e.response.data : e.message);
    }
    process.exit(0);
})();
