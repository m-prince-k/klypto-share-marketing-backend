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

const TOP_STOCKS = [
    { name: 'TCS', token: '11536', segment: 'NSE' },
    { name: 'RELIANCE', token: '2885', segment: 'NSE' },
    { name: 'HDFCBANK', token: '1333', segment: 'NSE' },
    { name: 'ICICIBANK', token: '4963', segment: 'NSE' },
    { name: 'INFOSYS', token: '1594', segment: 'NSE' },
    { name: 'SBIN', token: '3045', segment: 'NSE' },
    { name: 'BHARTIARTL', token: '10604', segment: 'NSE' },
    { name: 'HINDUNILVR', token: '1394', segment: 'NSE' },
    { name: 'ITC', token: '1660', segment: 'NSE' },
    { name: 'KOTAKBANK', token: '1922', segment: 'NSE' },
];

const GoldChart = () => {
    const chartContainerRef = useRef();
    const chartRef = useRef();
    const seriesRef = useRef();
    const rsiSeriesRef = useRef();
    const allCandlesRef = useRef([]);
    const lastBarRef = useRef(null);
    const socketRef = useRef(null);

    const [selectedSymbol, setSelectedSymbol] = useState('TCS');
    const [selectedInterval, setSelectedInterval] = useState('1m');
    const [livePrice, setLivePrice] = useState(0);
    const [ohlcv, setOhlcv] = useState({ o: 0, h: 0, l: 0, c: 0, v: 0 });
    const [isConnected, setIsConnected] = useState(false);
    const [stocks, setStocks] = useState(TOP_STOCKS);
    const [isLoading, setIsLoading] = useState(true);
    const [triggeredAlerts, setTriggeredAlerts] = useState([]);
    const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
    const [alertForm, setAlertForm] = useState({
        indicator: 'RSI',
        operator: '>',
        value: 70,
        interval: 'ONE_MINUTE',
        triggerType: 'every_tick'
    });

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

    // Wilder's RSI Calculation Logic
    const calculateRSI = (candles, period = 14) => {
        if (candles.length <= period) return [];
        const result = [];
        let avgGain = 0;
        let avgLoss = 0;

        for (let i = 1; i <= period; i++) {
            const change = candles[i].close - candles[i - 1].close;
            if (change > 0) avgGain += change;
            else avgLoss -= change;
        }
        avgGain /= period;
        avgLoss /= period;

        result.push({ time: candles[period].time, value: 100 - (100 / (1 + (avgGain / (avgLoss || 1)))) });

        for (let i = period + 1; i < candles.length; i++) {
            const change = candles[i].close - candles[i - 1].close;
            const gain = change > 0 ? change : 0;
            const loss = change < 0 ? -change : 0;
            avgGain = (avgGain * (period - 1) + gain) / period;
            avgLoss = (avgLoss * (period - 1) + loss) / period;
            const rs = avgGain / (avgLoss || 1);
            result.push({ time: candles[i].time, value: 100 - (100 / (1 + rs)) });
        }
        return result;
    };

    useEffect(() => {
        if (!chartContainerRef.current) return;

        setIsLoading(true);
        lastBarRef.current = null;
        allCandlesRef.current = [];

        chartRef.current = createChart(chartContainerRef.current, {
            width: chartContainerRef.current.clientWidth,
            height: 550,
            layout: { background: { color: '#020617' }, textColor: '#94a3b8', fontFamily: 'Inter, sans-serif' },
            grid: { vertLines: { color: 'rgba(30, 41, 59, 0.05)' }, horzLines: { color: 'rgba(30, 41, 59, 0.05)' } },
            crosshair: { mode: CrosshairMode.Normal },
            timeScale: { borderColor: '#1e293b', timeVisible: true },
        });

        seriesRef.current = chartRef.current.addSeries(CandlestickSeries, {
            upColor: '#10b981', downColor: '#ef4444', borderVisible: false,
            wickUpColor: '#10b981', wickDownColor: '#ef4444',
            priceLineVisible: true, priceLineColor: '#6366f1',
        });

        rsiSeriesRef.current = chartRef.current.addSeries(LineSeries, {
            color: '#8b5cf6',
            lineWidth: 2,
            priceScaleId: 'rsi',
            title: 'RSI (14)',
        });

        chartRef.current.priceScale('rsi').applyOptions({
            position: 'right',
            scaleMargins: { top: 0.75, bottom: 0.05 },
            borderVisible: false,
        });

        rsiSeriesRef.current.createPriceLine({ price: 70, color: 'rgba(239, 68, 68, 0.4)', lineWidth: 1, lineStyle: 2, title: '70' });
        rsiSeriesRef.current.createPriceLine({ price: 50, color: 'rgba(148, 163, 184, 0.1)', lineWidth: 1, lineStyle: 1, title: '50' });
        rsiSeriesRef.current.createPriceLine({ price: 30, color: 'rgba(16, 185, 129, 0.4)', lineWidth: 1, lineStyle: 2, title: '30' });

        const socket = io("http://localhost:7000");
        socketRef.current = socket;

        socket.on("connect", () => {
            setIsConnected(true);
        });

        socket.on(EVENTS.STOCKS_LIST, (data) => {
            setStocks(prev => {
                const merged = data.map(s => {
                    const existing = prev.find(ex => ex.name === s.name);
                    return existing ? { ...s, isAlert: existing.isAlert } : s;
                });
                return merged;
            });
        });

        socket.on(EVENTS.ALERT_TRIGGERED, (alertData) => {
            setTriggeredAlerts(prev => [alertData, ...prev].slice(0, 5));
            setStocks(prev => prev.map(s => s.name === alertData.symbol ? { ...s, isAlert: true } : s));
            setTimeout(() => setTriggeredAlerts(prev => prev.filter(a => a.timestamp !== alertData.timestamp)), 10000);
        });

        socket.on(EVENTS.HISTORICAL_DATA_RESPONSE, (payload) => {
            if (payload.success) {
                if (payload.data?.length > 0) {
                    const istOffset = 5.5 * 60 * 60; // 5h 30m in seconds
                    const formattedData = payload.data.map(c => ({
                        time: Number(c.time) + istOffset,
                        open: parseFloat(c.open), high: parseFloat(c.high),
                        low: parseFloat(c.low), close: parseFloat(c.close),
                    })).sort((a, b) => a.time - b.time);

                    seriesRef.current.setData(formattedData);
                    allCandlesRef.current = [...formattedData];

                    const rsiData = calculateRSI(formattedData);
                    rsiSeriesRef.current.setData(rsiData);

                    const last = formattedData[formattedData.length - 1];
                    lastBarRef.current = { ...last };
                    setLivePrice(last.close);
                    setOhlcv({ o: last.open, h: last.high, l: last.low, c: last.close, v: 0 });
                } else {
                    console.warn(`[Chart] Received empty historical data`);
                }
                setIsLoading(false);
            }
        });

        socket.on(EVENTS.HISTORICAL_DATA_ERROR, (payload) => {
            console.error("[Chart] Historical Data Error:", payload.error);
            setIsLoading(false);
        });

        socket.on(EVENTS.LIVE_TICK, (tick) => {
            const isMatch = tick.symbol === selectedSymbol;
            if (isMatch) {
                const istOffset = 5.5 * 60 * 60;
                const adjustedData = {
                    ...tick.data,
                    time: Number(tick.data.time) + istOffset
                };
                updateChart(adjustedData);
            }
        });

        // socket.on(EVENTS.GOLD_UPDATE, (tick) => {
        //     if (selectedSymbol === 'GOLD') updateChart(tick.data);
        // });

        const updateChart = (data) => {
            if (!seriesRef.current || !rsiSeriesRef.current) return;

            const intervalSec = intervals.find(i => i.value === selectedInterval)?.sec || 60;

            // Normalize time to seconds if it's in milliseconds
            let tickTime = Number(data.time);
            if (tickTime > 10000000000) tickTime = Math.floor(tickTime / 1000);

            const normalizedTime = Math.floor(tickTime / intervalSec) * intervalSec;
            const price = parseFloat(data.close);

            let updatedBar;
            if (!lastBarRef.current || normalizedTime > lastBarRef.current.time) {
                // New candle started
                updatedBar = { time: normalizedTime, open: price, high: price, low: price, close: price };
                allCandlesRef.current.push(updatedBar);
                // Keep buffer manageable
                if (allCandlesRef.current.length > 1000) allCandlesRef.current.shift();
            } else {
                // Updating existing candle
                updatedBar = {
                    ...lastBarRef.current,
                    high: Math.max(lastBarRef.current.high, price),
                    low: Math.min(lastBarRef.current.low, price),
                    close: price
                };
                allCandlesRef.current[allCandlesRef.current.length - 1] = updatedBar;
            }

            lastBarRef.current = updatedBar;
            seriesRef.current.update(updatedBar);
            setLivePrice(price);
            setOhlcv({ o: updatedBar.open, h: updatedBar.high, l: updatedBar.low, c: updatedBar.close, v: 0 });

            // Immediate RSI Update for every tick
            const rsiData = calculateRSI([...allCandlesRef.current]);
            if (rsiData.length > 0) {
                rsiSeriesRef.current.update(rsiData[rsiData.length - 1]);
            }
        };

        const intervalObj = intervals.find(i => i.value === selectedInterval);
        
        // Optimize: Request only last 30 days of data for intraday intervals to speed up loading
        const initialFromDate = new Date();
        initialFromDate.setDate(initialFromDate.getDate() - 30);
        const fromDateStr = initialFromDate.toISOString().split('T')[0];

        setIsLoading(true);
        socket.emit(EVENTS.GET_HISTORICAL_DATA, {
            symbol: selectedSymbol,
            interval: intervalObj ? intervalObj.db : "ONE_MINUTE",
            fromDate: fromDateStr,
            toDate: new Date().toISOString(),
            exchange: selectedSymbol === "GOLD" ? "MCX" : "NSE"
        });

        return () => {
            socket.disconnect();
            if (chartRef.current) chartRef.current.remove();
        };
    }, [selectedSymbol, selectedInterval]);

    const handleCreateAlert = async () => {
        const stock = stocks.find(s => s.name === selectedSymbol);
        const payload = {
            symbol: selectedSymbol,
            token: stock?.token || "11536",
            exchange: selectedSymbol === 'TCS' ? "NSE" : (stock?.segment || "NSE"),
            interval: intervals.find(i => i.value === selectedInterval).db,
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
        <div className="flex h-screen bg-[#020617] text-slate-200 font-sans overflow-hidden relative">
            {/* Sidebar */}
            <aside className="w-72 border-r border-slate-800/50 flex flex-col bg-slate-900/20 backdrop-blur-xl z-20">
                <div className="p-6 border-b border-slate-800/50 text-center">
                    <h2 className="text-xl font-black bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent uppercase tracking-tight">Klypto Scanner</h2>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                    {stocks.filter(s => s.isAlert).map(s => (
                        <div key={s.name} onClick={() => setSelectedSymbol(s.name)} className={`p-4 rounded-4 cursor-pointer transition-all mb-2 ${selectedSymbol === s.name ? 'bg-primary bg-opacity-10 border border-primary border-opacity-30' : 'bg-slate-900/40 border border-slate-800/50 hover-bg-slate-800'}`}>
                            <div className="flex justify-between items-center">
                                <span className={`font-weight-black text-sm ${s.isAlert ? 'text-primary' : 'text-slate-200'}`}>{s.name} {s.isAlert && '🔥'}</span>
                                <span className="text-[10px] text-slate-600 font-bold">{s.segment}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </aside>

            {/* Main */}
            <main className="flex-1 flex flex-col bg-slate-950/20">
                <header className="h-20 border-b border-slate-800/50 d-flex align-items-center justify-content-between px-6 bg-slate-900 bg-opacity-40 backdrop-blur-md">
                    <div className="d-flex align-items-center gap-5">
                        <div className="d-flex flex-column gap-1">
                            <select
                                value={selectedSymbol}
                                onChange={(e) => setSelectedSymbol(e.target.value)}
                                className="form-select bg-slate-900 border-slate-800 text-white rounded-3 py-2 px-3 shadow-sm font-weight-black uppercase custom-select"
                                style={{ minWidth: '160px', appearance: 'none', backgroundImage: 'url("data:image/svg+xml,%3csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 16 16\' fill=\'%23ffffff\'%3e%3cpath fill-rule=\'evenodd\' d=\'M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z\'/%3e%3c/svg%3e")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.75rem center', backgroundSize: '16px 12px' }}
                            >
                                {stocks.map(s => (
                                    <option key={s.name} value={s.name} className="bg-slate-900 text-white">{s.name}</option>
                                ))}
                            </select>
                            <div className="h5 text-success font-mono font-weight-bold m-0 tracking-tighter">₹{livePrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                        </div>
                        <div className="btn-group bg-slate-800 bg-opacity-40 p-1 rounded-4 border border-slate-700/50">
                            {intervals.map((int) => (
                                <button key={int.value} onClick={() => setSelectedInterval(int.value)} className={`btn btn-sm px-4 rounded-3 text-uppercase font-weight-black small ${selectedInterval === int.value ? 'btn-primary shadow-lg' : 'btn-link text-slate-400 text-decoration-none'}`}>{int.label}</button>
                            ))}
                        </div>
                    </div>
                    <button onClick={() => setIsAlertModalOpen(true)} className="btn btn-primary px-4 rounded-4 text-uppercase font-weight-black small shadow-lg">New Alert</button>
                </header>

                <div className="flex-1 position-relative">
                    <div className="position-absolute top-0 left-0 p-4 z-index-2 opacity-80 pointer-events-none font-mono small d-flex gap-4">
                        <span className="text-slate-500">O: <span className="text-white">{ohlcv.o.toFixed(2)}</span></span>
                        <span className="text-slate-500">H: <span className="text-success">{ohlcv.h.toFixed(2)}</span></span>
                        <span className="text-slate-500">L: <span className="text-danger">{ohlcv.l.toFixed(2)}</span></span>
                        <span className="text-slate-500">C: <span className="text-white">{ohlcv.c.toFixed(2)}</span></span>
                    </div>
                    {isLoading && <div className="position-absolute inset-0 d-flex align-items-center justify-content-center bg-dark bg-opacity-10 backdrop-blur-sm z-index-3"><div className="spinner-border text-primary border-4"></div></div>}
                    <div ref={chartContainerRef} className="w-full h-full" />
                </div>

                {/* Alert Modal (Restored Original Layout) */}
                {isAlertModalOpen && (
                    <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(12px)' }}>
                        <div className="modal-dialog modal-dialog-centered">
                            <div className="modal-content border border-slate-800 bg-[#020617] text-white rounded-5 shadow-2xl p-5">
                                <div className="d-flex justify-content-between align-items-center mb-4">
                                    <h3 className="font-weight-black text- m-0 tracking-tighter uppercase">Set Alert Condition</h3>
                                    <button onClick={() => setIsAlertModalOpen(false)} className="btn-close btn-close-white opacity-50"></button>
                                </div>

                                <div className="space-y-4">
                                    <div className="mb-3">
                                        <label className="small text-slate-500 text-uppercase font-weight-black tracking-widest mb-2 d-block">Indicator & Operator</label>
                                        <div className="d-flex gap-2">
                                            <select value={alertForm.indicator} onChange={e => setAlertForm({ ...alertForm, indicator: e.target.value })} className="form-select bg-slate-900 border-slate-800 text-black rounded-4 py-2 shadow-inner">
                                                <option value="RSI">RSI (Relative Strength)</option>
                                                <option value="EMA">EMA (Moving Average)</option>
                                                <option value="PRICE">Price Level</option>
                                            </select>
                                            <select value={alertForm.operator} onChange={e => setAlertForm({ ...alertForm, operator: e.target.value })} className="form-select bg-slate-900 border-slate-800 text-black rounded-4 py-2 shadow-inner">
                                                {operators.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                    <div className="mb-3">
                                        <label className="small text-slate-500 text-uppercase font-weight-black tracking-widest mb-2 d-block">Target Value</label>
                                        <input type="number" value={alertForm.value} onChange={e => setAlertForm({ ...alertForm, value: e.target.value })} className="form-control bg-slate-900 border-slate-800 text-black rounded-4 py-3 shadow-inner text-center h4 font-mono" />
                                    </div>
                                    <div className="d-grid gap-3 pt-2">
                                        <button onClick={handleCreateAlert} className="btn btn-primary py-3 rounded-4 font-weight-black text-uppercase tracking-widest shadow-lg">Start Scanning</button>
                                        <button onClick={() => setIsAlertModalOpen(false)} className="btn btn-link text-slate-500 text-decoration-none small text-uppercase font-weight-bold">Cancel</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </main>
            <style dangerouslySetInnerHTML={{
                __html: `
                .z-index-3 { z-index: 3; } .z-index-2 { z-index: 2; }
                .hover-bg-slate-800:hover { background: rgba(30, 41, 59, 0.4); }
                .font-weight-black { font-weight: 900; }
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 10px; }
                .custom-select:focus { border-color: #6366f1; box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2); outline: none; }
                .custom-select option { background-color: #0f172a; color: white; padding: 10px; }
            `}} />
        </div>
    );
};

export default GoldChart;








// import React, { useEffect, useRef, useState, Fragment } from 'react';
// import { CandlestickSeries, createChart, LineSeries, CrosshairMode } from 'lightweight-charts';
// import io from 'socket.io-client';

// const EVENTS = {
//     GET_HISTORICAL_DATA: "getManualHistoricalData",
//     GET_INDICATOR_DETAILS: "getIndicatorDetails",
//     GET_LIVE_INDICATOR: "getLiveIndicatorUpdate",
//     GET_RSI_SCANNER: "getRsiScanner",
//     SET_RSI_ALERT: "setRsiAlert",
//     GET_ALL_STOCKS: "getAllStocks",
//     HISTORICAL_DATA_RESPONSE: "historicalDataResponse",
//     INDICATOR_DETAILS_RESPONSE: "indicatorDetailsResponse",
//     LIVE_INDICATOR_RESPONSE: "liveIndicatorResponse",
//     RSI_SCANNER_RESPONSE: "rsiScannerResponse",
//     STOCKS_LIST: "stocks",
//     STOCK_UPDATE: "stockUpdate",
//     LIVE_TICK: "liveTick",
//     ALERT_TRIGGERED: "ALERT_TRIGGERED",
//     GOLD_UPDATE: "goldUpdate"
// };

// const GoldChart = () => {
//     const chartContainerRef = useRef();
//     const chartRef = useRef();
//     const seriesRef = useRef();
//     const rsiSeriesRef = useRef();
//     const allCandlesRef = useRef([]);
//     const lastBarRef = useRef(null);
//     const socketRef = useRef(null);

//     const [selectedSymbol, setSelectedSymbol] = useState('GOLD');
//     const [selectedInterval, setSelectedInterval] = useState('1m');
//     const [livePrice, setLivePrice] = useState(0);
//     const [ohlcv, setOhlcv] = useState({ o: 0, h: 0, l: 0, c: 0, v: 0 });
//     const [isConnected, setIsConnected] = useState(false);
//     const [stocks, setStocks] = useState([{ name: 'GOLD', token: 'GOLD', segment: 'MCX' }]);
//     const [isLoading, setIsLoading] = useState(true);
//     const [triggeredAlerts, setTriggeredAlerts] = useState([]);
//     const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
//     const [alertForm, setAlertForm] = useState({
//         indicator: 'RSI',
//         operator: '>',
//         value: 70,
//         interval: 'ONE_MINUTE',
//         triggerType: 'every_tick'
//     });

//     const intervals = [
//         { label: "1m", value: "1m", sec: 60, db: "ONE_MINUTE" },
//         { label: "5m", value: "5m", sec: 300, db: "FIVE_MINUTE" },
//         { label: "15m", value: "15m", sec: 900, db: "FIFTEEN_MINUTE" },
//         { label: "1h", value: "1h", sec: 3600, db: "ONE_HOUR" },
//         { label: "1d", value: "1d", sec: 86400, db: "ONE_DAY" },
//     ];

//     const operators = [
//         { label: "Greater Than", value: ">" },
//         { label: "Less Than", value: "<" },
//         { label: "Crosses", value: "crosses" },
//         { label: "Crosses Up", value: "crosses_up" },
//         { label: "Crosses Down", value: "crosses_down" },
//     ];

//     // Wilder's RSI Calculation Logic
//     const calculateRSI = (candles, period = 14) => {
//         if (candles.length <= period) return [];
//         const result = [];
//         let avgGain = 0;
//         let avgLoss = 0;

//         for (let i = 1; i <= period; i++) {
//             const change = candles[i].close - candles[i - 1].close;
//             if (change > 0) avgGain += change;
//             else avgLoss -= change;
//         }
//         avgGain /= period;
//         avgLoss /= period;

//         result.push({ time: candles[period].time, value: 100 - (100 / (1 + (avgGain / (avgLoss || 1)))) });

//         for (let i = period + 1; i < candles.length; i++) {
//             const change = candles[i].close - candles[i - 1].close;
//             const gain = change > 0 ? change : 0;
//             const loss = change < 0 ? -change : 0;
//             avgGain = (avgGain * (period - 1) + gain) / period;
//             avgLoss = (avgLoss * (period - 1) + loss) / period;
//             const rs = avgGain / (avgLoss || 1);
//             result.push({ time: candles[i].time, value: 100 - (100 / (1 + rs)) });
//         }
//         return result;
//     };

//     useEffect(() => {
//         if (!chartContainerRef.current) return;

//         setIsLoading(true);
//         lastBarRef.current = null;
//         allCandlesRef.current = [];

//         chartRef.current = createChart(chartContainerRef.current, {
//             width: chartContainerRef.current.clientWidth,
//             height: 550,
//             layout: { background: { color: '#020617' }, textColor: '#94a3b8', fontFamily: 'Inter, sans-serif' },
//             grid: { vertLines: { color: 'rgba(30, 41, 59, 0.05)' }, horzLines: { color: 'rgba(30, 41, 59, 0.05)' } },
//             crosshair: { mode: CrosshairMode.Normal },
//             timeScale: { borderColor: '#1e293b', timeVisible: true },
//         });

//         seriesRef.current = chartRef.current.addSeries(CandlestickSeries, {
//             upColor: '#10b981', downColor: '#ef4444', borderVisible: false,
//             wickUpColor: '#10b981', wickDownColor: '#ef4444',
//             priceLineVisible: true, priceLineColor: '#6366f1',
//         });

//         rsiSeriesRef.current = chartRef.current.addSeries(LineSeries, {
//             color: '#8b5cf6',
//             lineWidth: 2,
//             priceScaleId: 'rsi',
//             title: 'RSI (14)',
//         });

//         chartRef.current.priceScale('rsi').applyOptions({
//             position: 'right',
//             scaleMargins: { top: 0.75, bottom: 0.05 },
//             borderVisible: false,
//         });

//         rsiSeriesRef.current.createPriceLine({ price: 70, color: 'rgba(239, 68, 68, 0.4)', lineWidth: 1, lineStyle: 2, title: '70' });
//         rsiSeriesRef.current.createPriceLine({ price: 50, color: 'rgba(148, 163, 184, 0.1)', lineWidth: 1, lineStyle: 1, title: '50' });
//         rsiSeriesRef.current.createPriceLine({ price: 30, color: 'rgba(16, 185, 129, 0.4)', lineWidth: 1, lineStyle: 2, title: '30' });

//         const socket = io("http://localhost:7000");
//         socketRef.current = socket;

//         socket.on("connect", () => {
//             setIsConnected(true);
//         });

//         socket.on(EVENTS.STOCKS_LIST, (data) => {
//             setStocks(prev => {
//                 const merged = data.map(s => {
//                     const existing = prev.find(ex => ex.name === s.name);
//                     return existing ? { ...s, isAlert: existing.isAlert } : s;
//                 });
//                 return merged;
//             });
//         });

//         socket.on(EVENTS.ALERT_TRIGGERED, (alertData) => {
//             setTriggeredAlerts(prev => [alertData, ...prev].slice(0, 5));
//             setStocks(prev => prev.map(s => s.name === alertData.symbol ? { ...s, isAlert: true } : s));
//             setTimeout(() => setTriggeredAlerts(prev => prev.filter(a => a.timestamp !== alertData.timestamp)), 10000);
//         });

//         socket.on(EVENTS.HISTORICAL_DATA_RESPONSE, (payload) => {
//             if (payload.success && payload.data?.length > 0) {
//                 const formattedData = payload.data.map(c => ({
//                     time: Number(c.time),
//                     open: parseFloat(c.open), high: parseFloat(c.high),
//                     low: parseFloat(c.low), close: parseFloat(c.close),
//                 })).sort((a, b) => a.time - b.time);

//                 seriesRef.current.setData(formattedData);
//                 allCandlesRef.current = [...formattedData];

//                 const rsiData = calculateRSI(formattedData);
//                 rsiSeriesRef.current.setData(rsiData);

//                 const last = formattedData[formattedData.length - 1];
//                 lastBarRef.current = { ...last };
//                 setLivePrice(last.close);
//                 setOhlcv({ o: last.open, h: last.high, l: last.low, c: last.close, v: 0 });
//                 setIsLoading(false);
//             }
//         });

//         socket.on(EVENTS.LIVE_TICK, (tick) => {
//             const isMatch = tick.symbol === selectedSymbol || (selectedSymbol === 'GOLD' && tick.symbol.startsWith('GOLD'));
//             if (isMatch) updateChart(tick.data); // Removed istOffset here as backend already provides it
//         });

//         socket.on(EVENTS.GOLD_UPDATE, (tick) => {
//             if (selectedSymbol === 'GOLD') updateChart(tick.data);
//         });

//         const updateChart = (data) => {
//             if (!seriesRef.current) return;
//             const intervalSec = intervals.find(i => i.value === selectedInterval)?.sec || 60;
//             const normalizedTime = Math.floor(Number(data.time) / intervalSec) * intervalSec;
//             const price = parseFloat(data.close);

//             let updatedBar;
//             if (!lastBarRef.current || normalizedTime > lastBarRef.current.time) {
//                 updatedBar = { time: normalizedTime, open: price, high: price, low: price, close: price };
//                 allCandlesRef.current.push(updatedBar);
//                 if (allCandlesRef.current.length > 1000) allCandlesRef.current.shift();
//             } else {
//                 updatedBar = { ...lastBarRef.current, high: Math.max(lastBarRef.current.high, price), low: Math.min(lastBarRef.current.low, price), close: price };
//                 allCandlesRef.current[allCandlesRef.current.length - 1] = updatedBar;
//             }

//             lastBarRef.current = updatedBar;
//             seriesRef.current.update(updatedBar);
//             setLivePrice(price);
//             setOhlcv({ o: updatedBar.open, h: updatedBar.high, l: updatedBar.low, c: updatedBar.close, v: 0 });

//             const rsiData = calculateRSI(allCandlesRef.current);
//             if (rsiData.length > 0) {
//                 rsiSeriesRef.current.update(rsiData[rsiData.length - 1]);
//             }
//         };

//         const intervalObj = intervals.find(i => i.value === selectedInterval);
//         socket.emit(EVENTS.GET_HISTORICAL_DATA, {
//             symbol: selectedSymbol, 
//             interval: intervalObj ? intervalObj.db : "ONE_MINUTE",
//             fromDate: "2024-05-01", 
//             toDate: new Date().toISOString(),
//             exchange: selectedSymbol === "GOLD" ? "MCX" : "NSE"
//         });

//         return () => {
//             socket.disconnect();
//             if (chartRef.current) chartRef.current.remove();
//         };
//     }, [selectedSymbol, selectedInterval]);

//     const handleCreateAlert = async () => {
//         const stock = stocks.find(s => s.name === selectedSymbol);
//         const payload = {
//             symbol: selectedSymbol,
//             token: stock?.token || "GOLD",
//             exchange: selectedSymbol === 'GOLD' ? "MCX" : (stock?.segment || "NSE"),
//             interval: intervals.find(i => i.value === selectedInterval).db,
//             indicator: alertForm.indicator,
//             params: { type: alertForm.indicator, length: 14 },
//             operator: alertForm.operator,
//             value: parseFloat(alertForm.value),
//             triggerType: alertForm.triggerType
//         };
//         await fetch('http://localhost:7000/alerts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
//         setIsAlertModalOpen(false);
//     };

//     return (
//         <div className="flex h-screen bg-[#020617] text-slate-200 font-sans overflow-hidden relative">
//             {/* Sidebar */}
//             <aside className="w-72 border-r border-slate-800/50 flex flex-col bg-slate-900/20 backdrop-blur-xl z-20">
//                 <div className="p-6 border-b border-slate-800/50 text-center">
//                     <h2 className="text-xl font-black bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent uppercase tracking-tight">Klypto Scanner</h2>
//                 </div>
//                 <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
//                     {stocks.filter(s => s.name === 'GOLD' || s.isAlert).map(s => (
//                         <div key={s.name} onClick={() => setSelectedSymbol(s.name)} className={`p-4 rounded-4 cursor-pointer transition-all mb-2 ${selectedSymbol === s.name ? 'bg-primary bg-opacity-10 border border-primary border-opacity-30' : 'bg-slate-900/40 border border-slate-800/50 hover-bg-slate-800'}`}>
//                             <div className="flex justify-between items-center">
//                                 <span className={`font-weight-black text-sm ${s.isAlert ? 'text-primary' : 'text-slate-200'}`}>{s.name} {s.isAlert && '🔥'}</span>
//                                 <span className="text-[10px] text-slate-600 font-bold">{s.segment}</span>
//                             </div>
//                         </div>
//                     ))}
//                 </div>
//             </aside>

//             {/* Main */}
//             <main className="flex-1 flex flex-col bg-slate-950/20">
//                 <header className="h-20 border-b border-slate-800/50 d-flex align-items-center justify-content-between px-6 bg-slate-900 bg-opacity-40 backdrop-blur-md">
//                     <div className="d-flex align-items-center gap-5">
//                         <div className="d-flex flex-column">
//                             <h1 className="h4 font-weight-black m-0 text-white tracking-tight">{selectedSymbol}</h1>
//                             <div className="h5 text-success font-mono font-weight-bold m-0 tracking-tighter">₹{livePrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
//                         </div>
//                         <div className="btn-group bg-slate-800 bg-opacity-40 p-1 rounded-4 border border-slate-700/50">
//                             {intervals.map((int) => (
//                                 <button key={int.value} onClick={() => setSelectedInterval(int.value)} className={`btn btn-sm px-4 rounded-3 text-uppercase font-weight-black small ${selectedInterval === int.value ? 'btn-primary shadow-lg' : 'btn-link text-slate-400 text-decoration-none'}`}>{int.label}</button>
//                             ))}
//                         </div>
//                     </div>
//                     <button onClick={() => setIsAlertModalOpen(true)} className="btn btn-primary px-4 rounded-4 text-uppercase font-weight-black small shadow-lg">New Alert</button>
//                 </header>

//                 <div className="flex-1 position-relative">
//                     <div className="position-absolute top-0 left-0 p-4 z-index-2 opacity-80 pointer-events-none font-mono small d-flex gap-4">
//                         <span className="text-slate-500">O: <span className="text-white">{ohlcv.o.toFixed(2)}</span></span>
//                         <span className="text-slate-500">H: <span className="text-success">{ohlcv.h.toFixed(2)}</span></span>
//                         <span className="text-slate-500">L: <span className="text-danger">{ohlcv.l.toFixed(2)}</span></span>
//                         <span className="text-slate-500">C: <span className="text-white">{ohlcv.c.toFixed(2)}</span></span>
//                     </div>
//                     {isLoading && <div className="position-absolute inset-0 d-flex align-items-center justify-content-center bg-dark bg-opacity-10 backdrop-blur-sm z-index-3"><div className="spinner-border text-primary border-4"></div></div>}
//                     <div ref={chartContainerRef} className="w-full h-full" />
//                 </div>

//                 {/* Alert Modal */}
//                 {isAlertModalOpen && (
//                     <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(12px)' }}>
//                         <div className="modal-dialog modal-dialog-centered">
//                             <div className="modal-content border border-slate-800 bg-[#020617] text-white rounded-5 shadow-2xl p-5">
//                                 <div className="d-flex justify-content-between align-items-center mb-4">
//                                     <h3 className="font-weight-black text-black m-0 tracking-tighter">Set Alert Condition</h3>
//                                     <button onClick={() => setIsAlertModalOpen(false)} className="btn-close btn-close-white opacity-50"></button>
//                                 </div>
//                                 <div className="space-y-4">
//                                     <div className="mb-3">
//                                         <label className="small text-slate-500 text-uppercase font-weight-black tracking-widest mb-2 d-block">Indicator</label>
//                                         <div className="d-flex gap-2">
//                                             <select value={alertForm.indicator} onChange={e => setAlertForm({ ...alertForm, indicator: e.target.value })} className="form-select bg-slate-900 border-slate-800 text-white rounded-4 py-2 shadow-inner">
//                                                 <option value="RSI">RSI</option>
//                                             </select>
//                                             <select value={alertForm.operator} onChange={e => setAlertForm({ ...alertForm, operator: e.target.value })} className="form-select bg-slate-900 border-slate-800 text-white rounded-4 py-2 shadow-inner">
//                                                 {operators.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
//                                             </select>
//                                         </div>
//                                     </div>
//                                     <div className="mb-3">
//                                         <label className="small text-slate-500 text-uppercase font-weight-black tracking-widest mb-2 d-block">Target Value</label>
//                                         <input type="number" value={alertForm.value} onChange={e => setAlertForm({ ...alertForm, value: e.target.value })} className="form-control bg-slate-900 border-slate-800 text-white rounded-4 py-3 shadow-inner text-center h4 font-mono" />
//                                     </div>
//                                     <div className="d-grid gap-3 pt-2">
//                                         <button onClick={handleCreateAlert} className="btn btn-primary py-3 rounded-4 font-weight-black text-uppercase tracking-widest shadow-lg">Start Scanning</button>
//                                         <button onClick={() => setIsAlertModalOpen(false)} className="btn btn-link text-slate-500 text-decoration-none small text-uppercase font-weight-bold">Cancel</button>
//                                     </div>
//                                 </div>
//                             </div>
//                         </div>
//                     </div>
//                 )}
//             </main>
//             <style dangerouslySetInnerHTML={{
//                 __html: `
//                 .z-index-3 { z-index: 3; } .z-index-2 { z-index: 2; }
//                 .hover-bg-slate-800:hover { background: rgba(30, 41, 59, 0.4); }
//                 .font-weight-black { font-weight: 900; }
//                 .custom-scrollbar::-webkit-scrollbar { width: 4px; }
//                 .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 10px; }
//             `}} />
//         </div>
//     );
// };

// export default GoldChart;
