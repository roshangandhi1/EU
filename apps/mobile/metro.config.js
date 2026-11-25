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

module.exports = config;
