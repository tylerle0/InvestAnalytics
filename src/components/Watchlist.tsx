import { useState, useEffect } from "react";
import { UserAuth } from "../context/AuthContext";
import { supabase } from "../context/supabaseClient";
import trash from "../assets/trash-can-icon-white.png";

const backgroundSVG = (
  <svg
    className="fixed inset-0 w-full h-full pointer-events-none"
    style={{ zIndex: -1 }}
    aria-hidden="true"
  >
    <defs>
      <radialGradient id="glow" cx="50%" cy="50%" r="80%" fx="50%" fy="50%">
        <stop offset="0%" stopColor="#00ffe7" stopOpacity="0.15" />
        <stop offset="100%" stopColor="#10131a" stopOpacity="0.7" />
      </radialGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#glow)" />
    <g stroke="#00ffe7" strokeOpacity="0.18">
      <circle cx="8%" cy="20%" r="2.5" fill="#00ffe7" />
      <circle cx="92%" cy="80%" r="2.5" fill="#00ffe7" />
      <circle cx="50%" cy="50%" r="3.5" fill="#00ffe7" />
      <circle cx="30%" cy="70%" r="2" fill="#00ffe7" />
      <circle cx="70%" cy="30%" r="2" fill="#00ffe7" />
      <line x1="8%" y1="20%" x2="50%" y2="50%" />
      <line x1="50%" y1="50%" x2="92%" y2="80%" />
      <line x1="30%" y1="70%" x2="70%" y2="30%" />
      <line x1="8%" y1="20%" x2="70%" y2="30%" />
      <line x1="30%" y1="70%" x2="92%" y2="80%" />
    </g>
  </svg>
);

