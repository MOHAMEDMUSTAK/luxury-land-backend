const cache = new Map();

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
 * Set item in cache
 * @param {string} key
 * @param {any} data
 * @param {number} ttl TTL in seconds
 */
const setCache = (key, data, ttl) => {
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
  setCache,
  clearCache
};
