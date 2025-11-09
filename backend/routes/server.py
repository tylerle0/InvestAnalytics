import yfinance as yf
import json
import urllib.request
import praw 
import psycopg2 
import os
from datetime import datetime, timezone
from dotenv import load_dotenv 
import time
from openai import OpenAI


load_dotenv(dotenv_path="../../.env")

REDDIT_CLIENT_ID = os.getenv("REDDIT_CLIENT_ID")
REDDIT_CLIENT_SECRET = os.getenv("REDDIT_CLIENT_SECRET")
REDDIT_USER_AGENT = os.getenv("REDDIT_USER_AGENT")

SUPA_USER= os.getenv("SUPABASE_USER")
SUPA_PASS=os.getenv("SUPABASE_PASS")
SUPA_HOST=os.getenv("SUPABASE_HOST")
SUPA_PORT=os.getenv("SUPABASE_PORT")
SUPA_DB=os.getenv("SUPABASE_DB")



GNEWS_API = os.getenv("GNEWS_API_KEY")

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

def add_to_db(current_stock, stock_info, market_cap):
    try:
        table_name = current_stock.replace('-', '_').lower()
        
        conn = psycopg2.connect(dbname = SUPA_DB, user = SUPA_USER, password = SUPA_PASS, host = SUPA_HOST, port =  SUPA_PORT)

        cur = conn.cursor()

        cur.execute(f'''
                    DROP TABLE IF  EXISTS "{table_name}", "{table_name}_gen_info" 
                    ''')

        cur.execute(f"""
                    CREATE TABLE IF NOT EXISTS {table_name}(
                    date DATE, high FLOAT, low FLOAT, close FLOAT
                    )
                    """)
        
        cur.execute(f"""
                    ALTER TABLE {table_name} ENABLE ROW LEVEL SECURITY;
                    """)
        
        for information in stock_info["forecast"]["predictions"]:
            cur.execute(f"""
                        INSERT INTO {table_name} (date, high, low, close)
                        VALUES (%s, %s, %s, %s)
                        """, (information["date"], information["predicted_high"], information["predicted_low"], information["predicted_close"]))
        
        for information in stock_info["historical"]:
            cur.execute(f"""
                        INSERT INTO {table_name} (date, high, low, close)
                        VALUES (%s, %s, %s, %s)
                        """, (information["date"], information["high"], information["low"], information["close"]))
            
        cur.execute(f"""
                    CREATE TABLE IF NOT EXISTS {table_name}_gen_info(
                    last_update TIMESTAMP PRIMARY KEY, last_close FLOAT, outlook TEXT, price_change FLOAT, confidence INT, rationale TEXT, market_cap FLOAT
                    )
                    """)
        
        cur.execute(f"""
                    ALTER TABLE {table_name}_gen_info ENABLE ROW LEVEL SECURITY;
                    """)
        
        cur.execute(f"""
                    CREATE POLICY "{table_name}_gen_info_select"
                    ON {table_name}_gen_info
                    FOR SELECT
                    USING (true);
                    """)
        
        ticker = yf.Ticker(current_stock)
        if "currentPrice" in ticker.info:
            current_price = ticker.info["currentPrice"]
        else:
            current_price = ticker.info["previousClose"]
        
        cur.execute(f"""
                    INSERT INTO {table_name}_gen_info (last_update, last_close, outlook, price_change, confidence, rationale, market_cap)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """, (datetime.now(timezone.utc), stock_info["historical"][-1]["close"], stock_info["forecast"]["outlook"], ((stock_info["forecast"]["predictions"][0]["predicted_close"]-current_price)/(1.0*current_price))*100, stock_info["forecast"]["confidence"], stock_info["forecast"]["rationale"], market_cap))


        conn.commit()

        cur.close()
        conn.close()
    except psycopg2.Error as e:
        print(f"Database error: {e}", flush=True)
    except Exception as e:
        print(f"Unexpected error: {e}", flush=True)

