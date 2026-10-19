// Metro is the bundler that turns our TypeScript into the JS the app runs.
// These two tweaks are only needed so expo-sqlite works on web.
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// On web, SQLite runs as a WebAssembly (.wasm) file, so Metro must serve it.
config.resolver.assetExts.push("wasm");

// The web SQLite build needs SharedArrayBuffer, which browsers only allow on
// "cross-origin isolated" pages. These headers turn that on for the dev server.
config.server.enhanceMiddleware = (middleware) => (req, res, next) => {
  res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  return middleware(req, res, next);
};

module.exports = config;
