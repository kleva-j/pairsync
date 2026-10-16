const { withEntitlementsPlist, withInfoPlist } = require("@expo/config-plugins");

const withMulticastEntitlement = (config) => {
  config = withEntitlementsPlist(config, (c) => {
    c.modResults["com.apple.developer.networking.multicast"] = true;
    return c;
  });
  config = withInfoPlist(config, (c) => {
    c.modResults["NSLocalNetworkUsageDescription"] =
      "PairSync needs local network access to discover nearby devices for pair programming.";
    return c;
  });
  return config;
};

module.exports = withMulticastEntitlement;
