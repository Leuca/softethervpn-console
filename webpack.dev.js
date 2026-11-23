/* eslint-disable @typescript-eslint/no-var-requires */

const path = require('path');
const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');
const { stylePaths } = require('./stylePaths');

// Load the dev-only VPN server settings (.env, gitignored) into process.env so
// the proxy below can reach the server. Values are documented in .env.defaults.
require('dotenv').config();
function loopbackHost(host) {
  if (host === 'localhost') return '127.0.0.1';
  if (host === '127.0.0.1' || host === '::1') return host;
  throw new Error('Development proxy HOST must be 127.0.0.1, ::1, or localhost.');
}

const HOST = loopbackHost(process.env.HOST ?? '127.0.0.1');
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
    setupMiddlewares(middlewares, server) {
      // webpack serve can override the configured listener. Check it before listen().
      if (server.options.ipc) throw new Error('Development proxy requires loopback TCP; IPC is not supported.');
      server.options.host = loopbackHost(server.options.host);
      return middlewares;
    },
    historyApiFallback: true,
    open: true,
    static: {
      directory: path.resolve(__dirname, 'dist'),
    },
    client: {
      overlay: true,
    },
    // Keep browser RPC same-origin and verify the upstream before sending admin
    // credentials. SoftEther drops requests with an empty hub header.
    proxy: [
      {
        context: ['/api'],
        target: `https://${VPN_HOST}:${VPN_PORT}`,
        secure: true,
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
