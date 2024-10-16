import { RandomGenerator, xoroshiro128plus } from "pure-rand";
import type {
  GroupSelectOption,
  Randomizer,
  RangeOption,
  SelectOption,
  UrlLoremFlickrOptions,
} from "@/types/index";

export function transToGroupOption(options: SelectOption[], groupBy?: string) {
  if (!Array.isArray(options) || options.length === 0) return {};

  if (!groupBy) return { "": options };

  const groupOption: GroupSelectOption = {};

  options.forEach((option) => {
    const key = option[groupBy] ? (option[groupBy] as string) : "";
    const group = groupOption[key] || [];
    group.push(option);
    groupOption[key] = group;
  });
  return groupOption;
}

export function removePickedOption(
  groupOption: GroupSelectOption,
  picked: SelectOption[]
) {
  const cloneOption = JSON.parse(JSON.stringify(groupOption)) as GroupSelectOption;

  for (const [key, value] of Object.entries(cloneOption)) {
    cloneOption[key] = value.filter((val) => !picked.find((p) => p.value === val.value));
  }
  return cloneOption;
}

export function isOptionsExist(
  groupOption: GroupSelectOption,
  targetOption: SelectOption[]
) {
  for (const [, value] of Object.entries(groupOption)) {
    if (value.some((option) => targetOption.find((p) => p.value === option.value))) {
      return true;
    }
  }
  return false;
}

export const generatePureRandRandomizer = (
  seed: number | number[] = Date.now() ^ (Math.random() * 0x100000000),
  factory: (seed: number) => RandomGenerator = xoroshiro128plus
) => {
  const self = {
    next: () => (self.generator.unsafeNext() >>> 0) / 0x100000000,
    seed: (seed: number | number[]) => {
      const seedValue = typeof seed === "number" ? seed : seed[0];
      if (seedValue !== undefined) {
        self.generator = factory(seedValue);
      } else {
        throw new Error("Seed value is undefined.");
      }
    },
  } as Randomizer & { generator: RandomGenerator };
  self.seed(seed);
  return self;
};

export const range = (options: RangeOption = {}): number => {
  if (typeof options === "number") {
    options = { max: options };
  }

  const { min = 0, max = Number.MAX_SAFE_INTEGER, multipleOf = 1 } = options;

  if (!Number.isInteger(multipleOf)) {
    throw new Error(`multipleOf should be an integer.`);
  }

  if (multipleOf <= 0) {
    throw new Error(`multipleOf should be greater than 0.`);
  }

  const effectiveMin = Math.ceil(min / multipleOf);
  const effectiveMax = Math.floor(max / multipleOf);

  if (effectiveMin === effectiveMax) {
    return effectiveMin * multipleOf;
  }

  if (effectiveMax < effectiveMin) {
    if (max >= min) {
      throw new Error(`No suitable integer value between ${min} and ${max} found.`);
    }

    throw new Error(`Max ${max} should be greater than min ${min}.`);
  }

  const randomizer = generatePureRandRandomizer();
  const real = randomizer.next();
  const delta = effectiveMax - effectiveMin + 1; // +1 for inclusive max bounds and even distribution
  return Math.floor(real * delta + effectiveMin) * multipleOf;
};

export function urlLoremFlickr(options: UrlLoremFlickrOptions = {}): string {
  const {
    width = range({ min: 1, max: 3999 }),
    height = range({ min: 1, max: 3999 }),
    category,
  } = options;

  // https://loremflickr.com/

  return `https://loremflickr.com/${width}/${height}${
    category == null ? "" : `/${category}`
  }?lock=${range({ min: 1, max: 3999 })}`;
}
