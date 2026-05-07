import React, { useEffect, useRef, useState } from 'react';
import { CandlestickSeries, createChart, LineSeries } from 'lightweight-charts';
import io from 'socket.io-client';






const GoldChart = () => {
    const chartContainerRef = useRef();
    const chartRef = useRef();
    const seriesRef = useRef();
    const indicatorSeriesRef = useRef({}); // To store line series for indicators
    const lastTimeRef = useRef(0);

    const [selectedSymbol, setSelectedSymbol] = useState('RELIANCE');
    const [selectedInterval, setSelectedInterval] = useState('1d');
    const [livePrice, setLivePrice] = useState(null);
    const [isConnected, setIsConnected] = useState(false);
    const [watchlist, setWatchlist] = useState([]);

    const [activeIndicators, setActiveIndicators] = useState([]);
    const [showIndMenu, setShowIndMenu] = useState(false);

    const demoIndicators = [
        { label: "SMA (9)", value: "SMA", type: "overlay", color: "#6366f1" },
        { label: "EMA (9)", value: "EMA", type: "overlay", color: "#ec4899" },
        { label: "VWAP", value: "VWAP", type: "overlay", color: "#f59e0b" },
        { label: "Bollinger Bands", value: "BB", type: "overlay", color: "#06b6d4" },
        { label: "RSI (14)", value: "RSI", type: "oscillator", color: "#8b5cf6" },
        { label: "MACD", value: "MACD", type: "oscillator", color: "#10b981" },
        { label: "ATR", value: "ATR", type: "oscillator", color: "#f43f5e" },
        { label: "Supertrend", value: "SUPERTREND", type: "overlay", color: "#fbbf24" },
        { label: "Standard Deviation", value: "STDDEV", type: "oscillator", color: "#94a3b8" },
        { label: "Momentum", value: "MOM", type: "oscillator", color: "#2dd4bf" },
    ];

    const intervals = [
        { label: "1m", value: "1m", sec: 60 },
        { label: "5m", value: "5m", sec: 300 },
        { label: "15m", value: "15m", sec: 900 },
        { label: "1h", value: "1h", sec: 3600 },
        { label: "1d", value: "1d", sec: 86400 },
    ];

    useEffect(() => {
        if (!chartContainerRef.current) return;

        // 1. Initialize Chart
        chartRef.current = createChart(chartContainerRef.current, {
            width: chartContainerRef.current.clientWidth,
            height: 550,
            layout: {
                background: { color: '#0f172a' },
                textColor: '#94a3b8',
            },
            grid: {
                vertLines: { color: '#1e293b' },
                horzLines: { color: '#1e293b' },
            },
            priceScale: { borderColor: '#334155' },
            timeScale: {
                borderColor: '#334155',
                timeVisible: true,
                secondsVisible: false,
            },
        });

        seriesRef.current = chartRef.current.addSeries(CandlestickSeries, {
            upColor: '#10b981',
            downColor: '#ef4444',
            borderDownColor: '#ef4444',
            borderUpColor: '#10b981',
            wickDownColor: '#ef4444',
            wickUpColor: '#10b981',
        });


        // 2. Setup WebSocket Listener
        const socket = io("http://localhost:7000");

        socket.on("connect", () => {
            setIsConnected(true);
            socket.emit("getAllStocks");
        });
        socket.on("disconnect", () => setIsConnected(false));

        socket.on("stocks", (data) => {
            if (Array.isArray(data)) setWatchlist(data);
        });

        socket.on("stockUpdate", (update) => {
            setWatchlist(prev => prev.map(s => s.token === update.token ? { ...s, ...update } : s));
        });

        // Request historical data
        const now = new Date();
        const pastDate = new Date();
        if (selectedInterval === '1d') pastDate.setDate(now.getDate() - 730);
        else pastDate.setDate(now.getDate() - 30);
        
        const fDate = pastDate.toISOString().split('T')[0];
        const tDate = now.toISOString().split('T')[0];
        const isGold = ["GOLD", "GOLDM", "GOLDPETAL", "GOLDGUINEA"].includes(selectedSymbol);
        const exchange = isGold ? "MCX" : "NSE";

        socket.emit("getManualHistoricalData", {
            symbol: selectedSymbol, interval: selectedInterval,
            fromDate: fDate, toDate: tDate, exchange: exchange
        });

        // Request active indicators
        activeIndicators.forEach(ind => {
            socket.emit("getIndicatorDetails", {
                type: ind.value, symbol: selectedSymbol, interval: selectedInterval,
                fromDate: fDate, toDate: tDate
            });
        });



        socket.on("historicalDataResponse", (payload) => {
            if (payload.success && payload.data?.length > 0 && seriesRef.current) {
                const formattedData = payload.data.map(c => ({
                    time: Number(c.time), open: parseFloat(c.open), high: parseFloat(c.high),
                    low: parseFloat(c.low), close: parseFloat(c.close),
                })).sort((a, b) => a.time - b.time);
                seriesRef.current.setData(formattedData);
                setLivePrice(formattedData[formattedData.length - 1].close);
                lastTimeRef.current = formattedData[formattedData.length - 1].time;
            }
        });

        socket.on("indicatorDetailsResponse", (payload) => {
            const indValue = payload.message.split('fetched by ')[1];
            const indConfig = demoIndicators.find(i => i.value === indValue);
            
            if (!indConfig || !payload.data) return;

            if (indicatorSeriesRef.current[indConfig.value]) {
                chartRef.current.removeSeries(indicatorSeriesRef.current[indConfig.value]);
            }

            const isActive = activeIndicators.some(i => i.value === indValue);
            if (!isActive) return;

            const newSeries = chartRef.current.addSeries(LineSeries, {
                color: indConfig.color,
                lineWidth: 2,
                priceScaleId: indConfig.type === "overlay" ? "right" : "left", 
            });

            const indicatorData = payload.data.map(d => ({
                time: Number(d.time),
                value: d[indConfig.value.toLowerCase()] || d.value || d.sma || d.ema || d.rsi || d.macd || d.vwap || d.atr || d.supertrend || 0
            })).filter(d => d.value !== 0 && !isNaN(d.time)).sort((a, b) => a.time - b.time);

            newSeries.setData(indicatorData);
            indicatorSeriesRef.current[indConfig.value] = newSeries;
        });


        socket.on("liveTick", (tick) => {
            if (tick.symbol === selectedSymbol && seriesRef.current) {
                const intervalSec = intervals.find(i => i.value === selectedInterval)?.sec || 60;
                const normalizedTime = Math.floor(Number(tick.data.time) / intervalSec) * intervalSec;
                
                if (normalizedTime < lastTimeRef.current) return;

                const latestTick = { ...tick.data, time: normalizedTime };
                seriesRef.current.update(latestTick);
                setLivePrice(tick.data.close);
                lastTimeRef.current = normalizedTime;

                // Request LIVE update for all active indicators
                activeIndicators.forEach(ind => {
                    socket.emit("getLiveIndicatorUpdate", {
                        type: ind.value, symbol: selectedSymbol, interval: selectedInterval,
                        latestTick: latestTick,
                        fromDate: fDate, toDate: tDate
                    });
                });
            }
        });

        socket.on("liveIndicatorResponse", (payload) => {
            if (payload.symbol === selectedSymbol && indicatorSeriesRef.current[payload.type]) {
                const series = indicatorSeriesRef.current[payload.type];
                series.update({
                    time: Number(payload.data.time),
                    value: parseFloat(payload.data.value)
                });
            }
        });




        const handleResize = () => {
            if (chartRef.current && chartContainerRef.current) {
                chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
            }
        };
        window.addEventListener('resize', handleResize);

        return () => {
            socket.disconnect();
            window.removeEventListener('resize', handleResize);
            if (chartRef.current) chartRef.current.remove();
            indicatorSeriesRef.current = {};
        };
    }, [selectedSymbol, selectedInterval, activeIndicators]);

    const toggleIndicator = (ind) => {
        setActiveIndicators(prev => {
            const exists = prev.find(i => i.value === ind.value);
            if (exists) {
                // Manually remove series from chart if unchecking
                if (indicatorSeriesRef.current[ind.value]) {
                    chartRef.current.removeSeries(indicatorSeriesRef.current[ind.value]);
                    delete indicatorSeriesRef.current[ind.value];
                }
                return prev.filter(i => i.value !== ind.value);
            }
            return [...prev, ind];
        });
    };

    return (
        <div style={{ display: 'flex', background: '#020617', color: 'white', minHeight: '600px', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', margin: '20px', border: '1px solid #1e293b' }}>
            
            {/* Sidebar Watchlist */}
            <div style={{ width: '280px', borderRight: '1px solid #1e293b', background: '#0f172a', display: 'flex', flexDirection: 'column', height: '650px' }}>
                <div style={{ padding: '20px', borderBottom: '1px solid #1e293b' }}>
                    <h3 style={{ margin: 0, fontSize: '18px', color: '#f59e0b' }}>Watchlist</h3>
                    <div style={{ fontSize: '11px', color: isConnected ? '#10b981' : '#ef4444', marginTop: '4px' }}>
                        ● {isConnected ? 'Live Market' : 'Disconnected'}
                    </div>
                </div>
                
                <div style={{ flex: 1, overflowY: 'auto', padding: '10px', scrollbarWidth: 'thin', scrollbarColor: '#334155 #0f172a' }}>
                    {watchlist.map(stock => (
                        <div 
                            key={stock.token}
                            onClick={() => setSelectedSymbol(stock.name)}
                            style={{
                                padding: '12px', marginBottom: '8px', borderRadius: '10px', cursor: 'pointer',
                                background: selectedSymbol === stock.name ? '#1e293b' : 'transparent',
                                border: selectedSymbol === stock.name ? '1px solid #334155' : '1px solid transparent',
                                transition: 'all 0.2s', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                            }}
                        >
                            <div>
                                <div style={{ fontWeight: '600', fontSize: '14px' }}>{stock.name}</div>
                                <div style={{ fontSize: '11px', color: '#64748b' }}>{stock.segment}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#f8fafc' }}>₹{parseFloat(stock.ltp).toLocaleString()}</div>
                                <div style={{ fontSize: '11px', color: parseFloat(stock.percent_change) >= 0 ? '#10b981' : '#ef4444' }}>
                                    {stock.percent_change}%
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Main Chart Area */}
            <div style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                            {selectedSymbol}
                            {livePrice && <span style={{ color: '#10b981', fontSize: '20px' }}>₹{livePrice.toLocaleString()}</span>}
                        </h2>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {/* Indicators Menu */}
                        <div style={{ position: 'relative' }}>
                            <button 
                                onClick={() => setShowIndMenu(!showIndMenu)}
                                style={{ background: '#1e293b', color: 'white', padding: '8px 16px', borderRadius: '8px', border: '1px solid #334155', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}
                            >
                                📈 Indicators {activeIndicators.length > 0 && `(${activeIndicators.length})`}
                            </button>

                            {showIndMenu && (
                                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '8px', background: '#0f172a', border: '1px solid #334155', borderRadius: '12px', width: '220px', zIndex: 1000, boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)', padding: '10px' }}>
                                    {demoIndicators.map(ind => (
                                        <label key={ind.value} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', cursor: 'pointer', borderRadius: '6px', transition: 'background 0.2s' }} onMouseEnter={(e)=>e.currentTarget.style.background='#1e293b'} onMouseLeave={(e)=>e.currentTarget.style.background='transparent'}>
                                            <input 
                                                type="checkbox" 
                                                checked={activeIndicators.some(i => i.value === ind.value)}
                                                onChange={() => toggleIndicator(ind)}
                                                style={{ accentColor: '#6366f1' }}
                                            />
                                            <span style={{ fontSize: '13px', color: '#cbd5e1' }}>{ind.label}</span>
                                            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: ind.color, marginLeft: 'auto' }}></div>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Intervals */}
                        <div style={{ display: 'flex', gap: '4px', background: '#1e293b', padding: '4px', borderRadius: '10px' }}>
                            {intervals.map(int => (
                                <button
                                    key={int.value}
                                    onClick={() => setSelectedInterval(int.value)}
                                    style={{
                                        padding: '6px 10px', borderRadius: '6px', border: 'none',
                                        background: selectedInterval === int.value ? '#334155' : 'transparent',
                                        color: selectedInterval === int.value ? 'white' : '#94a3b8',
                                        cursor: 'pointer', fontSize: '12px', fontWeight: '500'
                                    }}
                                >
                                    {int.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Active Indicators Chips */}
                {activeIndicators.length > 0 && (
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {activeIndicators.map(ind => (
                            <div key={ind.value} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: `${ind.color}33`, color: ind.color, padding: '4px 10px', borderRadius: '6px', fontSize: '11px', border: `1px solid ${ind.color}55` }}>
                                {ind.label}
                                <span onClick={() => toggleIndicator(ind)} style={{ cursor: 'pointer', fontWeight: 'bold' }}>×</span>
                            </div>
                        ))}
                    </div>
                )}

                <div ref={chartContainerRef} style={{ width: '100%', flex: 1, borderRadius: '12px', overflow: 'hidden' }} />
            </div>
        </div>

    );
};

export default GoldChart;


