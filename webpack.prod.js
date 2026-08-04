/* eslint-disable @typescript-eslint/no-var-requires */

const path = require('path');
const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');
const { stylePaths } = require('./stylePaths');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const TerserJSPlugin = require('terser-webpack-plugin');

const consoleMode = process.env.CONSOLE_MODE || 'integrated';

module.exports = (env = {}) => {
  const localBuild = Boolean(env.local);

  return merge(common('production'), {
    mode: 'production',
    devtool: localBuild ? false : 'source-map',
    cache: {
      type: 'filesystem',
      name: `production-${consoleMode}${localBuild ? '-local' : ''}`,
      buildDependencies: {
        config: [__filename, path.resolve(__dirname, 'webpack.common.js')],
      },
    },
    optimization: localBuild
      ? { minimize: false }
      : {
          minimizer: [
            new TerserJSPlugin({}),
            new CssMinimizerPlugin({
              minimizerOptions: {
                preset: ['default', { mergeLonghand: false }],
              },
            }),
          ],
        },
    plugins: [
      new MiniCssExtractPlugin({
        filename: '[name].css',
        chunkFilename: '[name].bundle.css',
      }),
    ],
    module: {
      rules: [
        {
          test: /\.css$/,
          include: [...stylePaths],
          use: [MiniCssExtractPlugin.loader, 'css-loader'],
        },
      ],
    },
  });
};