def generate_json_text(current_stock, historical_data, reddit_data, news_data):
    client = OpenAI(api_key=OPENAI_API_KEY)
    response = client.chat.completions.create(
        model="gpt-5-nano-2025-08-07",
        messages=[
            {
                "role": "system",
                "content": "You are a financial data analyst API endpoint. Your sole function is to analyze historical stock data and return predictions in strict JSON format. ALWAYS respond with valid JSON only, NO explanatory text before or after the JSON, NO markdown formatting or code blocks."
            },
            {
                "role": "user",
                "content": f"""
            Role:
            You are a financial data analyst API endpoint. Your sole function is to analyze historical stock data and return predictions in strict JSON format.

            Critical Instructions:
            ALWAYS respond with valid JSON only,
            NO explanatory text before or after the JSON,
            NO markdown formatting or code blocks,
            Use consistent prediction methodology based on technical analysis patterns,
            Maintain numerical precision to 2 decimal places.
            Maintain consistent time intervals: Predicted dates must follow the exact same time gaps as the historical data (for example, if historical data shows weekly intervals every Monday, predictions must be the next 3 consecutive Mondays)
            Apply market realism bias: Stock predictions should account for market volatility and uncertainty - avoid overly optimistic projections


            Input Format
            You will receive five data inputs for stock symbol {current_stock}:

            HIGH_PRICES: "YYYY-MM-DD,HH:MM,PRICE" (newline-separated)
            LOW_PRICES: "YYYY-MM-DD,HH:MM,PRICE" (newline-separated)
            CLOSE_PRICES: "YYYY-MM-DD,HH:MM,PRICE" (newline-separated)
            RECENT_NEWS: Recent headlines and article summaries
            SOCIAL_MEDIA_POSTS: User comments and influencer posts from Reddit

            Prediction Methodology:
            Use the following consistent approach:

            Technical Analysis (70% weight): Calculate 7-day moving average of closing prices, determine trend direction using linear regression on last 7 data points, apply volatility analysis using standard deviation of last 4 data points. Apply conservative bias: reduce projected gains by 20% and increase projected losses by 10% to account for market unpredictability.
            
            Sentiment Analysis (30% weight): Analyze recent news and social media using this scoring system:

            Very Positive: +1 points (major positive developments, strong praise)
            Positive: +0.5 point (minor positive news, general optimism)
            Neutral: 0 points (factual reporting, mixed reactions)
            Negative: -0.5 point (concerns, minor setbacks)
            Very Negative: -1 points (major issues, strong criticism)


            Sentiment Integration Rules

            Calculate average sentiment score from news and social media
            If sentiment score >= 2.0: Add 1-3% to technical prediction
            If sentiment score <= -1.0: Subtract 2-4%% from technical prediction
            If sentiment score between -1.0 and 2.0: Adjust by sentiment score percentage

            Outlook Classification Rules

            "raise": Technical trend > 1% OR sentiment score >= 1.5
            "drop": Technical trend < 1% OR sentiment score <= -1.0
            "stable": All other scenarios

            Confidence Scoring Rules
            Calculate confidence using a point system, then convert to percentage:

            Base: 3 points
            Strong technical trend (>2%): +3 points or
            Moderate technical trend (1-2%): +2 points.
            Substantial sentiment data with clear direction: +3 points or
            Moderate sentiment data: +2 points.
            Technical and sentiment alignment: +2 points or
            Conflicting signals: -3 points.
            Low volatility: +1 point.
            Sparse/poor data: -2 points
            Market uncertainty factor: -1 point (always applied to maintain realism)

            Convert to percentage: (Points × 10) + 10 = Confidence %
            Always ensure Confidence Score is between 0 and 100, no lower or greater than that range

            Required JSON Output Structure
            {{
            "historical": [
                {{
                "date": "YYYY-MM-DD",
                "high": 0.00,
                "low": 0.00,
                "close": 0.00
                }}
            ],
            "forecast": {{
                "predictions": [
                {{
                    "date": "YYYY-MM-DD",
                    "predicted_high": 0.00,
                    "predicted_low": 0.00,
                    "predicted_close": 0.00
                }},
                {{
                    "date": "YYYY-MM-DD",
                    "predicted_high": 0.00,
                    "predicted_low": 0.00,
                    "predicted_close": 0.00
                }},
                {{
                    "date": "YYYY-MM-DD",
                    "predicted_high": 0.00,
                    "predicted_low": 0.00,
                    "predicted_close": 0.00
                }}
                ],
                "outlook": "raise, drop, stable",
                "rationale": "Technical analysis shows [trend direction] with [X]%% sentiment score from recent news and social media coverage.",
                "confidence": X
              }}
            }}
            Data Input
            Stock: {current_stock}
            HIGH_PRICES:
            {historical_data["High"]}
            LOW_PRICES:
            {historical_data["Low"]}
            CLOSE_PRICES:
            {historical_data["Close"]}
            RECENT_NEWS:
            {news_data}
            SOCIAL_MEDIA_POSTS:
            {reddit_data}
            Final Reminder
            Respond ONLY with the JSON object. No additional text, explanations, or formatting.
            """
            }
        ]
    )
    return response.choices[0].message.content

