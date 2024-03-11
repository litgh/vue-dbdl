<template>
  <div class="flex justify-items-start gap-2">
    <div class="px-1 flex justify-between">
      <button
        :class="`px-2 rounded-sm m-1 ${
          showAst ? 'bg-gray-300' : 'bg-white border'
        }`"
        @click="showAst = false"
      >
        Script
      </button>
      <button
        :class="`px-2  rounded-sm m-1 ${
          showAst ? 'bg-white border' : 'bg-gray-300'
        }`"
        @click="showAst = true"
      >
        AST
      </button>
    </div>
    <div>
      <select name="theme" v-model="config.theme" class="border p-1">
        <option
          :value="option"
          :key="option"
          v-for="option in ['Theme', ...Object.keys(themes)]"
        >
          {{ option }}
        </option>
      </select>
      <select name="database" v-model="database" class="border p-1 ml-1">
        <option :value="k" :key="v" v-for="(k, v) in databases">
          {{ v }}
        </option>
      </select>
    </div>
  </div>
  <hr />
  <div class="flex flex-row">
    <div :class="`w-1/4 ${showAst ? 'hidden' : ''}`">
      <Editor
        :config="config"
        :extensions="[
          currentTheme,
          language,
          keymap.of(defaultKeymap),
          keymap.of(searchKeymap),
          keymap.of([{ key: 'Ctrl-d', mac: 'Cmd-d', run: deleteLine }]),
        ]"
        :code="code"
        @change="viewUpdate"
        @save="autoSave"
      />
    </div>
    <div :class="`w-1/4 ${!showAst ? 'hidden' : ''}`">
      <Editor
        :config="config"
        :extensions="[currentTheme, json()]"
        :code="ast"
      />
    </div>
    <div class="w-3/4">
      <Editor
        :config="config"
        :extensions="[themes.espresso, sql()]"
        :code="genSql"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from "vue";
import Editor from "@/components/Editor.vue";
import * as themes from "./components/themes";
import {
  MySQL,
  PostgreSQL,
  SQLite,
  MSSQL,
  dbdl,
  tokens,
} from "@vue-dbdl/lang-dbdl2";
import { SyntaxNodeRef, Tree } from "@lezer/common";
import { json } from "@codemirror/lang-json";
import { sql } from "@codemirror/lang-sql";
import { Knex, knex } from "knex-browser";
import { ViewUpdate, keymap } from "@codemirror/view";
import { defaultKeymap, deleteLine } from "@codemirror/commands";
import { searchKeymap } from "@codemirror/search";

interface Table {
  name: string;
  schema: string | null;
  comment: string | null;
  columns: {
    name: string;
    type: string;
    pk: boolean;
    auto: boolean;
    notNull: boolean;
    default: string | null;
    comment: string;
    rawType: string;
  }[];
}
const db = computed(() =>
  knex({
    dialect: database.value,
  })
);
const code = ref("");
const ast = ref("");
const genSql = ref("");
const showAst = ref(false);
const tables = {} as {
  [tableName: string]: Table;
};
const databases: { [key: string]: string } = {
  Mysql: "mysql",
  PostgreSQL: "pg",
  Sqlite3: "sqlite3",
  Mssql: "mssql",
};
const database = ref("mysql");
const config = reactive({
  disable: false,
  indentWithTab: true,
  tabSize: 2,
  autofocus: true,
  height: "93vh",
  theme: "dracula",
});

onMounted(() => {
  localStorage.getItem("code") && (code.value = localStorage.getItem("code")!);
  if (code.value) {
    parseScript(code.value);
  }
});

const currentTheme = computed(() => {
  return config.theme !== "Theme"
    ? (themes as any)[config.theme]
    : themes.espresso;
});
const language = computed(() => {
  console.log("=======>", database.value);
  switch (database.value) {
    case "mysql":
      return dbdl({ dialect: MySQL });
    case "pg":
      return dbdl({ dialect: PostgreSQL });
    case "sqlite3":
      return dbdl({ dialect: SQLite });
    case "mssql":
      return dbdl({ dialect: MSSQL });
    default:
      return dbdl();
  }
});
const dbdlLang = language.value.language;

function viewUpdate(view: ViewUpdate): void {
  genSql.value = "";
  if (view.state.doc.length == 0) {
    return;
  }
  parseScript(view.state.doc.toString());
}

function autoSave(doc: string): void {
  localStorage.setItem("code", doc);
}

function parseScript(doc: string): void {
  const tree = dbdlLang.parser.parse(doc);
  ast.value = indentStringWithBrackets(tree.toString());
  let cursor = tree.cursor();
  let loop = cursor.next();
  do {
    switch (cursor.type.id) {
      case tokens.TableDeclaration:
        tableParse(tree, doc, cursor.from, cursor.to);
        loop = cursor.nextSibling();
        break;
      default:
        loop = cursor.next();
        break;
    }
  } while (loop);
}

function tableParse(
  tree: Tree,
  doc: string,
  from: number = 0,
  to: number
): Table | undefined {
  const table: Table = {
    name: "",
    schema: null,
    comment: null,
    columns: [],
  };
  tree.iterate({
    from: from,
    to: to,
    enter(node: SyntaxNodeRef) {
      switch (node.type.id) {
        case tokens.TableName:
          let name = doc.substring(node.from, node.to);
          if (name.includes(".")) {
            const [schema, name] = table.name.split(".");
            table.schema = schema;
            table.name = name;
          } else {
            table.name = name;
          }
          break;
        case tokens.TableComment:
          table.comment = doc.substring(node.from, node.to);
          if (table.comment.startsWith("@")) {
            table.comment = table.comment.substring(1).trim();
          } else {
            table.comment = table.comment
              .substring(3, table.comment.length - 3)
              .trim();
          }
          break;
        case tokens.ColumnDeclaration:
          parseColumn(tree, doc, table, node);
          break;
        default:
          break;
      }
    },
    leave(node: SyntaxNodeRef) {
      if (node.type.is(tokens.TableDeclaration) && table.name) {
        generateSql(table);
      }
    },
  });
  return table;
}

function parseColumn(
  tree: Tree,
  doc: string,
  table: Table,
  node: SyntaxNodeRef
) {
  const column: any = {};
  tree.iterate({
    from: node.from,
    to: node.to,
    enter(node: SyntaxNodeRef) {
      switch (node.type.id) {
        case tokens.ColumnName:
          column.name = doc.substring(node.from, node.to);
          break;
        case tokens.ColumnType:
          column.type = doc
            .substring(node.from, node.to)
            .replace(/[\[\]]/g, "");
          const { from, to } = node.node.firstChild as SyntaxNodeRef;
          column.rawType = doc.substring(from, to);
          break;
        case tokens.ColumnOptions:
          let option = doc.substring(node.from, node.to);
          const nodeType = node.node.firstChild?.type.id;
          switch (nodeType) {
            case tokens.Comment:
              if (option.startsWith("#")) {
                column.comment = option.substring(1).trim();
              } else {
                column.comment = option.substring(3, option.length - 3).trim();
              }
              break;
            case tokens.Keyword:
              switch (option) {
                case "pk":
                  column.pk = true;
                  break;
                case "auto":
                  column.auto = true;
                  break;
              }
              break;
            case tokens.NotNull:
              column.notNull = option.toLowerCase().includes("not");
              break;
            case tokens.DefaultValue:
              column.default = option.trim().substring(8).replaceAll('"', "'");
              if (
                node.node.firstChild?.lastChild?.type.is(
                  tokens.QuotedIdentifier
                )
              ) {
                column.default = column.default.substring(
                  1,
                  column.default.length - 1
                );
              }
              break;
          }
          break;
        default:
          break;
      }
    },
    leave(node: SyntaxNodeRef) {
      if (node.type.is(tokens.ColumnDeclaration)) {
        table.columns.push(column);
      }
    },
  });
}

function generateSql(table: Table) {
  tables[table.name] = table;
  console.log(db.value.client);
  let formatSql = "";
  let sqlStr = db.value.schema
    .createTable(table.name, (tb) => {
      if (table.comment) {
        tb.comment(table.comment || "");
      }
      for (const c of table.columns) {
        let b: Knex.ColumnBuilder | null = null;
        if (c.auto) {
          b =
            c.rawType === "bigint"
              ? tb.bigIncrements(c.name)
              : tb.increments(c.name);
        } else if (c.name || c.rawType) {
          b = tb.specificType(c.name, c.rawType);
        } else {
          continue;
        }
        if (c.pk) {
          b.primary();
        }
        if (c.notNull) {
          b.notNullable();
        }
        if (c.default !== null && c.default !== undefined) {
          b.defaultTo(db.value.raw(c.default));
        }
        if (c.comment) {
          b.comment(c.comment);
        }
      }
    })
    .toSQL()
    .map((sql) => sql.sql)
    .join("");
  const regex = /create table `(.+)?`\s*\(((,?)\s*(.+)?)*\)(.+)?/;
  let match = regex.exec(sqlStr);
  if (match) {
    formatSql += "create table `" + match[1] + "` (\n";
    if (match.length > 1 && match[2]) {
      formatSql += "\t" + match[2].replaceAll(",", ",\n\t");
    }
    if (match.length > 4 && match[5]) {
      formatSql += "\n)" + match[5] + ";\n\n";
    } else {
      formatSql += "\n);\n\n";
    }
  }
  genSql.value += formatSql;
}

function indentStringWithBrackets(input: string) {
  let output = "";
  let indentLevel = 0;
  let token = "";

  // 遍历输入字符串的每个字符
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    // 如果字符是括号，则根据括号的类型增加或减少缩进级别
    if (char === "(") {
      indentLevel++;
      output += token + "\n" + " ".repeat(indentLevel * 2 - 2) + "- ";
      token = "";
    } else if (char === ",") {
      if (token) {
        output += token + "\n" + " ".repeat(indentLevel * 2 - 2) + "- ";
        token = "";
      } else {
        output += " ".repeat(indentLevel * 2 - 2) + "- ";
      }
    } else if (char === ")") {
      indentLevel--;
      if (token) {
        output += token + "\n";
        token = "";
      }
    } else {
      token += char;
    }
  }

  return output;
}
</script>
