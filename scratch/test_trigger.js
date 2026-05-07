const io = require('socket.io-client');
const socket = io('http://localhost:7000');

socket.on('connect', () => {
    console.log('Connected to server. Sending test alert...');
    
    const testAlert = {
        symbol: 'RELIANCE',
        token: '2885',
        exchange: 'NSE',
        indicator: 'RSI',
        value: 57.5,
        operator: '>',
        triggeredValue: 58.12,
        timestamp: Date.now()
    };

    socket.emit('ALERT_TRIGGERED', testAlert); // Note: Usually server emits this, but we can simulate the result
    
    console.log('Test alert signal sent. Check your dashboard!');
    setTimeout(() => process.exit(0), 2000);
});
