import { Validator } from "convex/values";

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

export type Expand<ObjectType extends Record<any, any>> = ObjectType extends Record<
  any,
  any
>
  ? {
      [Key in keyof ObjectType]: ObjectType[Key];
    }
  : never;

type TableDefinition = Record<string, Validator<any>>;
type SchemaDefinition = Record<string, TableDefinition>;

type DocFromTableDefinition<TableDef extends TableDefinition> = {
  [Property in keyof TableDef]: TableDef[Property]["type"];
};

export type DataModelFromSchemaDefinition<SchemaDef extends SchemaDefinition> = {
  [TableName in keyof SchemaDef]: Expand<DocFromTableDefinition<SchemaDef[TableName]>>;
};
