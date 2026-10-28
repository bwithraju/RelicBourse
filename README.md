# RelicBourse Web Client

React 19 + TypeScript frontend client for the **RelicBourse** exchange and Dutch auction trading platform.

## Features

- **Live Market Order Book**: Level 2 depth ladder with visual cumulative volume and price-time priority.
- **Order Placement**: Buy/Sell Limit & Market orders with anti-scalping collar protection (Rule 6).
- **Dutch Auctions**: Real-time descending price auction engine with live tick updates.
- **Trader Portfolio & Solvency**: Balance inspection (available vs reserved), inventory holdings, escrow holds, and Rule 12 zero-sum solvency audit report.
- **Integer Minor Units**: Strict paise minor units (never floating point) for financial consistency.
- **Resilient Connectivity**: Full REST & WebSocket support with automated fallback mock cache when the backend is offline.

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
npm install
```

### Development Server

```bash
npm run dev
```

The application will be available at [http://localhost:5173](http://localhost:5173).

### Testing

```bash
npm test
```

### Production Build

```bash
npm run build
```

## Configuration

Default environment variables (configured in `src/config.ts`):

- `VITE_API_URL`: Backend REST API URL (default: `http://localhost:4000`)
- `VITE_WS_URL`: WebSocket URL (default: `ws://localhost:4000/ws`)
