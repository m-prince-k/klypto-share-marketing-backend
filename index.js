const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
require('dotenv').config();

const { connectSocket, getIO, startGoldBroadcast } = require('./services/socket');
const { sequelize } = require('./models');
const store = require('./services/marketStore');
const { login } = require('./services/authService');
const { fetchTop200Stocks, syncLivePrices } = require('./services/stockService');
const { startWebSocketConnection, manageWebSocket } = require('./services/webSocketService');
const { startSchedulers, runInitialHistoricalLoad } = require('./services/schedulerService');

const cors = require('cors');



const stockRoutes = require('./routes/stockRoutes');
const optionsRoutes = require('./routes/optionsRoutes');
const futuresRoutes = require('./routes/futuresRoutes');
const authRoutes = require('./routes/authRoutes');
const alertRoutes = require('./routes/alertRoutes');
const indicatorRoutes = require('./routes/indicatorRoutes');
const backtestRoutes = require('./routes/backtestRoutes');
const tradeRoutes = require('./routes/tradeRoutes');
const strategyRoutes = require('./routes/strategyRoutes');

const app = express();
const server = http.createServer(app);


//init socket
connectSocket(server);
const io = getIO();

const alertService = require('./services/alertService');
alertService.init(io);

const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors()); // Enable CORS for all routes
app.use(express.static(__dirname + '/public')); // Serve only public/ folder, not entire project root
// Routes
app.use('/auth', authRoutes);
app.use('/equity', stockRoutes);
app.use('/options', optionsRoutes);
app.use('/futures', futuresRoutes);
app.use('/alerts', alertRoutes);
app.use('/api/indicator', indicatorRoutes);
app.use('/api/backtest', backtestRoutes);
app.use('/api/trades', tradeRoutes);
app.use('/api/strategy', strategyRoutes);


// Socket logic is now managed in services/socket.js


async function bootstrap() {
    try {
        console.log("Synchronizing Database...");
        await sequelize.sync();

        await fetchTop200Stocks();

        const loginData = await login();
        if (!loginData || !loginData.status) {
            console.error("Critical Error: Angel One login failed.");
            return;
        }

        store.loginData = loginData.data;

        server.listen(PORT, () => {
            console.log(`\n=================================================`);
            console.log(`🚀 SERVER RUNNING AT: http://localhost:${PORT}`);
            console.log(`-------------------------------------------------`);
            console.log(`📈 EQUITY:   http://localhost:${PORT}/equity/stocks`);
            console.log(`📊 EQUITY LIVE:      http://localhost:${PORT}/equity/live`);
            console.log(`📉 OPTIONS LIVE:     http://localhost:${PORT}/options/live`);
            console.log(`🔮 FUTURES LIVE:     http://localhost:${PORT}/futures/live`);
            console.log(`=================================================\n`);

            manageWebSocket(loginData, io);
            startSchedulers();

            // Non-blocking: sync LTP after startup so server is never stalled waiting for Angel One
            setTimeout(() => {
                console.log('[Startup] Running background LTP sync (non-blocking)...');
                syncLivePrices().catch(e => console.error('[Startup] LTP sync error:', e.message));
            }, 5000);
        });
    } catch (err) {
        console.error("Bootstrap error:", err);
    }
}

bootstrap();