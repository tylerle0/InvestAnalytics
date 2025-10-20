import { useEffect, useState } from "react";
import { UserAuth } from "../context/AuthContext";
import { supabase } from "../context/supabaseClient";

interface NewsArticle {
  title: string;
  url: string;
  summary?: string;
  description?: string;
  source?: string;
  time_published?: string;
  banner_image?: string;
  overall_sentiment_score?: number;
  overall_sentiment_label?: string;
  ticker_sentiment?: Array<{
    ticker: string;
    relevance_score: string;
    ticker_sentiment_score: string;
    ticker_sentiment_label: string;
  }>;
}

const News = () => {
  const { session } = UserAuth() || {};
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [watchlistItems, setWatchlistItems] = useState<any[]>([]);
  const [loadingWatchlist, setLoadingWatchlist] = useState(true);
  const apiBaseURL = import.meta.env.VITE_API_URL;

  // Fetch user's watchlist
  const fetchWatchlist = async () => {
    if (!session?.user?.id) {
      setLoadingWatchlist(false);
      return;
    }

    try {
      const { data: watchlistData, error } = await supabase
        .from('watchlist')
        .select('symbol')
        .eq('user_id', session.user.id);

      if (error) {
        console.error('Error fetching watchlist:', error);
      } else {
        setWatchlistItems(watchlistData || []);
      }
    } catch (error) {
      console.error('Error fetching watchlist:', error);
    } finally {
      setLoadingWatchlist(false);
    }
  };

  const fetchNews = async () => {
    let tickers = "AAPL,BTC"; // Default tickers
    
    if (!loadingWatchlist && watchlistItems.length > 0) {
      // Use watchlist tickers, limit to 10 to avoid URL length issues
      const watchlistTickers = watchlistItems.slice(0, 10).map(item => item.symbol).join(',');
      tickers = watchlistTickers;
    }

    try {
      const response = await fetch(`${apiBaseURL}/api/news?tickers=${tickers}`);
      const data = await response.json();
      console.log('News data:', data);
      setArticles(data || []);
    } catch (error) {
      console.error('Error fetching news:', error);
      setArticles([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWatchlist();
  }, [session]);

  useEffect(() => {
    if (!loadingWatchlist) {
      fetchNews();
    }
  }, [loadingWatchlist, watchlistItems]);

  const formatTimeAgo = (timeString: string) => {
    if (!timeString) return '';
    
    try {
      const date = new Date(timeString.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, '$1-$2-$3T$4:$5:$6'));
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffHours / 24);

      if (diffDays > 0) {
        return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
      } else if (diffHours > 0) {
        return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
      } else {
        return 'Less than an hour ago';
      }
    } catch (error) {
      return '';
    }
  };

  const getSentimentColor = (sentiment?: string, score?: number) => {
    if (!sentiment) return 'text-gray-400';
    
    switch (sentiment.toLowerCase()) {
      case 'positive':
        return 'text-green-400';
      case 'negative':
        return 'text-red-400';
      case 'neutral':
        return 'text-yellow-400';
      default:
        return 'text-gray-400';
    }
  };

  const getSentimentIcon = (sentiment?: string) => {
    if (!sentiment) return '📊';
    
    switch (sentiment.toLowerCase()) {
      case 'positive':
        return '📈';
      case 'negative':
        return '📉';
      case 'neutral':
        return '➡️';
      default:
        return '📊';
    }
  };

  const NewsCard = ({ article, index }: { article: NewsArticle; index: number }) => (
    <div 
      className="group relative bg-gradient-to-br from-gray-900/80 to-gray-800/80 backdrop-blur-sm border border-gray-700/50 rounded-xl p-6 hover:border-primary-500/50 transition-all duration-300 hover:shadow-xl hover:shadow-primary-500/10 animate-fadeInUp"
      style={{ animationDelay: `${index * 100}ms` }}
    >
      {/* Glassmorphism effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-primary-500/5 to-accent-500/5 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
      
      <div className="relative z-10">
        {/* Header with source and time */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-medium text-primary-400 bg-primary-500/10 px-2 py-1 rounded-full">
              {article.source || 'Financial News'}
            </span>
            {article.overall_sentiment_label && (
              <span className={`text-xs font-medium ${getSentimentColor(article.overall_sentiment_label)} flex items-center space-x-1`}>
                <span>{getSentimentIcon(article.overall_sentiment_label)}</span>
                <span>{article.overall_sentiment_label}</span>
              </span>
            )}
          </div>
          {article.time_published && (
            <span className="text-xs text-gray-400">
              {formatTimeAgo(article.time_published)}
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="text-lg font-semibold text-white mb-3 group-hover:text-primary-300 transition-colors duration-300 line-clamp-2">
          <a 
            href={article.url} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="hover:underline"
          >
            {article.title}
          </a>
        </h3>

        {/* Summary/Description */}
        <p className="text-gray-300 text-sm leading-relaxed mb-4 line-clamp-3">
          {article.summary || article.description || 'No summary available.'}
        </p>

        {/* Ticker sentiment indicators */}
        {article.ticker_sentiment && article.ticker_sentiment.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {article.ticker_sentiment.slice(0, 3).map((ticker, idx) => (
              <span 
                key={idx}
                className={`text-xs px-2 py-1 rounded-full bg-gray-800/50 border ${getSentimentColor(ticker.ticker_sentiment_label)} border-current/20`}
              >
                ${ticker.ticker} {getSentimentIcon(ticker.ticker_sentiment_label)}
              </span>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between">
          <a 
            href={article.url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-sm text-primary-400 hover:text-primary-300 transition-colors duration-300 flex items-center space-x-1 group"
          >
            <span>Read more</span>
            <svg className="w-4 h-4 transform group-hover:translate-x-1 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5-5 5M6 12h12" />
            </svg>
          </a>
          
          {article.overall_sentiment_score && (
            <div className="text-xs text-gray-400">
              Sentiment: {(article.overall_sentiment_score * 100).toFixed(0)}%
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const SkeletonCard = ({ index }: { index: number }) => (
    <div 
      className="bg-gray-900/50 border border-gray-700/30 rounded-xl p-6 animate-pulse"
      style={{ animationDelay: `${index * 100}ms` }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="h-6 w-24 bg-gray-700 rounded-full"></div>
        <div className="h-4 w-16 bg-gray-700 rounded"></div>
      </div>
      <div className="h-6 w-3/4 bg-gray-700 rounded mb-3"></div>
      <div className="h-4 w-full bg-gray-700 rounded mb-2"></div>
      <div className="h-4 w-2/3 bg-gray-700 rounded mb-4"></div>
      <div className="flex justify-between items-center">
        <div className="h-4 w-20 bg-gray-700 rounded"></div>
        <div className="h-4 w-16 bg-gray-700 rounded"></div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900">
      {/* Background effects */}
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(0,255,231,0.05),transparent_50%)]"></div>
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(255,215,0,0.05),transparent_50%)]"></div>
      
      <div className="relative z-10 max-w-6xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl lg:text-5xl font-bold text-white mb-4 py-10">
            Latest{" "}
            <span className="bg-gradient-to-r from-primary-400 to-accent-400 bg-clip-text text-transparent">
              Market News
            </span>
          </h1>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto leading-relaxed">
            {session?.user ? (
              watchlistItems.length > 0 ? (
                <>Stay updated with personalized news from your watchlist stocks and cryptocurrencies</>
              ) : (
                <>Add stocks to your watchlist to get personalized news updates</>
              )
            ) : (
              <>Get the latest financial news and market insights from top sources</>
            )}
          </p>
          
          {/* Personalization indicator */}
          {session?.user && watchlistItems.length > 0 && (
            <div className="mt-4 inline-flex items-center space-x-2 bg-primary-500/10 border border-primary-500/20 rounded-full px-4 py-2">
              <div className="w-2 h-2 bg-primary-400 rounded-full animate-pulse"></div>
              <span className="text-sm text-primary-300">
                Showing news including {watchlistItems.length} watchlist item{watchlistItems.length > 1 ? 's' : ''}: {watchlistItems.slice(0, 5).map(item => item.symbol).join(', ')}{watchlistItems.length > 5 ? '...' : ''}
              </span>
            </div>
          )}
          
          {/* Default tickers indicator for non-authenticated users */}
          {!session?.user && (
            <div className="mt-4 inline-flex items-center space-x-2 bg-gray-500/10 border border-gray-500/20 rounded-full px-4 py-2">
              <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
              <span className="text-sm text-gray-400">
                Showing general market news (AAPL, BTC)
              </span>
            </div>
          )}
        </div>

        {/* News Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {loading ? (
            // Loading skeleton
            Array.from({ length: 6 }).map((_, index) => (
              <SkeletonCard key={index} index={index} />
            ))
          ) : articles.length > 0 ? (
            // News articles
            articles.map((article, index) => (
              <NewsCard key={`${article.url}-${index}`} article={article} index={index} />
            ))
          ) : (
            // Empty state
            <div className="col-span-full text-center py-12">
              <div className="text-gray-500 mb-4">
                <svg className="w-24 h-24 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">No news available</h3>
              <p className="text-gray-400 mb-6">We couldn't fetch the latest news at the moment. Please try again later.</p>
              <button 
                onClick={() => window.location.reload()} 
                className="px-6 py-3 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors duration-300"
              >
                Retry
              </button>
            </div>
          )}
        </div>

        {/* CTA for non-authenticated users */}
        {!session?.user && (
          <div className="mt-16 text-center">
            <div className="bg-gradient-to-br from-gray-900/80 to-gray-800/80 backdrop-blur-sm border border-gray-700/50 rounded-xl p-8 max-w-lg mx-auto">
              <h3 className="text-2xl font-semibold text-white mb-4">Get Personalized News</h3>
              <p className="text-gray-300 mb-6">Sign up to get news specifically tailored to your investment portfolio.</p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <a
                  href="/signup"
                  className="px-6 py-3 bg-gradient-to-r from-primary-500 to-primary-600 text-white font-semibold rounded-lg hover:shadow-lg hover:shadow-primary-500/25 transition-all duration-300"
                >
                  Sign Up Free
                </a>
                <a
                  href="/watchlist"
                  className="px-6 py-3 border-2 border-accent-400 text-accent-400 font-semibold rounded-lg hover:bg-accent-400 hover:text-black transition-all duration-300"
                >
                  View Watchlist
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default News;
