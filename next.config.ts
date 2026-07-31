import type { NextConfig } from "next";

const config: NextConfig = {
  turbopack: {
    root: process.cwd()
  },
  outputFileTracingIncludes: {
    "/api/max/webhook": ["./node_modules/@tesseract.js-data/rus/4.0.0/rus.traineddata.gz"]
  }
};

export default config;
