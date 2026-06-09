const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const contractsRoot = path.resolve(projectRoot, '..', 'Signalix-contracts');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [
  ...(config.watchFolders || []),
  contractsRoot,
];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(contractsRoot, 'node_modules'),
];

config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  '@signalix/contracts': contractsRoot,
};

config.resolver.disableHierarchicalLookup = false;

module.exports = config;
