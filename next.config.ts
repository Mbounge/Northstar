import type { NextConfig } from "next";

const explicitDistDir = process.env.NEXT_DIST_DIR?.trim();
const developmentPort = process.env.NODE_ENV === "development"
  ? process.env.PORT?.trim()
  : undefined;

const nextConfig: NextConfig = {
  /* config options here */
  // Browser proof runs beside a developer's live Canvas session. Give the
  // isolated E2E server its own compiler state so it never contends for the
  // active `.next/dev/lock` or requires stopping the app under inspection.
  distDir: explicitDistDir || (developmentPort ? `.next-${developmentPort}` : ".next"),
  images: {
    qualities: [75, 80, 100],
    remotePatterns:[
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },
};

export default nextConfig;
