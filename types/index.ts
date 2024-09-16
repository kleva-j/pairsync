export interface SelectOption {
  value: string;
  label: string;
  disable?: boolean;
  /** fixed option that can't be removed. */
  fixed?: boolean;
  /** Group the options by providing key. */
  [key: string]: string | boolean | undefined;
}

export interface GroupSelectOption {
  [key: string]: SelectOption[];
}

export interface MultipleSelectorRef {
  selectedValue: SelectOption[];
  input: HTMLInputElement;
  focus: () => void;
  reset: () => void;
}
