import React, { useEffect, useRef, useState } from 'react';
import {CandlestickSeries,createChart} from 'lightweight-charts';
import io from 'socket.io-client';

const GoldChart = () => {
    const chartContainerRef = useRef();
    const chartRef = useRef();
    const seriesRef = useRef();
    const [selectedGold, setSelectedGold] = useState('GOLD');

    useEffect(() => {
        if (!chartContainerRef.current) return;

        // 1. Initialize Chart
        chartRef.current =createChart(chartContainerRef.current, {
            width: chartContainerRef.current.clientWidth || 800,
            height: 500,
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
            },
        });

        seriesRef.current = chartRef.current.addSeries(CandlestickSeries,{
            upColor: '#10b981',
            downColor: '#ef4444',
            borderDownColor: '#ef4444',
            borderUpColor: '#10b981',
            wickDownColor: '#ef4444',
            wickUpColor: '#10b981',
        });

        // 2. Setup WebSocket Listener (No REST API fetch)
        const socket = io("http://localhost:7000/equity/commodity/gold/live?interval=1m&fromDate=2026-04-01&toDate=2026-05-06");

        socket.on("goldUpdate", (payload) => {
            console.log("[Socket] Received Live Gold Update");
            if (payload.success && payload.data) {
                const contractData = payload.data.find(d => d.name === selectedGold);
                if (contractData && contractData.data && seriesRef.current) {
                    // Map full history from socket payload if chart is empty
                    // or just update if it already has data
                    const formattedData = contractData.data.map(c => ({
                        time: Math.floor(new Date(c.timestamp).getTime() / 1000),
                        open: parseFloat(c.open),
                        high: parseFloat(c.high),
                        low: parseFloat(c.low),
                        close: parseFloat(c.close),
                    })).sort((a, b) => a.time - b.time);

                    seriesRef.current.setData(formattedData);
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
            socket.disconnect();
            window.removeEventListener('resize', handleResize);
            if (chartRef.current) chartRef.current.remove();
        };
    }, [selectedGold]);

    return (
        <div style={{ padding: '20px', background: '#0f172a', borderRadius: '12px', color: 'white', maxWidth: '1000px', margin: '20px auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                <h2 style={{ color: '#f59e0b' }}>🔥 Gold Real-time (WebSocket ONLY)</h2>
                <select value={selectedGold} onChange={(e) => setSelectedGold(e.target.value)} style={{ background: '#1e293b', color: 'white', padding: '8px', borderRadius: '8px' }}>
                    <option value="GOLD">GOLD</option>
                    <option value="GOLDM">GOLDM</option>
                    <option value="GOLDPETAL">GOLDPETAL</option>
                    <option value="GOLDGUINEA">GOLDGUINEA</option>
                </select>
            </div>
            <div ref={chartContainerRef} style={{ width: '100%', height: '500px' }} />
        </div>
    );
};

export default GoldChart;
