import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001",
  },
  // The vendored `@devdigest/shared` barrel is synced from the server, so its
  // re-exports carry NodeNext `.js` specifiers over `.ts` sources. Type-only
  // imports erased before webpack ever resolved them; the first runtime (Zod
  // schema) import from the barrel made webpack follow `./contracts/*.js` and
  // fail with "module not found". Map `.js` specifiers to the TS source.
  // ponytail: one resolver alias fixes the whole class — leaf-importing wouldn't
  // help since eval-ci.ts itself has `.js` cross-imports.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js", ".jsx"],
    };
    return config;
  },
};

export default withNextIntl(nextConfig);
