/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@fhevm-sdk'],
  webpack: (config) => {
    config.resolve.extensionAlias = {
      '.js': ['.js', '.ts', '.tsx'],
    };
    return config;
  },
}

module.exports = nextConfig
