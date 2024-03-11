import {
  Completion,
  snippetCompletion as snip,
} from "@codemirror/autocomplete";

export const scriptSnippets: Completion[] = [
  snip("Table ${table_name} {\n\t@${表名注释}\n\t${}\n}\n", {
    label: "tb",
    detail: "table block",
    type: "keyword",
  }),
];

export const tableSnippets: Completion[] = [
  snip("Index {\n\t${}\n}\n", {
    label: "idx",
    detail: "indexes block",
    type: "keyword",
  }),
  snip("id ${bigint} not null pk ${auto} ", {
    label: "id",
    type: "keyword",
  }),
  snip("is_${} ${tinyint(1)} not null default 0", {
    label: "is",
    detail: "is_xx tinyint(1) not null default 0",
    type: "keyword",
  }),
];

export const dataTypeSnippets: Completion[] = [
  snip("CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ", {
    label: "utf8mb4",
    type: "keyword",
  }),
  snip("CHARACTER SET utf8 COLLATE utf8_unicode_ci ", {
    label: "utf8",
    type: "keyword",
  }),
  snip("varchar(${1:255}) ${}", {
    label: "varchar",
    type: "keyword",
  }),
  snip("int(${1:10}) ${}", {
    label: "int",
    type: "keyword",
  }),
  snip("decimal(${1:10}, ${2:2}) ${}", {
    label: "decimal",
    type: "keyword",
  }),
  snip("varchar(${1:255}) ${}", {
    label: "string",
    type: "keyword",
  }),
];
