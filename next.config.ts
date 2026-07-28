import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The PDF route (§8) loads a headless browser at runtime — keep the browser
  // packages out of the bundle so they resolve from node_modules at runtime.
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium"],

  // @sparticuz/chromium finds its brotli payload with a *computed* path
  // (`join(dirname(import.meta.url), "..", "..", "bin")`), so output file
  // tracing can't see bin/*.br and drops it from the serverless bundle — the
  // deployed route then throws `The input directory ".../bin" does not exist`.
  // Trace them in explicitly for the one route that launches Chromium.
  // NOTE: this is why `build` does not pass --turbopack. Next only applies
  // outputFileTracingIncludes to entries in chunksTrace.entryNameFilesMap,
  // which only the webpack build populates — under turbopack the includes are
  // silently ignored and the .br payload is dropped again. Dev still uses
  // turbopack; only the production build must stay on webpack.
  outputFileTracingIncludes: {
    "/api/reports/[id]/pdf": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
};

export default nextConfig;
