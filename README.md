# **InvestAnalytics**

## Deploymed on
- [investanalytics.vercel.app](investanalytics.vercel.app)

## Preqreqs for contribution
- Node.js (v18 or higher)
- npm or yarn
- Supabase

## Stack:
 - **Front End**: React tsx
 - **Auth**: Supabase auth
 - **Database**: Supabase postgres db
 - **APIs**: Serverless functions + external
 - **Backend**: Flask

## Site Structure
```mermaid
graph TD; 
    HomePage-->Watchlist-->A["Add your favorite stocks/cryptocurrencies to watch"];
    HomePage-->RecentNews-->B["Recent news catered to your personalized watchlist."];
    HomePage-->Currency-->C["Check out our predictions on your favorite currency."]
