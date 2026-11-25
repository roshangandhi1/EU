// Metro config: the app imports @eu/core and @eu/sync straight from ../../packages (TypeScript source),
// while every npm dependency resolves from this app's own node_modules.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const packagesRoot = path.resolve(projectRoot, "../../packages");

const config = getDefaultConfig(projectRoot);
config.watchFolders = [packagesRoot];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, "node_modules")];
config.resolver.extraNodeModules = {
  "@eu/core": path.join(packagesRoot, "core"),
  "@eu/sync": path.join(packagesRoot, "sync"),
  "@eu/forestry": path.join(packagesRoot, "forestry"),
  "@eu/boreholes": path.join(packagesRoot, "boreholes"),
  "@eu/schools": path.join(packagesRoot, "schools"),
};
config.resolver.disableHierarchicalLookup = true;
config.resolver.unstable_enablePackageExports = true;

// Browser preview for design review (EU_PREVIEW=1, see preview/README.md): the real screens on an
// in-memory demo session, with the native-only modules stubbed. Never used for the Android build.
if (process.env.EU_PREVIEW) {
  const stubs = {
    "expo-secure-store": path.join(projectRoot, "preview/stubs/secure-store.js"),
    "expo-location": path.join(projectRoot, "preview/stubs/location.js"),
  };
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (stubs[moduleName]) return { type: "sourceFile", filePath: stubs[moduleName] };
    if (moduleName === "./src/App" && context.originModulePath === path.join(projectRoot, "index.ts"))
      return { type: "sourceFile", filePath: path.join(projectRoot, "preview/PreviewApp.tsx") };
    return context.resolveRequest(context, moduleName, platform);
  };
}

module.exports = config;
