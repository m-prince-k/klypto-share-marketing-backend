import React, { useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries, LineSeries } from 'lightweight-charts';
import io from 'socket.io-client';

/**
 * Premium Live Trading Dashboard
 * Features: Live Symbol Switching, Indicator Selection, Fixed RSI Scale, and Real-time Sync.
 */
const LiveIndicatorChartDemo = () => {
    const chartContainerRef = useRef();
    const chartRef = useRef();
    const candleSeriesRef = useRef();
    const indicatorSeriesRef = useRef();
    const socketRef = useRef();

    // UI STATE
    const [symbol, setSymbol] = useState("NIFTY 19MAY2026 23450 CE");
    const [exchange, setExchange] = useState("NFO");
    const [interval, setIntervalVal] = useState("1m");
    const [indicatorType, setIndicatorType] = useState("RSI");
    
    const [currentPrice, setCurrentPrice] = useState(0);
    const [currentRSI, setCurrentRSI] = useState(0);
    const [connectionStatus, setConnectionStatus] = useState('Connecting...');

    // TRACK LAST TIMESTAMPS TO PREVENT "CANNOT UPDATE OLDEST DATA" ERROR
    const lastCandleTimeRef = useRef(0);
    const lastIndicatorTimeRef = useRef(0);

    const updateChart = () => {
        if (socketRef.current && socketRef.current.connected) {
            console.log(`Switching to ${symbol} | ${indicatorType}`);
            socketRef.current.emit("getLiveIndicatorUpdate", {
                type: indicatorType,
                symbol: symbol,
                interval: interval,
                exchange: exchange
            });
            
            // Reset trackers on switch
            lastCandleTimeRef.current = 0;
            lastIndicatorTimeRef.current = 0;
            
            if (candleSeriesRef.current) candleSeriesRef.current.setData([]);
            if (indicatorSeriesRef.current) indicatorSeriesRef.current.setData([]);
        }
    };

    useEffect(() => {
        if (!chartContainerRef.current) return;

        // 1. Initialize Chart
        const chart = createChart(chartContainerRef.current, {
            width: chartContainerRef.current.clientWidth,
            height: 500,
            layout: {
                background: { color: '#0f172a' },
                textColor: '#94a3b8',
                fontSize: 12,
            },
            grid: {
                vertLines: { color: 'rgba(51, 65, 85, 0.3)' },
                horzLines: { color: 'rgba(51, 65, 85, 0.3)' },
            },
            timeScale: {
                timeVisible: true,
                secondsVisible: false,
                borderColor: '#1e293b',
            },
            rightPriceScale: {
                borderColor: '#1e293b',
                autoScale: true,
            },
            leftPriceScale: {
                visible: true,
                borderColor: '#1e293b',
                autoScale: false,
            },
            crosshair: {
                mode: 0,
                vertLine: { color: '#6366f1', width: 1, style: 3, labelBackgroundColor: '#6366f1' },
                horzLine: { color: '#6366f1', width: 1, style: 3, labelBackgroundColor: '#6366f1' },
            },
        });
        chartRef.current = chart;

        chart.priceScale('left').applyOptions({ minValue: 0, maxValue: 100 });

        const candleSeries = chart.addSeries(CandlestickSeries, {
            upColor: '#10b981', downColor: '#ef4444', borderVisible: false,
            wickUpColor: '#10b981', wickDownColor: '#ef4444',
            priceFormat: { type: 'price', precision: 2, minMove: 0.05 },
        });
        candleSeriesRef.current = candleSeries;

        const indicatorSeries = chart.addSeries(LineSeries, {
            color: '#c084fc', lineWidth: 3, priceScaleId: 'left', title: indicatorType,
        });
        indicatorSeriesRef.current = indicatorSeries;

        indicatorSeries.createPriceLine({ price: 70, color: 'rgba(239, 68, 68, 0.7)', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'OB' });
        indicatorSeries.createPriceLine({ price: 30, color: 'rgba(16, 185, 129, 0.7)', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'OS' });

        socketRef.current = io("http://localhost:7000");

        socketRef.current.on("connect", () => {
            setConnectionStatus('Live');
            updateChart();
        });

        socketRef.current.on("disconnect", () => setConnectionStatus('Disconnected'));

        socketRef.current.on("liveticks", (tick) => {
            if (tick.symbol.toUpperCase() === symbol.toUpperCase() && candleSeriesRef.current) {
                const tickData = tick.data;
                if (tickData) {
                    const time = Number(tickData.time);
                    const close = Number(tickData.close || tickData.last_traded_price || tickData.ltp);
                    
                    // TIMESTAMP GUARD
                    if (!isNaN(time) && !isNaN(close) && time >= lastCandleTimeRef.current) {
                        const open = Number(tickData.open ?? close);
                        const high = Number(tickData.high ?? close);
                        const low = Number(tickData.low ?? close);
                        
                        candleSeriesRef.current.update({ time, open, high, low, close });
                        setCurrentPrice(close);
                        lastCandleTimeRef.current = time;
                    }
                }
            }
        });

        socketRef.current.on("liveIndicatorResponse", (res) => {
            const isMatch = res.symbol?.trim().toUpperCase() === symbol.trim().toUpperCase() && 
                           res.type?.trim().toUpperCase() === indicatorType.trim().toUpperCase();

            if (isMatch && indicatorSeriesRef.current) {
                const data = res.data;
                if (res.isLivePush) {
                    const latest = data[0];
                    const time = Number(latest.time);
                    const value = Number(latest[indicatorType.toLowerCase()] ?? latest[indicatorType.toUpperCase()] ?? latest.value ?? latest.rsi ?? 0);

                    // TIMESTAMP GUARD
                    if (!isNaN(time) && !isNaN(value) && time >= lastIndicatorTimeRef.current) {
                        indicatorSeriesRef.current.update({ time, value });
                        setCurrentRSI(value);
                        lastIndicatorTimeRef.current = time;
                        
                        const price = Number(latest.close || latest.last_traded_price || latest.ltp);
                        if (!isNaN(price) && time >= lastCandleTimeRef.current) {
                            candleSeriesRef.current.update({
                                time,
                                open: Number(latest.open ?? price),
                                high: Number(latest.high ?? price),
                                low: Number(latest.low ?? price),
                                close: price
                            });
                            setCurrentPrice(price);
                            lastCandleTimeRef.current = time;
                        }
                    }
                } else {
                    const validData = data.filter(d => !isNaN(Number(d.time))).sort((a, b) => Number(a.time) - Number(b.time));
                    
                    const candles = validData.map(d => {
                        const p = Number(d.close || d.last_traded_price);
                        return { time: Number(d.time), open: Number(d.open ?? p), high: Number(d.high ?? p), low: Number(d.low ?? p), close: p };
                    }).filter(c => !isNaN(c.close));
                    candleSeriesRef.current.setData(candles);
                    if (candles.length > 0) lastCandleTimeRef.current = candles[candles.length - 1].time;

                    const rsiPoints = validData.map(d => ({
                        time: Number(d.time),
                        value: Number(d[indicatorType.toLowerCase()] ?? d[indicatorType.toUpperCase()] ?? d.value ?? d.rsi ?? 0)
                    })).filter(r => !isNaN(r.value));
                    indicatorSeriesRef.current.setData(rsiPoints);
                    if (rsiPoints.length > 0) lastIndicatorTimeRef.current = rsiPoints[rsiPoints.length - 1].time;

                    if (rsiPoints.length > 0) setCurrentRSI(rsiPoints[rsiPoints.length - 1].value);
                    if (candles.length > 0) setCurrentPrice(candles[candles.length - 1].close);
                    chart.timeScale().fitContent();
                }
            }
        });

        const handleResize = () => {
            if (chartRef.current && chartContainerRef.current) {
                chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
            }
        };
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            if (socketRef.current) socketRef.current.disconnect();
            if (chartRef.current) chartRef.current.remove();
        };
    }, [symbol, exchange, interval, indicatorType]);

    return (
        <div style={{ background: '#0f172a', padding: '24px', borderRadius: '16px', border: '1px solid #1e293b', fontFamily: 'Inter, system-ui, sans-serif', color: 'white' }}>
            {/* CONTROL PANEL */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '20px', background: '#1e293b', padding: '16px', borderRadius: '12px' }}>
                <div style={{ flex: '1', minWidth: '200px' }}>
                    <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>SYMBOL</label>
                    <input 
                        value={symbol} 
                        onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                        style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', color: 'white', padding: '8px', borderRadius: '6px' }}
                    />
                </div>
                <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>EXCHANGE</label>
                    <select value={exchange} onChange={(e) => setExchange(e.target.value)} style={{ background: '#0f172a', border: '1px solid #334155', color: 'white', padding: '8px', borderRadius: '6px' }}>
                        <option value="NSE">NSE</option>
                        <option value="NFO">NFO</option>
                        <option value="MCX">MCX</option>
                        <option value="BSE">BSE</option>
                    </select>
                </div>
                <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>INDICATOR</label>
                    <select value={indicatorType} onChange={(e) => setIndicatorType(e.target.value)} style={{ background: '#0f172a', border: '1px solid #334155', color: 'white', padding: '8px', borderRadius: '6px' }}>
                        <option value="RSI">RSI</option>
                        <option value="SMA">SMA</option>
                        <option value="EMA">EMA</option>
                        <option value="VWAP">VWAP</option>
                    </select>
                </div>
                <button 
                    onClick={updateChart}
                    style={{ background: '#6366f1', color: 'white', border: 'none', padding: '0 20px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', marginTop: '18px' }}
                >
                    Apply
                </button>
            </div>

            {/* HEADER */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '20px' }}>{symbol} <span style={{ color: '#64748b', fontSize: '14px' }}>({exchange})</span></h2>
                    <span style={{ color: connectionStatus === 'Live' ? '#10b981' : '#ef4444', fontSize: '12px' }}>● {connectionStatus}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ color: '#10b981', fontSize: '28px', fontWeight: '800' }}>₹{currentPrice.toLocaleString()}</div>
                    <div style={{ color: '#c084fc', fontSize: '16px', fontWeight: '600' }}>{indicatorType}: {currentRSI.toFixed(2)}</div>
                </div>
            </div>

            <div ref={chartContainerRef} style={{ width: '100%', height: '500px', borderRadius: '12px', overflow: 'hidden' }} />
            
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', color: '#64748b', fontSize: '12px' }}>
                <span>Left: {indicatorType} (0-100)</span>
                <span>Right: Price</span>
            </div>
        </div>
    );
};

export default LiveIndicatorChartDemo;
