const cache = new Map();
const MAX_CACHE_SIZE = 500; // Prevent unbounded memory growth in production

/**
 * Get item from cache
 * @param {string} key 
 * @returns {any|null} Data if found and not expired, else null
 */
const getCache = (key) => {
  const item = cache.get(key);
  if (!item) return null;
  
  if (Date.now() > item.expiry) {
    cache.delete(key);
    return null;
  }
  
  return item.data;
};

/**
 * Check if key exists and is not expired
 * @param {string} key
 * @returns {boolean}
 */
const hasCache = (key) => {
  return getCache(key) !== null;
};

/**
 * Set item in cache with LRU-style eviction
 * @param {string} key
 * @param {any} data
 * @param {number} ttl TTL in seconds
 */
const setCache = (key, data, ttl) => {
  // Evict oldest entries if cache is full
  if (cache.size >= MAX_CACHE_SIZE) {
    const keysToDelete = [...cache.keys()].slice(0, 100); // Remove oldest 100
    keysToDelete.forEach(k => cache.delete(k));
  }
  
  cache.set(key, {
    data,
    expiry: Date.now() + (ttl * 1000)
  });
};

/**
 * Clear specific key or start-with keys
 * @param {string} prefix
 */
const clearCache = (prefix = null) => {
  if (!prefix) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
};

module.exports = {
  getCache,
  hasCache,
  setCache,
  clearCache
};
