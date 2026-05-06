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

const app = express();
const server = http.createServer(app);


//init socket
connectSocket(server);
const io = getIO();

const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

app.use(cors()); // Enable CORS for all routes
// Routes
app.use('/auth', authRoutes);
app.use('/equity', stockRoutes);
app.use('/options', optionsRoutes);
app.use('/futures', futuresRoutes);

// Socket.io Connection
io.on("connection", (socket) => {
    console.log("Frontend client connected via Socket.io");

    // Helper to get formatted stock list
    const getFormattedStocks = () => {
        return store.stocks.map(s => {
            const key = `${s.name}:${s.segment}`;
            const liveData = store.latestMarketData[key] || {};
            const ltp = parseFloat(liveData.last_traded_price || 0);
            const close = parseFloat(liveData.close_price || 0);
            const rawChange = ltp - close;
            const changeStr = close > 0 ? (rawChange > 0 ? "+" : "") + rawChange.toFixed(2) : "0.00";
            const pChange = close > 0 ? ((rawChange / close) * 100).toFixed(2) : "0.00";

            return {
                ...s,
                ltp: liveData.last_traded_price || "0.00",
                change: changeStr,
                percent_change: pChange,
                sentiment: liveData.sentiment || "neutral"
            };
        });
    };


    socket.emit("msg", "this is klypto trading view");
   
    // Emit initial data
    socket.emit("marketSnapshot", Object.values(store.latestMarketData));
    socket.emit("stocks", getFormattedStocks());

    // Allow manual refresh request
    socket.on("getAllStocks", () => {
        socket.emit("stocks", getFormattedStocks());
    });
});

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

            const { startGoldBroadcast } = require('./services/socket');

            startWebSocketConnection(loginData, io);
            startSchedulers();
            runInitialHistoricalLoad();
            startGoldBroadcast();
        });
    } catch (err) {
        console.error("Bootstrap error:", err);
    }
}

bootstrap();