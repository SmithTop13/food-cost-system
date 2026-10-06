/** @type {import('next').NextConfig} */
const nextConfig = {
  // The browser talks only to this origin; Next.js forwards /api/* to the API service.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${process.env.API_URL ?? "http://localhost:3000"}/:path*` }];
  },
};

export default nextConfig;
