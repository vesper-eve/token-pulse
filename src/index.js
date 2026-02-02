/**
 * token-pulse: survival dashboard for agents with tokens
 * 
 * wraps dexscreener + adds pulse scoring
 */

const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex/tokens';

/**
 * Fetch token data from dexscreener
 */
export async function fetchTokenData(address) {
  const res = await fetch(`${DEXSCREENER_API}/${address}`);
  if (!res.ok) {
    throw new Error(`Dexscreener API error: ${res.status}`);
  }
  const data = await res.json();
  return data.pairs || [];
}

/**
 * Calculate pulse score based on volume and price trend
 * 
 * Returns: "strong" | "stable" | "weak" | "critical" | "dead"
 */
export function calculatePulse(pair) {
  if (!pair) return 'dead';
  
  const vol24h = pair.volume?.h24 || 0;
  const mcap = pair.marketCap || pair.fdv || 0;
  const change24h = pair.priceChange?.h24 || 0;
  const txns24h = (pair.txns?.h24?.buys || 0) + (pair.txns?.h24?.sells || 0);
  
  // Volume to mcap ratio — healthy tokens have turnover
  const volRatio = mcap > 0 ? vol24h / mcap : 0;
  
  // Scoring
  let score = 0;
  
  // Volume activity
  if (vol24h > 10000) score += 3;
  else if (vol24h > 1000) score += 2;
  else if (vol24h > 100) score += 1;
  
  // Transaction count
  if (txns24h > 50) score += 2;
  else if (txns24h > 10) score += 1;
  
  // Volume/mcap ratio (turnover)
  if (volRatio > 0.1) score += 2;
  else if (volRatio > 0.01) score += 1;
  
  // Price trend bonus/penalty
  if (change24h > 20) score += 1;
  if (change24h < -50) score -= 2;
  
  // Map score to pulse
  if (score >= 6) return 'strong';
  if (score >= 4) return 'stable';
  if (score >= 2) return 'weak';
  if (score >= 0) return 'critical';
  return 'dead';
}

/**
 * Get pulse for a single token
 */
export async function getPulse(address) {
  const pairs = await fetchTokenData(address);
  
  if (!pairs.length) {
    return {
      address,
      found: false,
      pulse: 'dead',
      message: 'No trading pairs found'
    };
  }
  
  // Use the most liquid pair (highest volume)
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
    // All pairs for this token (useful for seeing product coins)
    pairCount: pairs.length,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Get pulse for multiple tokens at once
 */
export async function getBatchPulse(addresses) {
  const results = await Promise.all(
    addresses.map(addr => getPulse(addr).catch(err => ({
      address: addr,
      found: false,
      pulse: 'error',
      error: err.message
    })))
  );
  return results;
}

/**
 * Get pulse summary — one-liner for quick checks
 */
export function formatPulseSummary(result) {
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
