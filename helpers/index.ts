import type { GroupSelectOption, SelectOption } from "@/types/index";

export function transToGroupOption(options: SelectOption[], groupBy?: string) {
  if (options.length === 0) return {};

  if (!groupBy) return { "": options };

  const groupOption: GroupSelectOption = {};
  options.forEach((option) => {
    const key = (option[groupBy] as string) || "";
    if (!groupOption[key]) {
      groupOption[key] = [];
    }
    groupOption[key].push(option);
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
