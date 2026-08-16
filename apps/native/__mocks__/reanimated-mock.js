// expo-router/testing-library replaces `react-native-reanimated` with
// `react-native-reanimated/mock` (see its build/testing-library/mocks.js).
// The top-level `mock` entry doesn't resolve, and the official mock omits
// `useReducedMotion`, which heroui-native calls from its animation-settings
// provider. Map that subpath here so the mock is complete.
const ReanimatedMock = require("react-native-reanimated/lib/module/mock");

ReanimatedMock.useReducedMotion = ReanimatedMock.useReducedMotion ?? (() => false);

// The mock snapshots the commonTypes enums (`ReduceMotion`, `KeyboardState`,
// `SensorType`, `InterfaceOrientation`, `IOSReferenceFrame`) from the real
// index at load time. Under jest, that load runs through expo-router's mock
// factory, which triggers a circular require that leaves the enums undefined
// forever. Backfill them from the real commonTypes module so consumers like
// react-native-drawer-layout (`ReduceMotion.Never`) work in tests.
const realCommonTypes = require("react-native-reanimated/lib/module/commonTypes.js");
for (const name of [
  "ReduceMotion",
  "KeyboardState",
  "SensorType",
  "InterfaceOrientation",
  "IOSReferenceFrame",
]) {
  if (ReanimatedMock[name] === undefined && realCommonTypes[name] !== undefined) {
    ReanimatedMock[name] = realCommonTypes[name];
  }
}

module.exports = ReanimatedMock;
