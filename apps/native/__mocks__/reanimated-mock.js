// expo-router/testing-library replaces `react-native-reanimated` with
// `react-native-reanimated/mock` (see its build/testing-library/mocks.js).
// The top-level `mock` entry doesn't resolve, and the official mock omits
// `useReducedMotion`, which heroui-native calls from its animation-settings
// provider. Map that subpath here so the mock is complete.
const ReanimatedMock = require("react-native-reanimated/lib/module/mock");

ReanimatedMock.useReducedMotion = ReanimatedMock.useReducedMotion ?? (() => false);

module.exports = ReanimatedMock;
