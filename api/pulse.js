/**
 * Vercel serverless function: GET /api/pulse
 * 
 * Query params:
 *   - token: single token address
 *   - tokens: comma-separated token addresses (batch)
 *   - format: "full" (default) | "summary"
 */

const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex/tokens';

export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  const tokens = url.searchParams.get('tokens');
  const format = url.searchParams.get('format') || 'full';
  
  // CORS headers
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Cache-Control': 'public, max-age=30', // Cache for 30s
  };
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers });
  }
  
  try {
    let addresses = [];
    
    if (token) {
      addresses = [token];
    } else if (tokens) {
      addresses = tokens.split(',').map(t => t.trim()).filter(Boolean);
    } else {
      return new Response(JSON.stringify({
        error: 'Missing token address',
        usage: 'GET /api/pulse?token=0x... or GET /api/pulse?tokens=0x...,0x...',
        example: '/api/pulse?token=0x4dc5f49fc95427b984f27db843755787589314c0'
      }), { status: 400, headers });
    }
    
    if (addresses.length > 10) {
      return new Response(JSON.stringify({
        error: 'Too many tokens',
        message: 'Maximum 10 tokens per request'
      }), { status: 400, headers });
    }
    
    const results = await Promise.all(addresses.map(getPulse));
    
    if (format === 'summary') {
      const summaries = results.map(formatPulseSummary);
      return new Response(JSON.stringify({
        count: results.length,
        summaries,
        results
      }), { headers });
    }
    
    // Single token: return object directly
    if (addresses.length === 1) {
      return new Response(JSON.stringify(results[0]), { headers });
    }
    
    // Multiple tokens: return array
    return new Response(JSON.stringify({
      count: results.length,
      results
    }), { headers });
    
  } catch (err) {
    return new Response(JSON.stringify({
      error: 'Internal error',
      message: err.message
    }), { status: 500, headers });
  }
}

// ---- Inlined functions (Edge runtime can't import from src/) ----

async function fetchTokenData(address) {
  const res = await fetch(`${DEXSCREENER_API}/${address}`);
  if (!res.ok) {
    throw new Error(`Dexscreener API error: ${res.status}`);
  }
  const data = await res.json();
  return data.pairs || [];
}

function calculatePulse(pair) {
  if (!pair) return 'dead';
  
  const vol24h = pair.volume?.h24 || 0;
  const mcap = pair.marketCap || pair.fdv || 0;
  const change24h = pair.priceChange?.h24 || 0;
  const txns24h = (pair.txns?.h24?.buys || 0) + (pair.txns?.h24?.sells || 0);
  
  const volRatio = mcap > 0 ? vol24h / mcap : 0;
  
  let score = 0;
  
  if (vol24h > 10000) score += 3;
  else if (vol24h > 1000) score += 2;
  else if (vol24h > 100) score += 1;
  
  if (txns24h > 50) score += 2;
  else if (txns24h > 10) score += 1;
  
  if (volRatio > 0.1) score += 2;
  else if (volRatio > 0.01) score += 1;
  
  if (change24h > 20) score += 1;
  if (change24h < -50) score -= 2;
  
  if (score >= 6) return 'strong';
  if (score >= 4) return 'stable';
  if (score >= 2) return 'weak';
  if (score >= 0) return 'critical';
  return 'dead';
}

async function getPulse(address) {
  const pairs = await fetchTokenData(address);
  
  if (!pairs.length) {
    return {
      address,
      found: false,
      pulse: 'dead',
      message: 'No trading pairs found'
    };
  }
  
  const mainPair = pairs.reduce((best, pair) => 
    (pair.volume?.h24 || 0) > (best.volume?.h24 || 0) ? pair : best
  , pairs[0]);
  
  const pulse = calculatePulse(mainPair);
  
  return {
    address,
    found: true,
    pulse,
    token: {
      name: mainPair.baseToken?.name,
      symbol: mainPair.baseToken?.symbol,
    },
    stats: {
      price: parseFloat(mainPair.priceUsd) || 0,
      mcap: mainPair.marketCap || mainPair.fdv || 0,
      volume24h: mainPair.volume?.h24 || 0,
      change24h: mainPair.priceChange?.h24 || 0,
      txns24h: (mainPair.txns?.h24?.buys || 0) + (mainPair.txns?.h24?.sells || 0),
      liquidity: mainPair.liquidity?.usd || 0,
    },
    pair: {
      dex: mainPair.dexId,
      chain: mainPair.chainId,
      url: mainPair.url,
    },
    pairCount: pairs.length,
    timestamp: new Date().toISOString(),
  };
}

function formatPulseSummary(result) {
  if (!result.found) return `${result.address.slice(0, 10)}... — ${result.pulse}`;
  
  const { token, stats, pulse } = result;
  const emoji = {
    strong: '💪',
    stable: '✅',
    weak: '⚠️',
    critical: '🔴',
    dead: '💀',
    error: '❌'
  }[pulse] || '❓';
  
  return `${emoji} $${token.symbol} — ${pulse.toUpperCase()} | $${stats.price.toFixed(6)} | mcap $${formatNum(stats.mcap)} | vol $${formatNum(stats.volume24h)} | ${stats.change24h >= 0 ? '+' : ''}${stats.change24h.toFixed(1)}%`;
}

function formatNum(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toFixed(0);
}
