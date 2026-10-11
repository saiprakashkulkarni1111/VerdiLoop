# VerdiLoop — Urban Circularity, Clean Energy & Active Transit Platform

**Close the loop on what a city throws away and cut what it burns.**  
VerdiLoop is a gamified urban sustainability platform that unifies **4-stream waste segregation**, **material recycling**, **e-waste recovery**, **informal recycler cooperatives**, **rooftop solar microgrids**, **smart EV charging nudges**, and **multimodal public transit & bike-sharing** into a single real-time geospatial application.

---

## Core Features & Modules

### 1. Google Maps + Supercluster Geospatial Explorer (`Cluster Map`)
- **High-Density Spatial Indexing**: Renders **140+ urban sustainability facilities** across 10 municipal districts using `@vis.gl/react-google-maps` (`AdvancedMarkerElement`) paired with `Supercluster`.
- **Interactive Cluster Drill-Down**: Clicking any dense cluster smoothly zooms the camera to its expansion zoom (`getClusterExpansionZoom`) and opens a **Cluster Drill-Down Inspector** (`getLeaves`) listing every individual facility inside that cluster.
- **Category & District Filtering**: Filter nodes in real time across 7 domains:
  - **Source Segregation** (`0.85 kg CO2e/kg` · `+18 EcoCredits/kg`)
  - **Material Recycling** (`1.45 kg CO2e/kg` · `+25 EcoCredits/kg`)
  - **E-Waste Recovery** (`3.80 kg CO2e/kg` · `+60 EcoCredits/kg`)
  - **Informal Recyclers Co-ops** (`1.65 kg CO2e/kg` · `+35 EcoCredits/kg`)
  - **Rooftop Solar Export** (`0.42 kg CO2e/kWh` · `+12 EcoCredits/kWh`)
  - **EV Solar & Mode Nudges** (`0.58 kg CO2e/kWh` · `+16 EcoCredits/kWh`)
  - **Public Transit & Bike-Share** (`0.21 kg CO2e/km` · `+15 EcoCredits/km`)

### 2. Closed-Loop Waste, Informal Recyclers & Clean Energy (`Waste & Solar`)
- **Source Segregation & E-Waste Vaults**: Divert wet organic waste from landfills and safely recover lithium, cobalt, and copper from household electronics.
- **Informal Recyclers Cooperative Network**: Connects citizens directly with authorized waste-picker collectives for fair-trade doorstep pickups verified by digital weigh-scales.
- **Rooftop Solar & Midday EV Nudges**: Tracks peer-to-grid rooftop solar exports and rewards EV drivers who shift charging to peak solar hours (`10:00 – 15:00`).
- **Immutable Impact Ledger**: Maintains a complete audit trail of every verified action, facility used, telemetry verification method, $\text{CO}_2\text{e}$ avoided, and EcoCredits earned.

### 3. Multimodal Commute & Carbon Verifier (`Transit & EV`)
- **Google Maps Routes API Integration**: Uses the modern `Route.computeRoutes` SDK (`useMapsLibrary('routes')`) to verify public transit (`TRANSIT`), bike-sharing (`BICYCLING`), and active walking (`WALKING`) trips.
- **Live Route Polyline & Emissions Delta**: Renders the route polyline directly on the map, calculates total distance and travel time, compares emissions against a solo-car baseline (`0.24 kg CO2e/km`), and awards verified **EcoCredits**.

### 4. City-Wide Leaderboard & Local Rewards Marketplace (`Leaderboard & Rewards`)
- **Neighborhood & City-Wide Leaderboard**: Ranks participants by cumulative $\text{CO}_2\text{e}$ avoided and active daily streaks.
- **Local Rewards Catalog**: Citizens redeem EcoCredits for municipal transit passes, e-bike unlock minutes, community solar bill credits, farmers' market compost vouchers, and zero-fee co-op e-waste pickups.
- **Instant Voucher Management**: Generates unique municipal voucher codes (`VL-XXXX-XXXX`) and tracks active vs. used status.

---

## Tech Stack & AWS Architecture

### Frontend & Geospatial Stack
- **Framework**: React 19 + TypeScript + Vite
- **Styling**: Tailwind CSS (`Plus Jakarta Sans` + `IBM Plex Mono` tabular numerals)
- **Mapping & Routing**: Google Maps Platform JavaScript API (`@vis.gl/react-google-maps`, `AdvancedMarkerElement`, `InfoWindow`, and `Routes API`)
- **Spatial Clustering**: `supercluster` (KD-tree spatial index synchronized with Google Maps viewport bounds and zoom events)

### AWS Serverless Architecture
- **Amazon Cognito**: Manages citizen SSO authentication and user session tokens (`src/services/awsCloud.ts`).
- **Amazon DynamoDB (`@aws-sdk/client-dynamodb` & `@aws-sdk/lib-dynamodb`)**: Single-table partition architecture (`VerdiLoop_Prod_Users`, `VerdiLoop_Prod_ActivityLogs`, `VerdiLoop_Prod_Redemptions`) with resilient local edge caching for browser preview environments.
- **AWS AppSync**: Real-time state synchronization for neighborhood leaderboards and co-op digital weigh handovers.
- **AWS IoT Core & AWS IoT Greengrass**: Telemetry ingestion from smart 4-stream segregation bins and material recovery facility (MRF) weighbridges.
- **Amazon Timestream**: Time-series telemetry from bi-directional rooftop solar smart inverters.
- **Amazon EventBridge & AWS Lambda**: Automated municipal reward voucher issuance and transit feed verification.

---

## Project Structure

```text
├── .env.example                     # Environment variable template (Google Maps + AWS config)
├── index.html                       # Entry HTML with SEO metadata & typography
├── metadata.json                    # Application metadata and permissions
├── package.json                     # Dependencies (@aws-sdk/*, @vis.gl/react-google-maps, supercluster)
├── src/
│   ├── App.tsx                      # Main workspace, navigation, KPI dashboard & tabs
│   ├── main.tsx                     # React DOM root
│   ├── index.css                    # Tailwind CSS & typography rules
│   ├── components/
│   │   └── UrbanClusterMap.tsx      # Google Maps + Supercluster markers + Routes API overlay
│   ├── data/
│   │   └── urbanNodes.ts            # 140 GeoJSON urban nodes, transit corridors & rewards catalog
│   ├── hooks/
│   │   └── useSuperclusterMap.ts    # Viewport bounding-box sync & Supercluster hook
│   └── services/
│       └── awsCloud.ts              # AWS SDK v3 DynamoDB DocumentClient & Cognito session service
└── vite.config.ts                   # Vite bundler configuration
```

---

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` and provide your keys:
```env
VITE_GOOGLE_MAPS_API_KEY="YOUR_GOOGLE_MAPS_API_KEY"

# AWS Serverless Configuration
VITE_AWS_REGION="ADD REGOIN"
VITE_AWS_COGNITO_USER_POOL_ID="ADD AWS_COGNITO_USER_POOL_ID"
VITE_AWS_COGNITO_CLIENT_ID="ADD AWS_COGNITO_CLIENT_ID"
VITE_AWS_APPSYNC_GRAPHQL_ENDPOINT="https://example."
VITE_AWS_DYNAMODB_TABLE_PREFIX="ADD AWS_DYNAMODB_TABLE_PREFIX"
```

### 3. Run the Development Server
```bash
npm run dev
```
The application will start on `http://localhost:3000`.

### 4. Build for Production
```bash
npm run build
```
