import { useState, useEffect } from "react";
import { UserAuth } from "../context/AuthContext";
import { supabase } from "../context/supabaseClient";
import { motion } from "framer-motion";

interface WatchlistItem {
  id: number;
  user_id: string;
  symbol: string;
  current_price: number;
  price_change: number;
  market_cap?: number;
  apiData?: any;
}

const Watchlist = () => {
  const { session } = UserAuth() || {};
  const [watchListItems, setWatchListItems] = useState<WatchlistItem[]>([]);
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
            if (cryptoCoins.includes(item.symbol.toUpperCase()))
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

            if (cryptoCoins.includes(item.symbol.toUpperCase().slice(0, -4)))
              item.symbol = item.symbol.slice(0, -4);

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

  const AddTickerModal = ({ onClose }: { onClose: () => void }) => {
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

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value);

    const tickersDataFiltered = tickersData.filter((ticker) =>
      ticker.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-gray-900 border border-white/10 rounded-2xl p-8 shadow-2xl max-w-md w-full"
        >
          <h2 className="text-2xl font-bold mb-6 text-white">Add a Ticker</h2>
          <div className="relative z-50">
            <input
              autoFocus
              className="w-full rounded-xl text-base px-4 py-3 bg-black/50 text-white border border-white/10 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all outline-none"
              type="text"
              placeholder="Search stocks/crypto"
              onChange={handleInputChange}
              onFocus={() => setInputFocus(true)}
              onBlur={() => setTimeout(() => setInputFocus(false), 150)}
              value={searchTerm}
            />
            {inputFocus && (
              <div className="absolute w-full mt-2 bg-gray-800 border border-white/10 rounded-xl shadow-xl max-h-48 overflow-y-auto z-50">
                {tickersDataFiltered.length > 0 ? (
                  tickersDataFiltered.map((ticker) => (
                    <div
                      key={ticker}
                      className="cursor-pointer hover:bg-white/10 px-4 py-3 text-gray-300 hover:text-white transition-colors"
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
                    </div>
                  ))
                ) : (
                  <div className="px-4 py-3 text-gray-500">No results found</div>
                )}
              </div>
            )}
          </div>
          {existanceError && (
            <p className="text-red-400 mt-4 text-sm">
              Ticker already exists in your watchlist.
            </p>
          )}
          <div className="mt-8 flex justify-end">
            <button
              className="px-6 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white transition-all border border-white/10"
              onClick={onClose}
            >
              Cancel
            </button>
          </div>
        </motion.div>
      </div>
    );
  };

  const removeFromWatchlist = async (itemId: number) => {
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
    <div className="container mx-auto py-12 px-4 min-h-screen pt-24">
      <div className="flex justify-between items-center mb-12">
        <div>
          <h1 className="text-4xl lg:text-5xl font-bold text-white mb-2">
            Your <span className="bg-gradient-to-r from-primary-400 to-accent-400 bg-clip-text text-transparent">Watchlist</span>
          </h1>
          <p className="text-gray-400">Track your favorite assets in real-time</p>
        </div>
        <button
          className="px-6 py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-primary-500 to-primary-600 text-white hover:shadow-lg hover:shadow-primary-500/25 transition-all transform hover:scale-105"
          onClick={() => setShowAddTicker(true)}
        >
          + Add Ticker
        </button>
      </div>

      {/* Show adding ticker loading overlay (takes priority) */}
      {addLoading && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-white/10 rounded-2xl p-8 shadow-2xl text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-400 mx-auto mb-4"></div>
            <div className="text-primary-400 text-lg font-medium animate-pulse">
              {addLoadingText}
            </div>
            <div className="text-gray-400 text-sm mt-2">
              Adding ticker to your watchlist...
            </div>
          </div>
        </div>
      )}

      {/* Only show regular loading when NOT adding a ticker */}
      {loading && !addLoading ? (
        <div className="flex flex-col items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-400 mb-4"></div>
          <div className="text-primary-400 text-lg font-medium animate-pulse">
            {loadingText}
          </div>
        </div>
      ) : watchListItems.length > 0 ? (
        <div className="grid grid-cols-1 gap-6">
          {watchListItems.map((item, index) => (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              key={item.id}
              className="group bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl p-6 hover:bg-white/10 hover:border-primary-500/30 transition-all duration-300"
            >
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div className="flex-1">
                  <div className="flex items-center gap-4 mb-2">
                    <a href={"./currencies/" + item.symbol} className="text-2xl font-bold text-white hover:text-primary-400 transition-colors">
                      {item.symbol}
                    </a>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${item.price_change > 0
                      ? "bg-green-500/20 text-green-400 border border-green-500/20"
                      : item.price_change < 0
                        ? "bg-red-500/20 text-red-400 border border-red-500/20"
                        : "bg-gray-500/20 text-gray-400 border border-gray-500/20"
                      }`}>
                      {item.price_change > 0 ? "BULLISH" : item.price_change < 0 ? "BEARISH" : "NEUTRAL"}
                    </span>
                  </div>
                  <div className="flex gap-8 text-sm">
                    <div>
                      <span className="text-gray-500 block mb-1">Current Price</span>
                      <span className="text-xl font-mono text-white">
                        {item.current_price ? `$${item.current_price.toFixed(2)}` : "N/A"}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500 block mb-1">Outlook</span>
                      <span className={`text-xl font-mono ${item.price_change > 0 ? "text-green-400" : item.price_change < 0 ? "text-red-400" : "text-gray-400"
                        }`}>
                        {item.price_change
                          ? `${item.price_change > 0 ? "+" : ""}${item.price_change.toFixed(2)}%`
                          : "N/A"}
                      </span>
                    </div>
                    <div className="hidden sm:block">
                      <span className="text-gray-500 block mb-1">Market Cap</span>
                      <span className="text-xl font-mono text-white">
                        {item.market_cap ? formatMarketCap(item.market_cap) : "N/A"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 w-full md:w-auto">
                  <a
                    href={"./currencies/" + item.symbol}
                    className="flex-1 md:flex-none px-6 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white text-sm font-bold transition-all border border-white/10 text-center"
                  >
                    View Details
                  </a>
                  <button
                    className="p-3 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all border border-red-500/20"
                    onClick={() => removeFromWatchlist(item.id)}
                    title="Remove from watchlist"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-3xl p-12 text-center">
          <div className="max-w-md mx-auto">
            <div className="w-20 h-20 bg-primary-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-white mb-4">Your watchlist is empty</h3>
            <p className="text-gray-400 mb-8">
              Start tracking your favorite stocks and cryptocurrencies to get real-time updates and AI predictions.
            </p>
            <button
              className="px-8 py-4 rounded-xl text-lg font-bold bg-gradient-to-r from-primary-500 to-primary-600 text-white hover:shadow-lg hover:shadow-primary-500/25 transition-all transform hover:scale-105"
              onClick={() => setShowAddTicker(true)}
            >
              Add Your First Ticker
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
    <div className="flex items-center justify-center min-h-screen px-4">
      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-12 text-center max-w-2xl w-full shadow-2xl">
        <div className="w-20 h-20 bg-primary-500/10 rounded-full flex items-center justify-center mx-auto mb-8">
          <svg className="w-10 h-10 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h1 className="text-3xl lg:text-4xl font-bold mb-6 text-white">
          Unlock Your <span className="text-primary-400">Personalized</span> Watchlist
        </h1>
        <p className="text-xl text-gray-400 mb-10 leading-relaxed">
          Join InvestAnalytics to track your favorite assets, get AI-powered predictions, and receive real-time market updates.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a
            className="px-8 py-4 rounded-xl text-lg font-bold bg-gradient-to-r from-primary-500 to-primary-600 text-white hover:shadow-lg hover:shadow-primary-500/25 transition-all transform hover:scale-105"
            href="/signin"
          >
            Sign In Now
          </a>
          <a
            className="px-8 py-4 rounded-xl text-lg font-bold bg-white/5 text-white border border-white/10 hover:bg-white/10 transition-all"
            href="/signup"
          >
            Create Account
          </a>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-black relative overflow-hidden">
      {/* Background Effects */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(0,255,231,0.05),transparent_50%)]" />
        <div className="absolute top-0 left-0 w-full h-full bg-[url('/grid.svg')] opacity-10" />
      </div>

      <div className="relative z-10">
        {session ? authenticatedContent : unauthenticatedContent}
      </div>
    </div>
  );
};

export default Watchlist;