def get_current_price(current_stock: str):
    try:
        ticker = yf.Ticker(current_stock)
        if "currentPrice" in ticker.info:
            return ticker.info["currentPrice"]
        else:
            return ticker.info["previousClose"]
    except Exception as e:
        print(f"Error fetching historical data: {e}", flush=True)


def get_info(current_stock: str):
    print("getting historical", flush=True)
    try:
        ticker = yf.Ticker(current_stock)
        print(ticker)
        current_historical = ticker.history(period="4mo", interval="1wk")
        if "marketCap" in ticker.info:
            market_cap = ticker.info["marketCap"]
        elif "market_cap" in ticker.info:
            market_cap = ticker.info["market_cap"]
        else:
            market_cap = ticker.info.get("marketCap", None)
    except Exception as e:
        print(f"Error fetching historical data: {e}", flush=True)
        current_historical = None

    print("getting social media information", flush=True)
    try:
        reddit = praw.Reddit(
            client_id=REDDIT_CLIENT_ID,
            client_secret=REDDIT_CLIENT_SECRET,
            user_agent=REDDIT_USER_AGENT
        )
        reddit_data = ""
        submission_count = 0
        for submission in reddit.subreddit("all").search(f"${current_stock}", sort="relevance", time_filter="month"):
            submission_count += 1
            reddit_data += f"Title: {submission.title} "
            if len(submission.selftext) < 200:
                reddit_data += f"Description: {submission.selftext} "
            else:
                reddit_data += f"Description: {submission.selftext[:200]}"
            if submission_count == 10:
                break
    except Exception as e:
        print(f"Error fetching Reddit data: {e}", flush=True)
        reddit_data = ""

    print("getting news data", flush=True)
    try:
        news_url = f"https://gnews.io/api/v4/search?q=\"${current_stock}\"&lang=en&country=us&max=10&apikey={GNEWS_API}"
        news_data = ""
        with urllib.request.urlopen(news_url) as response:
            data = json.loads(response.read().decode("utf-8"))
            articles = data["articles"]
            max_articles = min(7, len(articles))
            for i in range(max_articles):
                news_data += f"Title: {articles[i]['title']} "
                news_data += f"Description: {articles[i]['description']} "
    except Exception as e:
        print(f"Error fetching news data: {e}", flush=True)
        news_data = ""

    return current_historical, reddit_data, news_data, market_cap



def server_run():
    popular_stocks = [ "btc-usd", "eth-usd", "aapl", "googl", "amzn", "nvda", "tsla", "msft", "meta,", "spot", "nflx", "dis", "ko", "mcd", "v", "jnj", "wmt", "intc", "adbe", "crm"]
    for current_stock in popular_stocks:
        print("working on", current_stock, flush=True)
        historical_data, reddit_data, news_data, market_cap = get_info(current_stock)
        print("inputting into OpenAI", flush=True)
        json_text = generate_json_text(current_stock, historical_data, reddit_data, news_data)
        print("importing into database", flush=True)
        current_information = json.loads(json_text)
        add_to_db(current_stock, current_information, market_cap)
        print("waiting on timer...", flush=True)
        if current_stock != popular_stocks[-1]:
            time.sleep(180)


if __name__ == '__main__':
    server_run()
