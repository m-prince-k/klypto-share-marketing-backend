const { useState, useEffect } = React;

const HistoricalDataUI = () => {
  const [fullMetadata, setFullMetadata] = useState(null);
  
  const [filters, setFilters] = useState({
    symbol: '',
    expiry_date: '',
    strike_price: '',
    option_type: 'CE',
    date: '' // Format YYYY-MM-DD
  });
  
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchHistoricalData = async (currentFilters = filters) => {
    setLoading(true);
    setError('');
    setData([]);
    try {
      const queryParams = new URLSearchParams();
      if (currentFilters.symbol) queryParams.append('symbol', currentFilters.symbol);
      if (currentFilters.expiry_date) queryParams.append('expiry_date', currentFilters.expiry_date);
      if (currentFilters.strike_price) queryParams.append('strike_price', currentFilters.strike_price);
      if (currentFilters.option_type) queryParams.append('option_type', currentFilters.option_type);
      if (currentFilters.date) queryParams.append('date', currentFilters.date);

      const response = await fetch(`/api/ui-option-chain/api/historical-data?${queryParams.toString()}`);
      const result = await response.json();
      
      if (result.success) {
        setData(result.data);
      } else {
        setError(result.message || 'Failed to fetch data');
      }
    } catch (err) {
      setError('Network error while fetching data.');
    }
    setLoading(false);
  };

  // Fetch metadata on mount to populate dropdowns
  useEffect(() => {
    fetch('/api/ui-option-chain/api/historical-metadata')
      .then(res => res.json())
      .then(res => {
        if (res.success && res.symbols.length > 0) {
          setFullMetadata(res);
          
          const firstSymbol = res.symbols[0];
          const symData = res.metadata[firstSymbol];
          
          const initialFilters = {
            ...filters,
            symbol: firstSymbol,
            expiry_date: symData.expiries[0] || '',
            strike_price: symData.strikes[0] || ''
          };
          
          setFilters(initialFilters);
          
          // Auto fetch data on first load!
          fetchHistoricalData(initialFilters);
        }
      })
      .catch(err => console.error('Failed to load metadata:', err));
  }, []);

  // Handle symbol change specifically to reset expiry and strike
  const handleSymbolChange = (e) => {
    const newSymbol = e.target.value;
    const symData = fullMetadata.metadata[newSymbol];
    
    setFilters(prev => ({
      ...prev,
      symbol: newSymbol,
      expiry_date: symData.expiries[0] || '',
      strike_price: symData.strikes[0] || ''
    }));
  };

  const handleFilterChange = (e) => {
    setFilters({ ...filters, [e.target.name]: e.target.value });
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 font-sans">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-center mb-6 border-b border-gray-800 pb-4">
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-500">
            Historical Data Explorer
          </h1>
          <a href="/" className="mt-4 md:mt-0 text-blue-400 hover:text-blue-300 underline text-sm transition-colors">
            &larr; Back to Live Option Chain
          </a>
        </div>

        {/* Filter Panel */}
        <div className="bg-gray-900 p-6 rounded-xl shadow-lg border border-gray-800 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            
            {/* Symbol Dropdown */}
            <div className="flex flex-col">
              <label className="text-xs text-gray-400 mb-1 font-semibold uppercase tracking-wider">Symbol</label>
              <select name="symbol" value={filters.symbol} onChange={handleSymbolChange} className="bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-500 outline-none">
                {fullMetadata && fullMetadata.symbols.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Expiry Dropdown */}
            <div className="flex flex-col">
              <label className="text-xs text-gray-400 mb-1 font-semibold uppercase tracking-wider">Expiry</label>
              <select name="expiry_date" value={filters.expiry_date} onChange={handleFilterChange} className="bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-500 outline-none">
                {fullMetadata && filters.symbol && fullMetadata.metadata[filters.symbol] && fullMetadata.metadata[filters.symbol].expiries.map(e => (
                  <option key={e} value={e}>{new Date(e).toDateString()}</option>
                ))}
              </select>
            </div>

            {/* Strike Price Dropdown */}
            <div className="flex flex-col">
              <label className="text-xs text-gray-400 mb-1 font-semibold uppercase tracking-wider">Strike Price</label>
              <select name="strike_price" value={filters.strike_price} onChange={handleFilterChange} className="bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-500 outline-none">
                {fullMetadata && filters.symbol && fullMetadata.metadata[filters.symbol] && fullMetadata.metadata[filters.symbol].strikes.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Option Type Dropdown */}
            <div className="flex flex-col">
              <label className="text-xs text-gray-400 mb-1 font-semibold uppercase tracking-wider">Type (CE/PE)</label>
              <select name="option_type" value={filters.option_type} onChange={handleFilterChange} className="bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-500 outline-none">
                <option value="CE">CALL (CE)</option>
                <option value="PE">PUT (PE)</option>
              </select>
            </div>

            {/* Date Picker */}
            <div className="flex flex-col">
              <label className="text-xs text-gray-400 mb-1 font-semibold uppercase tracking-wider">Historical Date</label>
              <input type="date" name="date" value={filters.date} onChange={handleFilterChange} className="bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-500 outline-none" />
            </div>

          </div>

          <div className="mt-6 flex justify-end">
            <button 
              onClick={fetchHistoricalData}
              disabled={loading}
              className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-8 rounded-lg shadow-lg transition-all transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Fetching...' : 'Get Historical Data'}
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* Data Table */}
        <div className="bg-gray-900 rounded-xl shadow-2xl overflow-hidden border border-gray-800">
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm text-center relative">
              <thead className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur-sm shadow-md">
                <tr className="border-b border-gray-800 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  <th className="py-4 px-4 border-r border-gray-800">Date/Time (IST)</th>
                  <th className="py-4 px-4 border-r border-gray-800">Symbol</th>
                  <th className="py-4 px-4 border-r border-gray-800">Strike</th>
                  <th className="py-4 px-4 border-r border-gray-800">Type</th>
                  <th className="py-4 px-4 border-r border-gray-800">LTP</th>
                  <th className="py-4 px-4 border-r border-gray-800 text-gray-500">Open</th>
                  <th className="py-4 px-4 border-r border-gray-800 text-green-500">High</th>
                  <th className="py-4 px-4 border-r border-gray-800 text-red-500">Low</th>
                  <th className="py-4 px-4 border-r border-gray-800 text-gray-500">Close</th>
                  <th className="py-4 px-4 border-r border-gray-800">Volume</th>
                  <th className="py-4 px-4 border-r border-gray-800">Chng OI</th>
                  <th className="py-4 px-4">OI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {data.length > 0 ? (
                  data.map((row, idx) => (
                    <tr key={idx} className="hover:bg-gray-800/40 transition-colors">
                      <td className="py-3 px-4 border-r border-gray-800/50 whitespace-nowrap text-gray-300">
                        {new Date(row.datetime_ist).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                      </td>
                      <td className="py-3 px-4 border-r border-gray-800/50 font-bold">{row.symbol}</td>
                      <td className="py-3 px-4 border-r border-gray-800/50 font-mono text-purple-300">{row.strike_price}</td>
                      <td className={`py-3 px-4 border-r border-gray-800/50 font-bold ${row.option_type === 'CE' ? 'text-blue-400' : 'text-red-400'}`}>
                        {row.option_type}
                      </td>
                      <td className="py-3 px-4 border-r border-gray-800/50 font-bold text-white bg-gray-800/30">
                        {row.ltp}
                      </td>
                      <td className="py-3 px-4 border-r border-gray-800/50 text-gray-400">{row.open}</td>
                      <td className="py-3 px-4 border-r border-gray-800/50 text-green-400/80">{row.high}</td>
                      <td className="py-3 px-4 border-r border-gray-800/50 text-red-400/80">{row.low}</td>
                      <td className="py-3 px-4 border-r border-gray-800/50 text-gray-400">{row.close}</td>
                      <td className="py-3 px-4 border-r border-gray-800/50">{row.volume}</td>
                      <td className="py-3 px-4 border-r border-gray-800/50">
                         <span className={row.oi_change > 0 ? 'text-green-400' : row.oi_change < 0 ? 'text-red-400' : ''}>
                            {row.oi_change}
                         </span>
                      </td>
                      <td className="py-3 px-4">{row.oi}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="12" className="py-16 text-gray-600 font-medium text-lg">
                      {loading ? 'Loading historical data...' : 'No data fetched yet. Select filters and click "Get Historical Data".'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {data.length > 0 && (
            <div className="bg-gray-950 p-4 border-t border-gray-800 text-sm text-gray-400 text-right">
              Showing <span className="font-bold text-white">{data.length}</span> records
            </div>
          )}
        </div>
        
      </div>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<HistoricalDataUI />);
