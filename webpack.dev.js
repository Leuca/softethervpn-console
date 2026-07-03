/* eslint-disable @typescript-eslint/no-var-requires */

const path = require('path');
const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');
const { stylePaths } = require('./stylePaths');

// Load the dev-only VPN server settings (.env, gitignored) into process.env so
// the proxy below can reach the server. Values are documented in .env.defaults.
require('dotenv').config();
const HOST = process.env.HOST || 'localhost';
const PORT = process.env.PORT || '9000';
const VPN_HOST = process.env.VPN_DEV_HOST || '127.0.0.1';
const VPN_PORT = process.env.VPN_DEV_PORT || '5555';
const VPN_HUB = process.env.VPN_DEV_HUB || '';
const VPN_PASSWORD = process.env.VPN_DEV_PASSWORD || '';

module.exports = merge(common('development'), {
  mode: 'development',
  // Cheaper source maps: correct file/line mapping without the per-column
  // detail of eval-source-map, which is not worth its build-time cost here.
  devtool: 'eval-cheap-module-source-map',
  // Persist compiled modules across runs so restarting the dev server only
  // rebuilds what changed. The cache is invalidated when the webpack configs
  // or the dependency tree change.
  cache: {
    type: 'filesystem',
    buildDependencies: {
      config: [__filename, path.resolve(__dirname, 'webpack.common.js')],
    },
  },
  devServer: {
    host: HOST,
    port: PORT,
    historyApiFallback: true,
    open: true,
    static: {
      directory: path.resolve(__dirname, 'dist'),
    },
    client: {
      overlay: true,
    },
    // Proxy JSON-RPC calls to the target VPN server so the browser talks to it
    // same-origin, exactly as it does in production. This sidesteps three
    // problems that block a direct cross-origin fetch during development: the
    // server's self-signed certificate (accepted here via secure:false), CORS,
    // and vpnrpc's empty X-VPNADMIN-HUBNAME header. We authenticate every
    // proxied request as the whole-server administrator by injecting
    // X-VPNADMIN-PASSWORD. X-VPNADMIN-HUBNAME is only added when a hub is
    // configured: an empty value makes SoftEther's HTTP parser drop the
    // connection.
    proxy: [
      {
        context: ['/api'],
        target: `https://${VPN_HOST}:${VPN_PORT}`,
        secure: false,
        changeOrigin: true,
        headers: {
          'X-VPNADMIN-PASSWORD': VPN_PASSWORD,
          ...(VPN_HUB ? { 'X-VPNADMIN-HUBNAME': VPN_HUB } : {}),
        },
      },
    ],
  },
  module: {
    rules: [
      {
        test: /\.css$/,
        include: [...stylePaths],
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
});
