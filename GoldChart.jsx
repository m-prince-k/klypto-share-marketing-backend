import React, { useEffect, useRef, useState, Fragment } from 'react';
import { CandlestickSeries, createChart, LineSeries, CrosshairMode } from 'lightweight-charts';
import io from 'socket.io-client';

const EVENTS = {
    GET_HISTORICAL_DATA: "getManualHistoricalData",
    GET_INDICATOR_DETAILS: "getIndicatorDetails",
    GET_LIVE_INDICATOR: "getLiveIndicatorUpdate",
    GET_RSI_SCANNER: "getRsiScanner",
    SET_RSI_ALERT: "setRsiAlert",
    GET_ALL_STOCKS: "getAllStocks",
    HISTORICAL_DATA_RESPONSE: "historicalDataResponse",
    INDICATOR_DETAILS_RESPONSE: "indicatorDetailsResponse",
    LIVE_INDICATOR_RESPONSE: "liveIndicatorResponse",
    RSI_SCANNER_RESPONSE: "rsiScannerResponse",
    STOCKS_LIST: "stocks",
    STOCK_UPDATE: "stockUpdate",
    LIVE_TICK: "liveTick",
    ALERT_TRIGGERED: "ALERT_TRIGGERED",
    GOLD_UPDATE: "goldUpdate"
};

