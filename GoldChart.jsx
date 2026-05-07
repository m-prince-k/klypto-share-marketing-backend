import React, { useEffect, useRef, useState } from 'react';
import { CandlestickSeries, createChart } from 'lightweight-charts';
import io from 'socket.io-client';





const GoldChart = () => {
    const chartContainerRef = useRef();
    const chartRef = useRef();
    const seriesRef = useRef();
    const [selectedSymbol, setSelectedSymbol] = useState('RELIANCE');
    const [selectedInterval, setSelectedInterval] = useState('1d');
    const [livePrice, setLivePrice] = useState(null);
    const [isConnected, setIsConnected] = useState(false);
    const [watchlist, setWatchlist] = useState([]);

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
            socket.emit("getAllStocks"); // Request initial watchlist
        });
        socket.on("disconnect", () => setIsConnected(false));

        // Initial Watchlist
        socket.on("stocks", (data) => {
            if (Array.isArray(data)) {
                setWatchlist(data);
            }
        });

        // Live Watchlist Updates
        socket.on("stockUpdate", (update) => {
            setWatchlist(prev => prev.map(s => 
                s.token === update.token ? { ...s, ...update } : s
            ));
        });

        // Request historical data for selected symbol
        const now = new Date();
        const pastDate = new Date();
        if (selectedInterval === '1d') pastDate.setDate(now.getDate() - 730);
        else pastDate.setDate(now.getDate() - 30);
        
        const fDate = pastDate.toISOString().split('T')[0];
        const tDate = now.toISOString().split('T')[0];

        const isGold = ["GOLD", "GOLDM", "GOLDPETAL", "GOLDGUINEA"].includes(selectedSymbol);
        const exchange = isGold ? "MCX" : "NSE";

        socket.emit("getManualHistoricalData", {
            symbol: selectedSymbol,
            interval: selectedInterval,
            fromDate: fDate,
            toDate: tDate,
            exchange: exchange
        });

        socket.on("historicalDataResponse", (payload) => {
            if (payload.success && payload.data?.length > 0 && seriesRef.current) {
                const formattedData = payload.data.map(c => ({
                    time: Math.floor(new Date(c.timestamp).getTime() / 1000),
                    open: parseFloat(c.open),
                    high: parseFloat(c.high),
                    low: parseFloat(c.low),
                    close: parseFloat(c.close),
                })).sort((a, b) => a.time - b.time);

                seriesRef.current.setData(formattedData);
                const lastCandle = formattedData[formattedData.length - 1];
                setLivePrice(lastCandle.close);
            }
        });

        // Live Tick for Chart
        socket.on("liveTick", (tick) => {
            if (tick.symbol === selectedSymbol && seriesRef.current) {
                const intervalSec = intervals.find(i => i.value === selectedInterval)?.sec || 60;
                const normalizedTime = Math.floor(tick.data.time / intervalSec) * intervalSec;
                seriesRef.current.update({ ...tick.data, time: normalizedTime });
                setLivePrice(tick.data.close);
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
        };
    }, [selectedSymbol, selectedInterval]);

    return (
        <div style={{ display: 'flex', background: '#020617', color: 'white', minHeight: '600px', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', margin: '20px', border: '1px solid #1e293b' }}>
            
            {/* Sidebar Watchlist */}
            <div style={{ width: '280px', borderRight: '1px solid #1e293b', background: '#0f172a', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '20px', borderBottom: '1px solid #1e293b' }}>
                    <h3 style={{ margin: 0, fontSize: '18px', color: '#f59e0b' }}>Watchlist</h3>
                    <div style={{ fontSize: '11px', color: isConnected ? '#10b981' : '#ef4444', marginTop: '4px' }}>
                        ● {isConnected ? 'Live Market' : 'Disconnected'}
                    </div>
                </div>
                
                <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
                    {watchlist.map(stock => (
                        <div 
                            key={stock.token}
                            onClick={() => setSelectedSymbol(stock.name)}
                            style={{
                                padding: '12px',
                                marginBottom: '8px',
                                borderRadius: '10px',
                                cursor: 'pointer',
                                background: selectedSymbol === stock.name ? '#1e293b' : 'transparent',
                                border: selectedSymbol === stock.name ? '1px solid #334155' : '1px solid transparent',
                                transition: 'all 0.2s',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}
                            onMouseEnter={(e) => { if(selectedSymbol !== stock.name) e.currentTarget.style.background = '#1e293b55' }}
                            onMouseLeave={(e) => { if(selectedSymbol !== stock.name) e.currentTarget.style.background = 'transparent' }}
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                            {selectedSymbol}
                            {livePrice && <span style={{ color: '#10b981', fontSize: '20px' }}>₹{livePrice.toLocaleString()}</span>}
                        </h2>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', background: '#1e293b', padding: '4px', borderRadius: '10px' }}>
                        {intervals.map(int => (
                            <button
                                key={int.value}
                                onClick={() => setSelectedInterval(int.value)}
                                style={{
                                    padding: '6px 12px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: selectedInterval === int.value ? '#334155' : 'transparent',
                                    color: selectedInterval === int.value ? 'white' : '#94a3b8',
                                    cursor: 'pointer',
                                    fontSize: '13px',
                                    fontWeight: '500',
                                    transition: 'all 0.2s'
                                }}
                            >
                                {int.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div ref={chartContainerRef} style={{ width: '100%', flex: 1, borderRadius: '12px', overflow: 'hidden' }} />
            </div>
        </div>
    );
};


export default GoldChart;
