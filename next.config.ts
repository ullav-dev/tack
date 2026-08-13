import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { execFileSync } from "child_process";
import { readFileSync } from "fs";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const appVersion: string = JSON.parse(readFileSync("./package.json", "utf-8")).version;
const gitSha: string = (() => {
  try { return execFileSync("git", ["rev-parse", "--short", "HEAD"]).toString().trim(); }
  catch { return "dev"; }
})();

const nextConfig: NextConfig = {
  output: "standalone",
  // @ullav-dev/dam-picker ships raw TS source with no build step -- unlike
  // tack-notes (consumed here via an in-repo file: symlink, which Next
  // already treats as first-party source), dam-picker is a real registry
  // install, and Next excludes node_modules from transpilation by default.
  transpilePackages: ["@ullav-dev/dam-picker"],
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
    NEXT_PUBLIC_GIT_SHA: gitSha,
  },
};

export default withNextIntl(nextConfig);