const Watchlist = () => {
  const { session } = UserAuth() || {};
  const [watchListItems, setWatchListItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addLoading, setAddLoading] = useState(false);
  const [showAddTicker, setShowAddTicker] = useState(false);
  const [loadingText, setLoadingText] = useState("Fetching watchlist...");
  const [addLoadingText, setAddLoadingText] = useState(
    "Getting historical information..."
  );
  const [existanceError, setExistanceError] = useState(false);
  const cryptoCoins = [
        'BTC', 'ETH', 'XRP', 'HBAR', 'SOL', 'DOGE', 'ADA'
    ];
  const apiBaseURL = import.meta.env.VITE_API_URL;

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

  // Array of loading messages
  const addingMessages = [
    "Getting historical information...",
    "Getting social media sentiment...",
    "Getting recent news data...",
    "Analyzing...",
  ];

  // Effect to cycle through loading messages
  useEffect(() => {
    if (!addLoading) return;

    let messageIndex = 0;
    setAddLoadingText(addingMessages[0]);
    const interval = setInterval(() => {
      if (messageIndex < addingMessages.length - 1) {
        messageIndex++;
      }
      setAddLoadingText(addingMessages[messageIndex]);
    }, 8000);

    return () => clearInterval(interval);
  }, [addLoading]);

  const fetchWatchlist = async () => {
    if (!session) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadingText("Fetching watchlist...");

    try {
      // First, get the watchlist items from Supabase
      const { data: watchlistData, error: watchlistError } = await supabase
        .from("watchlist")
        .select("*")
        .eq("user_id", session.user.id);

      if (watchlistError) {
        console.error("Error fetching watchlist:", watchlistError);
        setLoading(false);
        return;
      }

      if (!watchlistData || watchlistData.length === 0) {
        setWatchListItems([]);
        setLoading(false);
        return;
      }

      // For each ticker in the watchlist, fetch prediction data
      const enrichedItems = await Promise.all(
        watchlistData.map(async (item) => {
          try {
            if(cryptoCoins.includes(item.symbol.toUpperCase()))
                    item.symbol += "-USD";
            // Make API call to get prediction data
            const response = await fetch(
              `${apiBaseURL}/api/predictions?symbol=${item.symbol.toUpperCase()}`
            );

            const currentPriceResponse = await fetch(
              `${apiBaseURL}/api/currentinfo?symbol=${item.symbol.toUpperCase()}`
            );

            if (!response.ok) {
              console.error(
                `API call failed for ${item.symbol}: ${response.status}`
              );
              return {
                ...item,
                current_price: 0,
                price_change: 0,
                apiData: null,
              };
            }

            const apiData = await response.json();
            const currentPriceInfo = await currentPriceResponse.json()
            console.log(`API data for ${item.symbol}:`, apiData);

            const currentPrice = currentPriceInfo || 0;
            const priceChange = apiData.info.outlook || 0;
            const marketCap = apiData.info.market_cap || 0;

            if(cryptoCoins.includes(item.symbol.toUpperCase().slice(0,-4)))
              item.symbol = item.symbol.slice(0,-4);

            return {
              ...item,
              current_price: currentPrice,
              price_change: priceChange,
              market_cap: marketCap,
              apiData: apiData,
            };
          } catch (error) {
            console.error(`Error fetching data for ${item.symbol}:`, error);
            return {
              ...item,
              current_price: 0,
              price_change: 0,
              apiData: null,
            };
          }
        })
      );

      setWatchListItems(enrichedItems);
      console.log("Final enriched watchlist items:", enrichedItems);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const addToDatabase = async (ticker: string): Promise<boolean> => {
    if (!session) return false;

    try {
      const currUserId = session.user.id;
      const currSymbol = ticker.slice(
        ticker.lastIndexOf("(") + 1,
        ticker.lastIndexOf(")")
      );
      setExistanceError(false);

      const { data: watchlistData, error: watchlistError } = await supabase
        .from("watchlist")
        .select("symbol")
        .eq("user_id", session.user.id);

      if (watchlistError) {
        console.error("Error fetching watchlist:", watchlistError);
        return false;
      }

      const exists = watchlistData?.some((item) => item.symbol === currSymbol);

      if (exists) {
        setExistanceError(true);
        return false;
      }

      setAddLoading(true);
      setAddLoadingText("Getting historical information...");
      const { error } = await supabase.from("watchlist").insert({
        user_id: currUserId,
        symbol: currSymbol,
        current_price: 0,
        price_change: 0,
      });

      if (error) {
        console.error("Error adding ticker:", error);
        return false;
      }

      await fetchWatchlist();
      return true;
    } catch (error) {
      console.error("Error adding ticker: ", error);
      return false;
    } finally {
      setAddLoading(false);
    }
  };

  useEffect(() => {
    fetchWatchlist();
  }, [session]);

  const AddTickerModal = ({ onClose }) => {
    const tickers = [
      "Apple (AAPL)",
      "Google (GOOGL)",
      "Amazon (AMZN)",
      "Bitcoin (BTC)",
      "Tesla (TSLA)",
      "Microsoft (MSFT)",
      "Meta (META)",
      "Netflix (NFLX)",
      "Nvidia (NVDA)",
      "Ethereum (ETH)",
      "Spotify (SPOT)",
      "Disney (DIS)",
      "Coca-Cola (KO)",
      "McDonald's (MCD)",
      "Visa (V)",
      "Johnson & Johnson (JNJ)",
      "Walmart (WMT)",
      "Intel (INTC)",
      "Adobe (ADBE)",
      "Salesforce (CRM)",
    ];
    const [searchTerm, setSearchTerm] = useState("");
    const [tickersData] = useState(tickers);
    const [inputFocus, setInputFocus] = useState(false);

    const handleInputChange = (e) => setSearchTerm(e.target.value);

    const tickersDataFiltered = tickersData.filter((ticker) =>
      ticker.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
      <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
        <div className="bg-black rounded-lg p-8 shadow-lg max-w-md w-full">
          <h2 className="text-xl font-bold mb-4 text-white">Add a Ticker</h2>
          <div className="bg-black shadow-lg rounded max-w-md w-full mx-auto z-50 p-2 max-h-48 overflow-y-auto">
            <input
              autoFocus
              className="w-full rounded text-base px-4 py-2 bg-gray-900 text-white border border-gray-700 focus:border-yellow-400 transition-all"
              type="text"
              placeholder="Search stocks/crypto"
              onChange={handleInputChange}
              onFocus={() => setInputFocus(true)}
              onBlur={() => setTimeout(() => setInputFocus(false), 150)}
              value={searchTerm}
            />
            {inputFocus && (
              <div className="bg-black shadow-lg rounded max-w-md w-full mx-auto z-50 p-2 max-h-48 overflow-y-auto">
                {tickersDataFiltered.length > 0 ? (
                  tickersDataFiltered.map((ticker) => (
                    <p
                      key={ticker}
                      className="cursor-pointer hover:bg-yellow-500 px-2 py-1 rounded"
                      onClick={() => {
                        setSearchTerm(ticker);
                        setInputFocus(false);
                        addToDatabase(ticker).then((added) => {
                          if (added) {
                            onClose();
                          }
                        });
                      }}
                    >
                      {ticker}
                    </p>
                  ))
                ) : (
                  <p className="text-white px-2 py-1">No results</p>
                )}
              </div>
            )}
          </div>
          {existanceError && (
            <p className="text-red-500 mb-2">
              Ticker already exists in your watchlist.
            </p>
          )}
          <button
            className="mt-4 px-4 py-2 rounded bg-cyan-500 text-white"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    );
  };

  const removeFromWatchlist = async (itemId) => {
    if (!session) return;

    try {
      const { error } = await supabase
        .from("watchlist")
        .delete()
        .eq("id", itemId)
        .eq("user_id", session.user.id);

      if (error) {
        console.error("Error removing item:", error);
      } else {
        // Update state to remove the item
        setWatchListItems(watchListItems.filter((item) => item.id !== itemId));
      }
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const authenticatedContent = (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-6 mt-20 text-white">
        Your Watchlist
      </h1>

      {/* Show adding ticker loading overlay (takes priority) */}
      {addLoading && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-xl p-8 shadow-lg">
            <div className="flex flex-col items-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400 mb-4"></div>
              <div className="text-cyan-400 text-lg font-medium animate-pulse">
                {addLoadingText}
              </div>
              <div className="text-gray-400 text-sm mt-2">
                Adding ticker to your watchlist...
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Only show regular loading when NOT adding a ticker */}
      {loading && !addLoading ? (
        <div className="flex flex-col items-center justify-center min-h-[200px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400 mb-4"></div>
          <div className="text-cyan-400 text-lg font-medium animate-pulse">
            {loadingText}
          </div>
        </div>
      ) : watchListItems.length > 0 ? (
        <div className="bg-black bg-opacity-100 rounded-2xl p-8 shadow-lg">
          <div className="grid grid-cols-1 gap-y-3 max-w-10xl mx-auto">
            {watchListItems.map((item) => (
              <div
                key={item.id}
                className="bg-black bg-opacity-80 rounded-xl p-4 shadow-md flex flex-col justify-between"
              >
                <div className="flex justify-between items-center">
                  <a href={"./currencies/" + item.symbol} className="text-xl font-semibold mb-2 text-white">
                    {item.symbol}
                  </a>
                  <button
                    className="mt-4 px-4 py-2 rounded bg-red-600 text-white hover:bg-red-500 transition-all mt-3"
                    onClick={() => removeFromWatchlist(item.id)}
                  >
                    <img src={trash} alt="Remove" className="w-6 h-7" />
                  </button>
                </div>
                <div className="mt-2">
                  <dl className="grid w-full grid-cols-1 gap-6 text-white sm:grid-cols-3">
                  
                  <div>
                    <dt className="text-sm text-gray-400 uppercase tracking-wide">
                    Current Price
                    </dt>
                    <dd className={`mt-1 text-lg font-semibold ${
                      item.price_change > 0
                      ? "text-green-300"
                      : item.price_change < 0
                      ? "text-red-300"
                      : "text-yellow-400"
                    }`}>
                    {item.current_price ? `$${item.current_price.toFixed(2)}` : "N/A"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-gray-400 uppercase tracking-wide">
                    Outlook
                    </dt>
                    <dd
                    className={`mt-1 text-lg font-semibold ${
                      item.price_change > 0
                      ? "text-green-400"
                      : item.price_change < 0
                      ? "text-red-400"
                      : "text-yellow-400"
                    }`}
                    >
                    {item.price_change
                      ? `${item.price_change > 0 ? "+" : ""}${item.price_change.toFixed(2)}%`
                      : "N/A"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-gray-400 uppercase tracking-wide">
                    Market Cap
                    </dt>
                    <dd className="mt-1 text-lg font-semibold text-white">
                    {item.market_cap ? formatMarketCap(item.market_cap) : "N/A"}
                    </dd>
                  </div>
                  </dl>
                </div>
                <div className="mt-4 border-b border-gray-800" />
              </div>
            ))}
          </div>
          <div className="flex justify-center mt-8">
            <button
              className="px-6 py-3 rounded-lg text-sm font-semibold bg-cyan-500 text-black hover:bg-cyan-400 transition-all"
              onClick={() => setShowAddTicker(true)}
            >
              Add Ticker
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-black bg-opacity-100 rounded-xl p-8">
          <div className="grid grid-cols-1 gap-6">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded-xl p-6 shadow-md bg-gray-1000"
                style={{ opacity: 0.8 - i * 0.25 }}
              >
                <div className="flex justify-between items-center mb-4">
                  <div className="h-6 w-24 bg-gray-600 rounded"></div>
                  <div className="h-10 w-14 bg-gray-600 rounded-md"></div>
                </div>
                <div>
                  <div className="h-4 w-32 bg-gray-600 rounded mb-2"></div>
                  <div className="h-4 w-20 bg-gray-600 rounded"></div>
                </div>
              </div>
            ))}
          </div>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6">
            <p className="text-white mb-4">
              Your watchlist is empty. Add some stocks or cryptocurrencies to
              track!
            </p>
            <button
              className="px-6 py-3 rounded-lg text-sm font-semibold bg-cyan-500 text-black hover:bg-cyan-400 transition-all"
              onClick={() => setShowAddTicker(true)}
            >
              Add Ticker
            </button>
          </div>
        </div>
      )}

      {/* Only show modal when not adding a ticker */}
      {showAddTicker && !addLoading && (
        <AddTickerModal
          onClose={() => {
            setShowAddTicker(false);
            setExistanceError(false);
          }}
        />
      )}
    </div>
  );

  const unauthenticatedContent = (
    <div className="flex items-center justify-center min-h-screen">
      <div className="bg-black bg-opacity-80 rounded-xl shadow-lg p-8 text-white max-w-2xl w-full z-10">
        <h1 className="text-2xl font-bold mb-4 text-center">
          Create your own personalized watchlist with your InvestAnalytics
          account now!
        </h1>
        <p className="text-center mb-4">
          Through our AI-powered prediction services, a watchlist with
          InvestAnalytics will allow you to view the prices of stocks and
          currencies that are important to you.{" "}
        </p>
        <div className="flex justify-center">
          <a
            className="block px-6 py-3 rounded-lg text-sm font-semibold border border-[#00FFFF] text-[#00FFFF] shadow-md transition-all duration-300 hover:bg-[#00FFFF] hover:text-black hover:shadow-[0_0_20px_rgba(0,188,212,0.5)]"
            href="/signin"
          >
            Sign In Now
          </a>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {backgroundSVG}
      {session ? authenticatedContent : unauthenticatedContent}
    </>
  );
};

export default Watchlist;
