/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: { serverComponentsExternalPackages: ["better-sqlite3"] },
  trailingSlash: true,
  images: {
    unoptimized: true
  },
  webpack: (config) => {
    config.resolve = {
      ...config.resolve,
      alias: {
        ...config.resolve.alias,
        "pdfjs-dist$": "pdfjs-dist/legacy/build/pdf.mjs",
      },
    };

    config.optimization = {
      ...config.optimization,
      minimize: false,
    };

    return config;
  },
};

export default nextConfig;