const GoldChart = () => {
    const chartContainerRef = useRef();
    const chartRef = useRef();
    const seriesRef = useRef();
    const indicatorSeriesRef = useRef({}); 
    const lastTimeRef = useRef(0);
    const socketRef = useRef(null);

    const [selectedSymbol, setSelectedSymbol] = useState('GOLD'); // Set default to GOLD
    const [selectedInterval, setSelectedInterval] = useState('1m');
    const [livePrice, setLivePrice] = useState(0);
    const [ohlcv, setOhlcv] = useState({ o: 0, h: 0, l: 0, c: 0, v: 0 });
    const [isConnected, setIsConnected] = useState(false);
    const [stocks, setStocks] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
    const [showIndicators, setShowIndicators] = useState(false);
    const [triggeredAlerts, setTriggeredAlerts] = useState([]);
    const [activeIndicators, setActiveIndicators] = useState([]);
    const [alertForm, setAlertForm] = useState({
        indicator: 'RSI',
        operator: '>',
        value: 70,
        interval: 'FIVE_MINUTE',
        triggerType: 'once_per_bar'
    });

    const demoIndicators = [
        { label: "SMA (9)", value: "SMA", type: "overlay", color: "#6366f1" },
        { label: "EMA (9)", value: "EMA", type: "overlay", color: "#ec4899" },
        { label: "VWAP", value: "VWAP", type: "overlay", color: "#f59e0b" },
        { label: "RSI (14)", value: "RSI", type: "oscillator", color: "#8b5cf6" },
        { label: "Supertrend", value: "SUPERTREND", type: "overlay", color: "#fbbf24" },
    ];

    const intervals = [
        { label: "1m", value: "1m", sec: 60, db: "ONE_MINUTE" },
        { label: "5m", value: "5m", sec: 300, db: "FIVE_MINUTE" },
        { label: "15m", value: "15m", sec: 900, db: "FIFTEEN_MINUTE" },
        { label: "1h", value: "1h", sec: 3600, db: "ONE_HOUR" },
        { label: "1d", value: "1d", sec: 86400, db: "ONE_DAY" },
    ];

    const operators = [
        { label: "Greater Than", value: ">" },
        { label: "Less Than", value: "<" },
        { label: "Crosses", value: "crosses" },
        { label: "Crosses Up", value: "crosses_up" },
        { label: "Crosses Down", value: "crosses_down" },
    ];

    useEffect(() => {
        if (!chartContainerRef.current) return;

        setIsLoading(true);

        chartRef.current = createChart(chartContainerRef.current, {
            width: chartContainerRef.current.clientWidth,
            height: 550,
            layout: { background: { color: '#020617' }, textColor: '#94a3b8' },
            grid: { vertLines: { color: 'rgba(30, 41, 59, 0.5)' }, horzLines: { color: 'rgba(30, 41, 59, 0.5)' } },
            crosshair: { mode: CrosshairMode.Normal },
            timeScale: { borderColor: '#1e293b', timeVisible: true },
        });

        seriesRef.current = chartRef.current.addSeries(CandlestickSeries, {
            upColor: '#10b981', downColor: '#ef4444', borderVisible: false,
        });

        const socket = io("http://localhost:7000"); 
        socketRef.current = socket;

        socket.on("connect", () => {
            setIsConnected(true);
            socket.emit(EVENTS.GET_ALL_STOCKS);
        });

        socket.on(EVENTS.ALERT_TRIGGERED, (alertData) => {
            setTriggeredAlerts(prev => [alertData, ...prev].slice(0, 5));
        });

        socket.on(EVENTS.STOCKS_LIST, (data) => setStocks(data));

        // Historical Data Handler
        socket.on(EVENTS.HISTORICAL_DATA_RESPONSE, (payload) => {
            if (payload.success && payload.data?.length > 0) {
                const formattedData = payload.data.map(c => ({
                    time: Number(c.time),
                    open: parseFloat(c.open),
                    high: parseFloat(c.high),
                    low: parseFloat(c.low),
                    close: parseFloat(c.close),
                })).sort((a, b) => a.time - b.time);
                
                seriesRef.current.setData(formattedData);
                const last = formattedData[formattedData.length - 1];
                setLivePrice(last.close);
                setOhlcv({ o: last.open, h: last.high, l: last.low, c: last.close, v: 0 });
                lastTimeRef.current = last.time;
                setIsLoading(false);
            }
        });

        // Live Tick Handler (Equity)
        socket.on(EVENTS.LIVE_TICK, (tick) => {
            if (tick.symbol === selectedSymbol && seriesRef.current) {
                updateChart(tick.data);
            }
        });

        // Gold Update Handler (Commodity)
        socket.on(EVENTS.GOLD_UPDATE, (tick) => {
            if (selectedSymbol === 'GOLD' && seriesRef.current) {
                updateChart(tick.data);
            }
        });

        const updateChart = (data) => {
            const intervalSec = intervals.find(i => i.value === selectedInterval)?.sec || 60;
            const normalizedTime = Math.floor(Number(data.time) / intervalSec) * intervalSec;
            if (normalizedTime < lastTimeRef.current) return;

            const latestTick = {
                time: normalizedTime,
                open: parseFloat(data.open),
                high: parseFloat(data.high),
                low: parseFloat(data.low),
                close: parseFloat(data.close),
            };

            seriesRef.current.update(latestTick);
            setLivePrice(latestTick.close);
            setOhlcv({ o: latestTick.open, h: latestTick.high, l: latestTick.low, c: latestTick.close, v: data.volume || 0 });
            lastTimeRef.current = normalizedTime;
        }

        // Fetch Data
        socket.emit(EVENTS.GET_HISTORICAL_DATA, { 
            symbol: selectedSymbol, 
            interval: selectedInterval, 
            fromDate: "2024-01-01", 
            toDate: new Date().toISOString(),
            exchange: selectedSymbol === "GOLD" ? "MCX" : "NSE" // Use MCX for Gold
        });
        
        return () => {
            socket.disconnect();
            if (chartRef.current) chartRef.current.remove();
        };
    }, [selectedSymbol, selectedInterval]);

    const handleCreateAlert = async () => {
        const stock = stocks.find(s => s.name === selectedSymbol) || { token: "GOLD", segment: "MCX" }; 
        const payload = {
            symbol: selectedSymbol,
            token: stock.token || "GOLD",
            exchange: selectedSymbol === 'GOLD' ? "MCX" : (stock.segment || "NSE"),
            interval: alertForm.interval,
            indicator: alertForm.indicator,
            params: { type: alertForm.indicator, length: 14 },
            operator: alertForm.operator,
            value: parseFloat(alertForm.value),
            triggerType: alertForm.triggerType
        };
        await fetch('http://localhost:7000/alerts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        setIsAlertModalOpen(false);
    };

    return (
        <div className="flex h-screen bg-[#020617] text-slate-200 font-sans overflow-hidden border border-slate-800 relative">
            <div className="position-absolute top-0 end-0 p-4 z-index-3" style={{ marginTop: '80px', maxWidth: '350px' }}>
                {triggeredAlerts.map((alert, idx) => (
                    <div key={idx} className="toast show bg-dark border-primary border-start border-4 mb-3 rounded-4 shadow-lg">
                        <div className="toast-header bg-dark text-white border-0 pb-0">
                            <strong className="me-auto text-primary">{alert.symbol} Alert!</strong>
                            <small className="text-secondary">{new Date(alert.timestamp).toLocaleTimeString()}</small>
                        </div>
                        <div className="toast-body pt-1">
                            <h5 className="mb-0 text-white font-weight-bold">Value: {alert.currentValue}</h5>
                        </div>
                    </div>
                ))}
            </div>

            <aside className="w-72 border-r border-slate-800/50 flex flex-col bg-slate-900/20 backdrop-blur-xl z-20">
                <div className="p-6 border-b border-slate-800/50">
                    <h2 className="text-xl font-black bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent uppercase tracking-tight">Klypto Pro</h2>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {['GOLD', 'RELIANCE', 'TCS', 'HDFCBANK', 'INFY'].map(s => (
                        <div key={s} onClick={() => setSelectedSymbol(s)} className={`p-4 rounded-4 cursor-pointer transition-all ${selectedSymbol === s ? 'bg-primary bg-opacity-25 border border-primary border-opacity-50' : 'hover-bg-slate-800'}`}>
                            <span className="font-weight-bold small">{s}</span>
                        </div>
                    ))}
                    <div className="border-t border-slate-800/50 my-4 pt-4">
                        <h6 className="text-slate-500 text-uppercase small px-2 mb-3 tracking-widest">Market Status</h6>
                        {stocks.map(s => (
                            <div key={s.token} onClick={() => setSelectedSymbol(s.name)} className={`p-3 rounded-4 cursor-pointer transition-all ${selectedSymbol === s.name ? 'bg-slate-800' : ''}`}>
                                <div className="d-flex justify-content-between align-items-center">
                                    <span className="small font-weight-bold">{s.name}</span>
                                    <span className="text-[10px] text-slate-500">{s.segment}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </aside>

            <main className="flex-1 flex flex-col bg-slate-950/20">
                <header className="h-20 border-b border-slate-800/50 d-flex align-items-center justify-content-between px-4 bg-slate-900 bg-opacity-40 backdrop-blur-md z-index-3">
                    <div className="d-flex align-items-center gap-4">
                        <div className="d-flex flex-column">
                            <h1 className="h4 font-weight-black m-0 text-white tracking-tighter">{selectedSymbol}</h1>
                            <div className="h6 text-success font-weight-bold m-0">₹{livePrice.toLocaleString()}</div>
                        </div>
                        <div className="btn-group bg-slate-800 bg-opacity-40 p-1 rounded-4">
                            {intervals.map((int) => (
                                <button key={int.value} onClick={() => setSelectedInterval(int.value)} className={`btn btn-sm px-3 rounded-3 text-uppercase font-weight-black ${selectedInterval === int.value ? 'btn-primary shadow' : 'btn-link text-slate-400 text-decoration-none'}`}>{int.label}</button>
                            ))}
                        </div>
                    </div>
                    <button onClick={() => setIsAlertModalOpen(true)} className="btn btn-primary px-4 rounded-4 text-uppercase font-weight-black small shadow">
                        <i className="bi bi-bell-fill"></i> Create Alert
                    </button>
                </header>

                <div className="flex-1 position-relative">
                    <div ref={chartContainerRef} className="w-full h-full" />
                </div>

                {isAlertModalOpen && (
                    <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)' }}>
                        <div className="modal-dialog modal-dialog-centered">
                            <div className="modal-content border-0 bg-slate-900 text-white rounded-5 shadow-lg p-5">
                                <h3 className="font-weight-black tracking-tighter mb-4">Create Alert for {selectedSymbol}</h3>
                                <div className="d-flex flex-column gap-4">
                                    <input type="number" value={alertForm.value} onChange={(e) => setAlertForm({...alertForm, value: e.target.value})} className="form-control bg-slate-800 border-slate-700 text-white rounded-4 py-3" />
                                    <button onClick={handleCreateAlert} className="btn btn-primary py-4 rounded-4 font-weight-black text-uppercase tracking-widest shadow-lg">Activate Alert</button>
                                    <button onClick={() => setIsAlertModalOpen(false)} className="btn btn-link text-slate-500 text-decoration-none small font-weight-bold text-uppercase">Cancel</button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};

export default GoldChart;
