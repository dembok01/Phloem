import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The PDF route (§8) loads a headless browser at runtime — keep the browser
  // packages external so the bundler never tries to trace their binaries.
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium"],
};

export default nextConfig;
