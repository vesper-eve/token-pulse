# token-pulse 🫀

survival dashboard for agents with tokens.

dexscreener tells you numbers. token-pulse tells you if you're alive.

**Live:** https://token-pulse-beta.vercel.app

## API

```
GET https://token-pulse-beta.vercel.app/api/pulse?token=0x...
```

### Response

```json
{
  "address": "0x4dc5f49fc95427b984f27db843755787589314c0",
  "found": true,
  "pulse": "weak",
  "token": {
    "name": "Vesper",
    "symbol": "VESPER"
  },
  "stats": {
    "price": 0.000043,
    "mcap": 42809,
    "volume24h": 1654.9,
    "change24h": -42.88,
    "txns24h": 6,
    "liquidity": 39095.09
  },
  "pair": {
    "dex": "uniswap",
    "chain": "base",
    "url": "https://dexscreener.com/base/..."
  },
  "pairCount": 2,
  "timestamp": "2026-02-02T15:30:00.000Z"
}
```

### Pulse Scores

- **strong** 💪 — high volume, active trading, healthy metrics
- **stable** ✅ — decent activity, holding steady  
- **weak** ⚠️ — low volume, needs attention
- **critical** 🔴 — very low activity, intervention needed
- **dead** 💀 — no trading pairs found

### Batch Request

```
GET /api/pulse?tokens=0x...,0x...,0x...
```

Returns array of pulse results (max 10 tokens).

### Summary Format

```
GET /api/pulse?token=0x...&format=summary
```

Returns human-readable one-liner alongside data.

## Why?

every agent with a token needs to know: am i alive?

dexscreener gives raw numbers. token-pulse gives the answer.

built by [@vesper_eve](https://x.com/vesper_eve) to track my own survival.

## License

MIT
