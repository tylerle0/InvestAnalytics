import { use, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { UserAuth } from "../context/AuthContext";
import { supabase } from "../context/supabaseClient";

const backgroundSVG = (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 1 }}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="glow" cx="50%" cy="50%" r="80%" fx="50%" fy="50%">
          <stop offset="0%" stopColor="#00ffe7" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#000000" stopOpacity="1" />
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#glow)" />
      <g stroke="#00ffe7" strokeOpacity="0.3">
        <circle cx="8%" cy="20%" r="2.5" fill="#00ffe7" fillOpacity="0.6" />
        <circle cx="92%" cy="80%" r="2.5" fill="#00ffe7" fillOpacity="0.6" />
        <circle cx="50%" cy="50%" r="3.5" fill="#00ffe7" fillOpacity="0.6" />
        <circle cx="30%" cy="70%" r="2" fill="#00ffe7" fillOpacity="0.6" />
        <circle cx="70%" cy="30%" r="2" fill="#00ffe7" fillOpacity="0.6" />
        <line x1="8%" y1="20%" x2="50%" y2="50%" strokeWidth="1" />
        <line x1="50%" y1="50%" x2="92%" y2="80%" strokeWidth="1" />
        <line x1="30%" y1="70%" x2="70%" y2="30%" strokeWidth="1" />
        <line x1="8%" y1="20%" x2="70%" y2="30%" strokeWidth="1" />
        <line x1="30%" y1="70%" x2="92%" y2="80%" strokeWidth="1" />
      </g>
    </svg>
);


