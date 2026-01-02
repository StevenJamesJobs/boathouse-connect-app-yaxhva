const { getDefaultConfig } = require('expo/metro-config');
const { FileStore } = require('metro-cache');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Use turborepo to restore the cache when possible
config.cacheStores = [
    new FileStore({ root: path.join(__dirname, 'node_modules', '.cache', 'metro') }),
  ];

// Ensure proper resolution of modules
config.resolver = {
  ...config.resolver,
  sourceExts: [...(config.resolver?.sourceExts || []), 'jsx', 'js', 'ts', 'tsx', 'json'],
};

module.exports = config;
