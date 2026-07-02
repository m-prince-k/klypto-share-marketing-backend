const { useState, useEffect, useMemo, useRef } = React;
const socketClient = window.io;

const FlashCell = ({ value, className }) => {
  const [flashClass, setFlashClass] = useState('');
  const prevValueRef = React.useRef(value);

  useEffect(() => {
    if (value !== prevValueRef.current && value !== '-' && value != null) {
      const numVal = parseFloat(value);
      const prevNum = parseFloat(prevValueRef.current);
      if (!isNaN(numVal) && !isNaN(prevNum)) {
        if (numVal > prevNum) {
          setFlashClass('bg-green-600 text-white font-extrabold scale-110 relative z-10 shadow-lg transition-none');
        } else if (numVal < prevNum) {
          setFlashClass('bg-red-600 text-white font-extrabold scale-110 relative z-10 shadow-lg transition-none');
        }

        const timer = setTimeout(() => {
          setFlashClass('transition-all duration-1000 ease-in-out');
        }, 400);

        prevValueRef.current = value;
        return () => clearTimeout(timer);
      }
      prevValueRef.current = value;
    }
  }, [value]);

  return <td className={`${className} ${flashClass}`}>{value || '-'}</td>;
};

const OptionChainUI = () => {
  const [liveData, setLiveData] = useState([]);
  const [selectedSymbol, setSelectedSymbol] = useState('');
  const [selectedExpiry, setSelectedExpiry] = useState('');
  const [isConnected, setIsConnected] = useState(false);

  const [symbols, setSymbols] = useState(['NIFTY', 'BANKNIFTY']);

  useEffect(() => {
    fetch('./targetSymbols.json')
      .then((res) => res.json())
      .then((data) => {
        let sortedSymbols = data;
        if (sortedSymbols.includes('NIFTY') && sortedSymbols.includes('BANKNIFTY')) {
          sortedSymbols = [
            'NIFTY',
            'BANKNIFTY',
            ...sortedSymbols.filter((symbol) => symbol !== 'NIFTY' && symbol !== 'BANKNIFTY'),
          ];
        }
        setSymbols(sortedSymbols);
        if (sortedSymbols.length > 0) {
          setSelectedSymbol(sortedSymbols[0]);
        }
      })
      .catch((err) => console.error('Error fetching symbols:', err));
  }, []);

  useEffect(() => {
    setIsConnected(true);

    const fetchData = async () => {
      try {
        const res = await fetch(`/api/ui-option-chain/api/option-chain?symbol=${selectedSymbol}`);
        const response = await res.json();
        if (response && response.success && response.data) {
          setLiveData(response.data);
        }
      } catch (err) {
        console.error("Error fetching option chain data:", err);
      }
    };

    fetchData(); // fetch immediately on mount or symbol change
    const interval = setInterval(fetchData, 2000); // Poll every 2 seconds

    return () => {
      clearInterval(interval);
    };
  }, [selectedSymbol]);

  // API already returns data filtered by symbol, so no need to re-filter
  const symbolData = useMemo(() => liveData, [liveData]);

  const expiries = useMemo(() => {
    const uniqueExpiries = [...new Set(symbolData.map((item) => item.expiry_date))];
    // Handle DDMMMYYYY format like "07JUL2026"
    const parseExpiry = (str) => {
      if (!str) return 0;
      const months = { JAN:0,FEB:1,MAR:2,APR:3,MAY:4,JUN:5,JUL:6,AUG:7,SEP:8,OCT:9,NOV:10,DEC:11 };
      const m = str.match(/^(\d{2})([A-Z]{3})(\d{4})$/);
      if (m) return new Date(parseInt(m[3]), months[m[2]], parseInt(m[1]));
      return new Date(str);
    };
    uniqueExpiries.sort((a, b) => parseExpiry(a) - parseExpiry(b));
    return uniqueExpiries;
  }, [symbolData]);

  useEffect(() => {
    if (expiries.length > 0) {
      if (!selectedExpiry || !expiries.includes(selectedExpiry)) {
        setSelectedExpiry(expiries[0]);
      }
    } else {
      setSelectedExpiry('');
    }
  }, [expiries, selectedExpiry]);

  const expiryData = useMemo(() => {
    return symbolData.filter((item) => item.expiry_date === selectedExpiry);
  }, [symbolData, selectedExpiry]);

  const optionChain = useMemo(() => {
    const chainMap = {};
    expiryData.forEach((item) => {
      // strike_price comes in paisa (x100) from the NFO master, divide to get actual price
      const rawStrike = parseFloat(item.strike_price);
      const strike = rawStrike > 10000 ? rawStrike / 100 : rawStrike;
      if (!chainMap[strike]) {
        chainMap[strike] = { strike_price: strike, CE: null, PE: null };
      }
      chainMap[strike][item.option_type] = { ...item, strike_price: strike };
    });
    return Object.values(chainMap).sort((a, b) => a.strike_price - b.strike_price);
  }, [expiryData]);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-2 font-sans overflow-x-hidden">
      <div className="w-full mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-center mb-8 bg-gray-800 p-5 rounded-xl shadow-lg border border-gray-700">
          <div>
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">
              Live Option Chain
            </h1>
            <div className="flex items-center mt-2 space-x-2">
              <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
              <span className="text-sm text-gray-400">
                {isConnected ? 'Live WebSocket Connected' : 'Disconnected'}
              </span>
            </div>
          </div>

          <div className="flex space-x-4 mt-4 md:mt-0">
            <div className="flex flex-col">
              <label className="text-xs text-gray-400 mb-1">Symbol</label>
              <select
                value={selectedSymbol}
                onChange={(e) => setSelectedSymbol(e.target.value)}
                className="bg-gray-700 border border-gray-600 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                {symbols.map((symbol) => (
                  <option key={symbol} value={symbol}>
                    {symbol}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col">
              <label className="text-xs text-gray-400 mb-1">Expiry Date</label>
              <select
                value={selectedExpiry}
                onChange={(e) => setSelectedExpiry(e.target.value)}
                className="bg-gray-700 border border-gray-600 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                disabled={expiries.length === 0}
              >
                {expiries.length > 0 ? (
                  expiries.map((expiry) => (
                    <option key={expiry} value={expiry}>
                      {expiry}
                    </option>
                  ))
                ) : (
                  <option>Waiting for data...</option>
                )}
              </select>
            </div>
          </div>
        </div>

        <div className="bg-gray-800 rounded-xl shadow-2xl overflow-hidden border border-gray-700">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-center whitespace-nowrap">
              <thead>
                <tr className="bg-gray-900 border-b border-gray-700 text-gray-300">
                  <th colSpan="13" className="py-3 bg-blue-900/20 border-r border-gray-700">CALLS (CE)</th>
                  <th className="py-3 bg-gray-800 border-r border-gray-700 w-32">STRIKE</th>
                  <th colSpan="13" className="py-3 bg-red-900/20">PUTS (PE)</th>
                </tr>
                <tr className="bg-gray-800 border-b border-gray-700 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  <th className="py-3 px-2 border-r border-gray-700/50 text-purple-400">Vega</th>
                  <th className="py-3 px-2 border-r border-gray-700/50 text-purple-400">Theta</th>
                  <th className="py-3 px-2 border-r border-gray-700/50 text-purple-400">Gamma</th>
                  <th className="py-3 px-2 border-r border-gray-700/50 text-purple-400">Delta</th>
                  <th className="py-3 px-2 border-r border-gray-700/50 text-yellow-400">IV</th>
                  <th className="py-3 px-2 border-r border-gray-700/50">OI</th>
                  <th className="py-3 px-2 border-r border-gray-700/50">Chng OI</th>
                  <th className="py-3 px-2 border-r border-gray-700/50">Vol</th>
                  <th className="py-3 px-2 border-r border-gray-700/50 text-gray-500">O</th>
                  <th className="py-3 px-2 border-r border-gray-700/50 text-gray-500">H</th>
                  <th className="py-3 px-2 border-r border-gray-700/50 text-gray-500">L</th>
                  <th className="py-3 px-2 border-r border-gray-700/50 text-gray-500">C</th>
                  <th className="py-3 px-2 border-r border-gray-700 text-blue-400">LTP</th>

                  <th className="py-3 px-4 border-r border-gray-700 bg-gray-900 text-white font-bold">Price</th>

                  <th className="py-3 px-2 border-r border-gray-700/50 text-red-400">LTP</th>
                  <th className="py-3 px-2 border-r border-gray-700/50 text-gray-500">O</th>
                  <th className="py-3 px-2 border-r border-gray-700/50 text-gray-500">H</th>
                  <th className="py-3 px-2 border-r border-gray-700/50 text-gray-500">L</th>
                  <th className="py-3 px-2 border-r border-gray-700/50 text-gray-500">C</th>
                  <th className="py-3 px-2 border-r border-gray-700/50">Vol</th>
                  <th className="py-3 px-2 border-r border-gray-700/50">Chng OI</th>
                  <th className="py-3 px-2 border-r border-gray-700/50">OI</th>
                  <th className="py-3 px-2 border-r border-gray-700/50 text-yellow-400">IV</th>
                  <th className="py-3 px-2 border-r border-gray-700/50 text-purple-400">Delta</th>
                  <th className="py-3 px-2 border-r border-gray-700/50 text-purple-400">Gamma</th>
                  <th className="py-3 px-2 border-r border-gray-700/50 text-purple-400">Theta</th>
                  <th className="py-3 px-2 text-purple-400">Vega</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {optionChain.length > 0 ? (
                  optionChain.map((row) => {
                    const ce = row.CE;
                    const pe = row.PE;
                    return (
                      <tr key={row.strike_price} className="hover:bg-gray-700/40 transition-colors">
                        <FlashCell value={ce?.vega} className="py-3 px-2 border-r border-gray-700/50 text-purple-300" />
                        <FlashCell value={ce?.theta} className="py-3 px-2 border-r border-gray-700/50 text-purple-300" />
                        <FlashCell value={ce?.gamma} className="py-3 px-2 border-r border-gray-700/50 text-purple-300" />
                        <FlashCell value={ce?.delta} className="py-3 px-2 border-r border-gray-700/50 text-purple-300" />
                        <FlashCell value={ce?.iv} className="py-3 px-2 border-r border-gray-700/50 text-yellow-300" />
                        <FlashCell value={ce?.oi} className="py-3 px-2 border-r border-gray-700/50" />
                        <FlashCell value={ce?.oi_change} className="py-3 px-2 border-r border-gray-700/50" />
                        <FlashCell value={ce?.volume} className="py-3 px-2 border-r border-gray-700/50" />
                        <FlashCell value={ce?.open} className="py-3 px-2 border-r border-gray-700/50 text-gray-400" />
                        <FlashCell value={ce?.high} className="py-3 px-2 border-r border-gray-700/50 text-green-400" />
                        <FlashCell value={ce?.low} className="py-3 px-2 border-r border-gray-700/50 text-red-400" />
                        <FlashCell value={ce?.close} className="py-3 px-2 border-r border-gray-700/50 text-gray-400" />
                        <FlashCell value={ce?.ltp} className="py-3 px-2 border-r border-gray-700 text-blue-300 font-bold" />

                        <td className="py-3 px-4 border-r border-gray-700 bg-gray-900 text-white font-bold">
                          {row.strike_price}
                        </td>

                        <FlashCell value={pe?.ltp} className="py-3 px-2 border-r border-gray-700/50 text-red-300 font-bold" />
                        <FlashCell value={pe?.open} className="py-3 px-2 border-r border-gray-700/50 text-gray-400" />
                        <FlashCell value={pe?.high} className="py-3 px-2 border-r border-gray-700/50 text-green-400" />
                        <FlashCell value={pe?.low} className="py-3 px-2 border-r border-gray-700/50 text-red-400" />
                        <FlashCell value={pe?.close} className="py-3 px-2 border-r border-gray-700/50 text-gray-400" />
                        <FlashCell value={pe?.volume} className="py-3 px-2 border-r border-gray-700/50" />
                        <FlashCell value={pe?.oi_change} className="py-3 px-2 border-r border-gray-700/50" />
                        <FlashCell value={pe?.oi} className="py-3 px-2 border-r border-gray-700/50" />
                        <FlashCell value={pe?.iv} className="py-3 px-2 border-r border-gray-700/50 text-yellow-300" />
                        <FlashCell value={pe?.delta} className="py-3 px-2 border-r border-gray-700/50 text-purple-300" />
                        <FlashCell value={pe?.gamma} className="py-3 px-2 border-r border-gray-700/50 text-purple-300" />
                        <FlashCell value={pe?.theta} className="py-3 px-2 border-r border-gray-700/50 text-purple-300" />
                        <FlashCell value={pe?.vega} className="py-3 px-2 text-purple-300" />
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="27" className="py-16 text-gray-500 text-lg">
                      {isConnected
                        ? 'Waiting for live option chain data...'
                        : 'Connecting to the live option chain feed...'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<OptionChainUI />);