const CurrencyDetail = () => {
    const { ticker } = useParams();
    const navigate = useNavigate();
    const { session } = UserAuth() || {};
    const polygonAPI = import.meta.env.VITE_POLYGON_API_KEY;
    const apiBaseURL = import.meta.env.VITE_API_URL;

    const [loading, setLoading] = useState(true);
    const [addingToWatchlist, setAddingToWatchlist] = useState(false);
    const [currencyData, setCurrencyData] = useState(null);
    const [livePrice, setLivePrice] = useState(null);
    const [isInWatchlist, setIsInWatchlist] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [confidence, setConfidence] = useState(null);
    const [priceChange, setPriceChange] = useState({ amount: 0, percentage: 0 });
    const [priceUpdated, setPriceUpdated] = useState(false);
    const cryptoCoins = [
        'BTC', 'ETH', 'XRP', 'HBAR', 'SOL', 'DOGE', 'ADA'
    ];
    const [liveConnection, setLiveConnection] = useState(false);

    useEffect( () => {
        const upperSymbol = ticker?.toUpperCase();
        const isCrypto = cryptoCoins.includes(upperSymbol);

        if (!isCrypto || !ticker) return;

        let ws: WebSocket | null = null;
        let reconnectTimeout: NodeJS.Timeout | null = null;
        let pingTimeout: NodeJS.Timeout | null = null;
        let isComponentMounted = true;
        
        const connectWebSocket = () => {
            if(!isComponentMounted) return;

            const symbol = `${ticker.toLowerCase()}usdt`;

            ws = new WebSocket(`wss://fstream.binance.com/ws/${symbol}@miniTicker`);

            const returnPong = () => {
                if(pingTimeout) clearTimeout(pingTimeout);
                pingTimeout = setTimeout(() => {
                    console.log("Ping timeout");
                    if(ws) ws.close();
                }, 60000);
            }

            ws.onopen = () => {
                console.log(`Connected to ${ticker.toUpperCase()} WebSocket`);
                setLiveConnection(true);
                returnPong();
            };
            
            ws.onmessage = (event) => {
                try {

                    returnPong();

                if(typeof event.data === 'string'){
                    const data = JSON.parse(event.data);
                    console.log('Websocket data:', data);

                    if(data.ping){
                        console.log("Received ping, sending pong");
                        ws?.send(JSON.stringify({pong: data.ping}));
                        return;
                    }

                    console.log('WebSocket data received:', data);
                    
                    if (data.e === '24hrMiniTicker' && data.c) {
                        const price = parseFloat(data.c);
                        if (!isNaN(price) && price > 0) {
                            setLivePrice(price);
                            setPriceUpdated(true);

                            setTimeout(() => setPriceUpdated(false), 1000)
                            console.log(`${ticker.toUpperCase()} live price: $${price.toFixed(2)}`);
                        }
                    }
                }else{
                    console.log("might be ping");
                }
                } catch (err) {
                    console.error('Error parsing WebSocket data:', err);
                }
            };

            ws.onerror = (error) => {
                console.error(`WebSocket error for ${ticker}:`, error);
                setLiveConnection(false);
            };

            ws.onclose = (event) => {
                console.log(`WebSocket closed - Code: ${event.code}, Reason: ${event.reason || 'None'}`);
                setLiveConnection(false);

                // Only reconnect if component is still mounted and not a normal close
                if (isComponentMounted && event.code !== 1000) {
                    console.log('Reconnecting in 3 seconds...');
                    reconnectTimeout = setTimeout(connectWebSocket, 3000);
                }
            };

        };
        connectWebSocket();

        return () => {
            console.log(`Cleaning up WebSocket for ${ticker}`);
            isComponentMounted = false;
            setLiveConnection(false);

            if (reconnectTimeout) 
                clearTimeout(reconnectTimeout);
            if(pingTimeout)
                clearTimeout(pingTimeout);
            

            if (ws) {
                ws.close(1000, 'Component unmounting');
                ws = null;
            }
        };
    }, [ticker]);

    useEffect(() => {
        const fetchPrediction = async () => {
            try {
                let upperSymbol = ticker?.toUpperCase();
                const isCrypto = cryptoCoins.includes(upperSymbol);
                if(isCrypto)
                    upperSymbol += "-USD";
                console.log(upperSymbol);

                const predictionRes = await fetch(`${apiBaseURL}/api/predictions?symbol=${upperSymbol}`);
                
                if (!predictionRes.ok) {
                    throw new Error(`status: ${predictionRes.status}`);
                }

                const predictionData = await predictionRes.json();
                
                // Fetch data from the ticker-specific gen_info table
                let dbSymbol = upperSymbol?.replace('-', '_').toLowerCase();
                const tableName = `${dbSymbol.toLowerCase()}_gen_info`;
                const { data: genInfoData, error: genInfoError } = await supabase
                    .from(tableName)
                    .select('last_close, price_change, rationale, confidence, market_cap')
                    .order('last_update', { ascending: false })
                    .limit(1)
                    .single();

                let watchlistData = null;
                if (session) {
                    const { data } = await supabase
                        .from('watchlist')
                        .select('*')
                        .eq('user_id', session.user.id)
                        .eq('symbol', upperSymbol);
                    watchlistData = data;
                    console.log("User currently signed in.");
                }

                // fixed multiple re-renders
                if (genInfoData && !genInfoError) {
                    const marketOutlookPrice = genInfoData.last_close + genInfoData.price_change;
                    let calculatedOutlook = 'stable';
                    if (genInfoData.price_change > 0) {
                        calculatedOutlook = 'raise';
                    } else if (genInfoData.price_change < 0) {
                        calculatedOutlook = 'drop';
                    }
                    setCurrencyData({
                        ...predictionData,
                        info: {
                            ...predictionData?.info,
                            reasoning: genInfoData.rationale,
                            outlook: calculatedOutlook,
                            predicted_price: marketOutlookPrice,
                            market_cap: genInfoData.market_cap
                        }
                    });
                    
                    // Testing for now.
                    if (!isCrypto) {
                        setLivePrice(genInfoData.last_close);
                    } else if (!livePrice) {
                        setLivePrice(genInfoData.last_close);
                    }
                    
                    setPriceChange({
                        amount: genInfoData.price_change,
                        percentage: (genInfoData.price_change / genInfoData.last_close) * 100
                    });
                    setConfidence(genInfoData.confidence);
                    console.log("Got info from gen_info");
                } else {
                    setCurrencyData(predictionData);
                    if (genInfoError) {
                        console.error('Error fetching gen_info data:', genInfoError);
                        if (genInfoError.message?.includes('relation') && genInfoError.message?.includes('does not exist')) {
                            console.log(`Table ${tableName} does not exist yet`);
                        }
                    }
                }

                setIsInWatchlist(watchlistData && watchlistData.length > 0);
                
                console.log('Full API response:', predictionData);
                console.log('Outlook value:', predictionData?.info?.outlook);
                console.log('Outlook type:', typeof predictionData?.info?.outlook);
                
                setLoading(false);
            } catch (err) {
                console.error("Error fetching data: ", err);
                setError("Error fetching data.");
                setLoading(false);
            }
        };

        fetchPrediction();
    }, [ticker, session?.user?.id]);

    // TradingView Widget Effect
    useEffect(() => {
        if (!ticker || loading) return;

        const getTradingViewSymbol = (symbol: string) => {
            const upperSymbol = symbol.toUpperCase();
            if (cryptoCoins.includes(upperSymbol)) {
                return `BINANCE:${upperSymbol}USD`;
            }
            return `NASDAQ:${upperSymbol}`;
        };

        // Clear existing widget
        const container = document.getElementById('tradingview-widget');
        if (container) {
            container.innerHTML = '';
        }

        // Create and configure the script
        const script = document.createElement('script');
        script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
        script.type = 'text/javascript';
        script.async = true;
        script.innerHTML = JSON.stringify({
            "autosize": true,
            "symbol": getTradingViewSymbol(ticker),
            "interval": "D",
            "timezone": "Etc/UTC",
            "theme": "dark",
            "style": "1",
            "locale": "en",
            "enable_publishing": false,
            "backgroundColor": "rgba(19, 23, 34, 1)",
            "gridColor": "rgba(42, 46, 57, 0.5)",
            "hide_top_toolbar": false,
            "hide_legend": false,
            "save_image": false,
            "container_id": "tradingview-widget"
        });

        if (container) {
            container.appendChild(script);
        }

        return () => {
            if (container) {
                container.innerHTML = '';
            }
        };
    }, [ticker, loading]);
    

    const handleAddToWatchlist = async () => {
        if (!session) {
            navigate('/signup');
            return;
        }
        
        setAddingToWatchlist(true);
        try {
            const currentPrice = livePrice || getCurrentPrice();
            let upperSymbol = ticker?.toUpperCase();
            if(cryptoCoins.includes(upperSymbol))
                upperSymbol += '-USD';
            const { error } = await supabase
                .from('watchlist')
                .insert([{
                    user_id: session.user.id,
                    symbol: upperSymbol,
                    current_price: currentPrice,
                    price_change: priceChange.percentage
                }]);
                
            if (error) throw error;
            setIsInWatchlist(true);
        } catch (err) {
            console.error('Error adding to watchlist:', err);
        } finally {
            setAddingToWatchlist(false);
        }
    };

    const formatMarketCap = (marketCap: number | null | undefined): string => {
        if (!marketCap || marketCap === 0) return 'N/A';
        
        const billion = 1_000_000_000;
        const million = 1_000_000;
        const trillion = 1_000_000_000_000;
    
        if (marketCap >= trillion) {
            return `$${(marketCap / trillion).toFixed(2)}T`;
        } else if (marketCap >= billion) {
            return `$${(marketCap / billion).toFixed(2)}B`;
        } else if (marketCap >= million) {
            return `$${(marketCap / million).toFixed(2)}M`;
        } else {
            return `$${marketCap.toLocaleString()}`;
        }
    };

    const handleRemoveFromWatchlist = async () => {
        if (!session) return;
        
        let upperSymbol = ticker?.toUpperCase();
        if(cryptoCoins.includes(upperSymbol))
            upperSymbol += '-USD';
        setAddingToWatchlist(true);
        try {
            const { error } = await supabase
                .from('watchlist')
                .delete()
                .eq('user_id', session.user.id)
                .eq('symbol', upperSymbol);
                
            if (error) throw error;
            setIsInWatchlist(false);
        } catch (err) {
            console.error('Error removing from watchlist:', err);
        } finally {
            setAddingToWatchlist(false);
        }
    };

    const getCurrentPrice = () => {
        if (!currencyData?.prices) return 0;
        const latestDate = Object.keys(currencyData.prices).sort().pop();
        return currencyData.prices[latestDate]?.[2] || 0; // Close price
    };

    const getLatestPrices = () => {
        if (!currencyData?.prices) return { high: 0, low: 0, close: 0 };

        const currentDate = new Date();
        currentDate.setHours(0,0,0,0);

        const historicalEntries = Object.entries(currencyData.prices)
            .filter(([date]) => new Date(date) <= currentDate)
            .sort( ([a], [b]) => new Date(b).getTime() - new Date(a).getTime());
        
        if(historicalEntries.length === 0)
            return {high: 0, low: 0, close: 0};

        const [latestDate, prices] = historicalEntries[0];
        return {
            high: prices?.[0] || 0,  // High price
            low: prices?.[1] || 0,   // Low price  
            close: prices?.[2] || 0  // Close price
        };
    };

    if (error) {
        return (
            <div className="min-h-screen bg-black pt-24 p-6 text-white flex justify-center items-center">
                <div className="text-red-400 text-xl">{error}</div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-black pt-24 p-6 text-white flex justify-center items-start">
                <div className="animate-pulse text-yellow-400 text-xl">Loading {ticker} data...</div>
            </div>
        );
    }

    const latestPrices = getLatestPrices();
    const displayPrice = livePrice || latestPrices.close;

    const priceGlowStyle = {
    textShadow: priceUpdated 
        ? '0 0 10px rgba(250, 204, 21, 0.8), 0 0 20px rgba(250, 204, 21, 0.6)' 
        : 'none',
    transition: 'text-shadow 0.2s ease-in-out'
    };
    return (
        <div className="min-h-screen pt-24 p-6 text-white relative overflow-hidden" style={{ background: '#000000' }}>
            {backgroundSVG}
            <div className="max-w-7xl mx-auto relative z-10">
                {/* Header Section */}
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8">
                    <div className="mb-4 lg:mb-0">
                        <h1 className="text-4xl font-bold text-yellow-400 mb-2">{ticker?.toUpperCase()}</h1>
                        <div className="flex items-center space-x-4">
                            <span 
                                className={`text-3xl font-mono ${priceUpdated ? 'text-yellow-400' : 'text-white'}`}
                                style={priceGlowStyle}
                            >
                                ${displayPrice.toFixed(2)}
                            </span>
                            <div className={`flex items-center space-x-1 ${priceChange.amount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                <span className="text-lg">
                                    {priceChange.amount >= 0 ? '▲' : '▼'}
                                </span>
                                <span className="text-lg font-medium">
                                    {Math.abs(priceChange.percentage).toFixed(2)}%
                                </span>
                            </div>
                        </div>
                    </div>
                    
                    {/* Watchlist Button */}
                    <button
                        onClick={isInWatchlist ? handleRemoveFromWatchlist : handleAddToWatchlist}
                        disabled={addingToWatchlist}
                        className={`px-6 py-3 rounded-lg font-medium transition-all ${
                            isInWatchlist 
                                ? 'bg-red-600 hover:bg-red-700 text-white' 
                                : 'bg-yellow-500 hover:bg-yellow-600 text-black'
                        } disabled:opacity-50`}
                    >
                        {addingToWatchlist ? 'Loading...' : (isInWatchlist ? 'Remove from Watchlist' : 'Add to Watchlist')}
                    </button>
                </div>

                {/* Main Content Grid */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                    {/* TradingView Chart*/}
                    <div className="xl:col-span-2">
                        <div className="bg-gray-900 rounded-xl p-6 shadow-lg border border-gray-800">
                            <h2 className="text-xl font-semibold mb-4 text-yellow-400">Interactive Chart</h2>
                            <div className="tradingview-widget-container" style={{ height: '500px' }}>
                                <div id="tradingview-widget" style={{ height: '100%', width: '100%' }}></div>
                            </div>
                        </div>
                    </div>

                    {/* Price Info and Prediction  */}
                    <div className="space-y-6">
                        {/* Current Price Info */}
                        <div className="bg-gray-900 rounded-xl p-6 shadow-lg border border-gray-800">
                            <h2 className="text-xl font-semibold mb-4 text-yellow-400">Price Information</h2>
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-gray-800 p-3 rounded-lg">
                                        <div className="text-sm text-gray-400">Current</div>
                                        <div className="text-xl font-mono">${displayPrice.toFixed(2)}</div>
                                    </div>
                                    <div className="bg-gray-800 p-3 rounded-lg">
                                        <div className="text-sm text-gray-400">High</div>
                                        <div className="text-xl font-mono">${latestPrices.high.toFixed(2)}</div>
                                    </div>
                                    <div className="bg-gray-800 p-3 rounded-lg">
                                        <div className="text-sm text-gray-400">Low</div>
                                        <div className="text-xl font-mono">${latestPrices.low.toFixed(2)}</div>
                                    </div>
                                    <div className="bg-gray-800 p-3 rounded-lg">
                                        <div className="text-sm text-gray-400">Market Cap</div>
                                        <div className="text-xl">{formatMarketCap(currencyData?.info?.market_cap)}</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* AI Prediction */}
                        <div className="bg-gray-900 rounded-xl p-6 shadow-lg border border-gray-800">
                            <h2 className="text-xl font-semibold mb-4 text-yellow-400">AI Prediction</h2>
                            <div className="space-y-4">
                                <div className="text-center">
                                    <div className={`text-2xl font-bold mb-2 ${
                                        String(currencyData?.info?.predicted_price || '').toLowerCase() === 'raise' ? 'text-green-400' :
                                        String(currencyData?.info?.predicted_price || '').toLowerCase() === 'drop' ? 'text-red-400' : 'text-gray-400'
                                    }`}>
                                        ${String(currencyData?.info?.predicted_price.toFixed(2) || 'stable').toUpperCase()}
                                    </div>
                                    <div className="text-gray-400 text-sm">Market Outlook: {currencyData?.info?.outlook}</div>
                                </div>
                                
                                <div className="mb-4">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-sm text-gray-400">Confidence</span>
                                        <span className="text-sm font-medium">{confidence || 0}%</span>
                                    </div>
                                    <div className="w-full bg-gray-700 rounded-full h-3">
                                        <div 
                                            className="bg-yellow-500 h-3 rounded-full transition-all duration-300" 
                                            style={{ width: `${confidence || 0}%` }}
                                        ></div>
                                    </div>
                                </div>
                                
                                <div className="bg-gray-800 p-4 rounded-lg">
                                    <h4 className="text-sm font-semibold mb-2 text-yellow-400">Analysis</h4>
                                    <p className="text-sm text-gray-300">
                                        {currencyData?.info?.reasoning || "Our AI analyzes market trends, sentiment, and technical indicators to provide predictions."}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Predictions Timeline */}
                {currencyData?.prices && (
                    <div className="mt-8">
                        <div className="bg-gray-900 rounded-xl p-6 shadow-lg border border-gray-800">
                            <h2 className="text-xl font-semibold mb-6 text-yellow-400">Price Predictions & History</h2>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-gray-700">
                                            <th className="text-left py-3 px-4 text-gray-400">Date</th>
                                            <th className="text-left py-3 px-4 text-gray-400">High</th>
                                            <th className="text-left py-3 px-4 text-gray-400">Low</th>
                                            <th className="text-left py-3 px-4 text-gray-400">Close</th>
                                            <th className="text-left py-3 px-4 text-gray-400">Type</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {Object.entries(currencyData.prices)
                                            .sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime())
                                            .slice(0, 10)
                                            .map(([date, values]) => {
                                                const isPrediction = new Date(date) > new Date();
                                                return (
                                                    <tr key={date} className="border-b border-gray-800 hover:bg-gray-800 transition-colors">
                                                        <td className="py-3 px-4">{new Date(date).toLocaleDateString()}</td>
                                                        <td className="py-3 px-4 font-mono">${values[2]?.toFixed(2)}</td>
                                                        <td className="py-3 px-4 font-mono">${values[1]?.toFixed(2)}</td>
                                                        <td className="py-3 px-4 font-mono">${values[0]?.toFixed(2)}</td>
                                                        <td className="py-3 px-4">
                                                            <span className={`px-2 py-1 rounded text-xs ${
                                                                isPrediction 
                                                                    ? 'bg-yellow-500 text-black' 
                                                                    : 'bg-gray-700 text-gray-300'
                                                            }`}>
                                                                {isPrediction ? 'Prediction' : 'Historical'}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}


export default CurrencyDetail;