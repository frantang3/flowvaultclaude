const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

/**
* Metro resolver shim.
*
* Some dependencies (notably `uuid`, and libs that depend on it) import
* `react-native-get-random-values` to polyfill `crypto.getRandomValues`.
*
* The a0 managed runtime doesn't ship that package, so we map the module name
* to a local shim implementation.
*/
const config = getDefaultConfig(__dirname);

config.resolver = config.resolver || {};
config.resolver.extraNodeModules = {
...(config.resolver.extraNodeModules || {}),
'react-native-get-random-values': path.resolve(__dirname, 'react-native-get-random-values.js'),
};

module.exports = config;
