const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
require('dotenv').config();

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

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
    cors: { origin: "*" } 
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

app.use(cors());
// Routes
app.use('/equity', stockRoutes);
app.use('/options', optionsRoutes);
app.use('/futures', futuresRoutes);

// Socket.io Connection
io.on("connection", (socket) => {
    console.log("Frontend client connected via Socket.io");
    socket.emit("marketSnapshot", Object.values(store.latestMarketData));
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
            
            startWebSocketConnection(loginData, io);
            startSchedulers();
            runInitialHistoricalLoad();
        });
    } catch (err) {
        console.error("Bootstrap error:", err);
    }
}

bootstrap();