/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: { serverComponentsExternalPackages: ["better-sqlite3"] },
  trailingSlash: true,
  images: {
    unoptimized: true
  }
};

export default nextConfig;
