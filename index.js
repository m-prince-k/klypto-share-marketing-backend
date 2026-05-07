const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
require('dotenv').config();

const { connectSocket, getIO } = require('./services/socket');
const { sequelize } = require('./models');
const store = require('./services/marketStore');
const { login } = require('./services/authService');
const { fetchTop200Stocks } = require('./services/stockService');
const { startWebSocketConnection } = require('./services/webSocketService');
const { startSchedulers, runInitialHistoricalLoad } = require('./services/schedulerService');

const cors = require('cors');
const stockRoutes = require('./routes/stockRoutes');
const optionsRoutes = require('./routes/optionsRoutes');
const futuresRoutes = require('./routes/futuresRoutes');
const authRoutes = require('./routes/authRoutes');
const alertRoutes = require('./routes/alertRoutes');

const app = express();
const server = http.createServer(app);


//init socket
connectSocket(server);
const io = getIO();

const alertService = require('./services/alertService');
alertService.init(io);

const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

app.use(cors()); // Enable CORS for all routes
// Routes
app.use('/auth', authRoutes);
app.use('/equity', stockRoutes);
app.use('/options', optionsRoutes);
app.use('/futures', futuresRoutes);
app.use('/alerts', alertRoutes);


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

        server.listen(PORT, () => {
            console.log(`\n=================================================`);
            console.log(`🚀 SERVER RUNNING AT: http://localhost:${PORT}`);
            console.log(`-------------------------------------------------`);
            console.log(`📈 EQUITY:   http://localhost:${PORT}/equity/stocks`);
            console.log(`📊 EQUITY LIVE:      http://localhost:${PORT}/equity/live`);
            console.log(`📉 OPTIONS LIVE:     http://localhost:${PORT}/options/live`);
            console.log(`🔮 FUTURES LIVE:     http://localhost:${PORT}/futures/live`);
            console.log(`=================================================\n`);

            startWebSocketConnection(loginData, io);
            alertService.loadAlerts();
            startSchedulers();
            runInitialHistoricalLoad();
        });
    } catch (err) {
        console.error("Bootstrap error:", err);
    }
}

bootstrap();