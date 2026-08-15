jest.mock("react-native-worklets", () => require("react-native-worklets/lib/module/mock"));

jest.mock("react-native-keyboard-controller", () =>
  require("react-native-keyboard-controller/jest"),
);

const { setUpTests } = require("react-native-reanimated");
setUpTests();
