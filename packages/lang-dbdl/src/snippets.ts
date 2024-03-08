import {
  Completion,
  snippetCompletion as snip,
} from "@codemirror/autocomplete";

export const sourceFileSnippets: readonly Completion[] = [
  snip("Table ${} {\n\t${}\n}\n", {
    label: "tb",
    detail: "table block",
    type: "keyword",
  }),
];

export const columnSnippets: readonly Completion[] = [
  snip("Indexes {\n\t${}\n}\n", {
    label: "idx",
    detail: "indexes block",
    type: "keyword",
  }),
  snip("id ${bigint} not null pk ${auto}", {
    label: "id",
    type: "keyword",
  }),
  snip("CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci", {
    label: "utf8mb4",
    type: "keyword",
  }),
  snip("CHARACTER SET utf8 COLLATE utf8_unicode_ci", {
    label: "utf8",
    type: "keyword",
  }),
  snip("varchar(255)", {
    label: "varchar",
    type: "keyword",
  }),
  snip("int(10)", {
    label: "int",
    type: "keyword",
  }),
  snip("decimal(${1:10}, ${2:2})", {
    label: "decimal",
    type: "keyword",
  }),
];
