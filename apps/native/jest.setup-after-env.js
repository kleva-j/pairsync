jest.mock("react-native-worklets", () => require("react-native-worklets/lib/module/mock"));

jest.mock("react-native-keyboard-controller", () =>
  require("react-native-keyboard-controller/jest"),
);

const { setUpTests } = require("react-native-reanimated");
setUpTests();

// Keep test output clean without hiding real diagnostics: drop the known
// noise sources, forward everything else.
const NOISE_PREFIXES = [
  // heroui-native prints a dev-only "Styling Principles" banner via
  // console.info on every provider mount (use-dev-info.ts).
  "HeroUI Native Styling Principles",
  // react-native's own deprecation notice, printed by the RN jest preset.
  "InteractionManager has been deprecated",
  // uniwind can't resolve Tailwind CSS variables in jest (no style pipeline).
  "Uniwind - We couldn't find your variable",
];

const isNoise = (args) =>
  typeof args[0] === "string" && NOISE_PREFIXES.some((prefix) => args[0].includes(prefix));

for (const method of ["info", "warn"]) {
  const original = console[method];
  console[method] = (...args) => {
    if (isNoise(args)) return;
    original(...args);
  };
}
