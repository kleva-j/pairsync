const { withAndroidManifest } = require("@expo/config-plugins");

const PERMISSIONS = [
  "android.permission.CHANGE_NETWORK_STATE",
  "android.permission.ACCESS_NETWORK_STATE",
  "android.permission.CHANGE_WIFI_MULTICAST_STATE",
];

const withAndroidMulticastPermissions = (config) => {
  return withAndroidManifest(config, (c) => {
    const manifest = c.modResults.manifest;
    if (!manifest["uses-permission"]) manifest["uses-permission"] = [];
    for (const name of PERMISSIONS) {
      const exists = manifest["uses-permission"].some(
        (p) => p.$["android:name"] === name
      );
      if (!exists) {
        manifest["uses-permission"].push({ $: { "android:name": name } });
      }
    }
    return c;
  });
};

module.exports = withAndroidMulticastPermissions;
