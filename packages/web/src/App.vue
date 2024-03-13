<template>
  <div>
    <div class="flex justify-items-start justify-start gap-2 h-[3.5vh]">
      <div class="py-1 flex justify-between">
        <button
          :class="`w-20 rounded ${
            showAst ? 'bg-gray-300 text-gray-500' : 'bg-white border'
          }`"
          @click="showAst = false"
        >
          Script
        </button>
        <button
          :class="`w-20 rounded ml-1 ${
            showAst ? 'bg-white border' : 'bg-gray-300 text-gray-500'
          }`"
          @click="showAst = true"
        >
          AST
        </button>
      </div>
      <div class="flex py-1">
        <select name="theme" v-model="config.theme" class="border rounded">
          <option
            :value="option"
            :key="option"
            v-for="option in ['Theme', ...Object.keys(themes)]"
          >
            {{ option }}
          </option>
        </select>
        <select name="database" v-model="dialect" class="border rounded ml-1">
          <option :value="k" :key="v" v-for="(k, v) in dialects">
            {{ v }}
          </option>
        </select>
      </div>
    </div>
    <div class="flex flex-row items-stretch">
      <div class="w-1/3 flex-shrink-0" ref="scriptEditor">
        <div :class="`${showAst ? 'hidden' : ''}`">
          <Editor
            :config="config"
            :extensions="[currentTheme, ...exts]"
            :language="language"
            :code="code"
            @change="viewUpdate"
            @autoSave="autoSave"
          />
        </div>
        <div :class="`${!showAst ? 'hidden' : ''}`">
          <Editor
            :config="config"
            :extensions="[currentTheme, ...exts]"
            :language="json()"
            :code="ast"
          />
        </div>
      </div>
      <div
        ref="resizable"
        style="user-select: none"
        class="hover:bg-[#005FB8] w-1 min-h-full pointer-events-auto cursor-col-resize"
        @mousedown="startResize"
        @mouseup="stopResize"
      ></div>
      <div class="w-2/3 flex-1 flex-shrink" ref="sqlEditor">
        <Editor
          :config="config"
          :extensions="[themes.espresso, ...exts]"
          :language="sqlLang()"
          :code="sql"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from "vue";
import Editor from "./components/Editor.vue";
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
import { sql as sqlLang } from "@codemirror/lang-sql";
import { Knex, knex } from "knex-browser";
import { ViewUpdate, keymap, EditorView } from "@codemirror/view";
import { defaultKeymap, deleteLine } from "@codemirror/commands";
import { searchKeymap } from "@codemirror/search";
import { Text } from "@codemirror/state";

const exts = [
  keymap.of(defaultKeymap),
  keymap.of(searchKeymap),
  keymap.of([{ key: "Ctrl-d", mac: "Cmd-d", run: deleteLine }]),
  EditorView.lineWrapping,
];

interface Table {
  name: string;
  schema: string | null;
  comment: string | null;
  columns: {
    [key: string]: {
      name: string;
      type: string;
      pk: boolean;
      auto: boolean;
      notNull: boolean;
      default: string | null;
      comment: string;
      rawType: string;
      precision: number | null;
      scale: number | null;
    };
  };
  indexes: {
    columns: {
      name: string;
      order: "ASC" | "DESC" | undefined;
    }[];
    name: string | undefined;
    unique: boolean | undefined;
    type: string | undefined;
    comments: string | undefined;
  }[];
}

const dialects: { [key: string]: string } = {
  Mysql: "mysql",
  PostgreSQL: "pg",
  Sqlite3: "sqlite3",
  Mssql: "mssql",
};
const dialect = ref("mysql");
const db = computed(() =>
  knex({
    dialect: dialect.value,
  })
);

const code = ref("");
const ast = ref("");
const sql = ref("");
const showAst = ref(false);
const tables = {} as {
  [tableName: string]: Table;
};

onMounted(() => {
  localStorage.getItem("code") && (code.value = localStorage.getItem("code")!);
  if (code.value) {
    console.log("load code", code.value);
    parseScript(code.value);
  }
});

const config = reactive({
  disable: false,
  indentWithTab: true,
  tabSize: 2,
  autofocus: true,
  height: "96.5vh",
  theme: "oneDark",
});

const currentTheme = computed(() => {
  return config.theme !== "Theme"
    ? (themes as any)[config.theme]
    : themes.espresso;
});
const language = computed(() => {
  console.log("use dialect: ", dialect.value);
  switch (dialect.value) {
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

function autoSave(doc: string): void {
  localStorage.setItem("code", doc);
}

watch(language, () => {
  if (code.value) {
    parseScript(code.value);
  }
});

function viewUpdate(view: ViewUpdate, tree: Tree): void {
  parseTree(tree, view.state.doc);
}

function parseScript(doc: string): void {
  const tree = dbdlLang.parser.parse(doc);
  const state = Text.of([doc]);
  parseTree(tree, state);
}

function parseTree(tree: Tree, doc: Text): void {
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
  doc: Text,
  from: number = 0,
  to: number
): Table | undefined {
  const table: Table = {
    name: "",
    schema: null,
    comment: null,
    columns: {},
    indexes: [],
  };
  tree.iterate({
    from: from,
    to: to,
    enter(node: SyntaxNodeRef) {
      switch (node.type.id) {
        case tokens.TableName:
          let name = doc.sliceString(node.from, node.to);
          if (name.includes(".")) {
            const [schema, name] = table.name.split(".");
            table.schema = schema;
            table.name = name;
          } else {
            table.name = name;
          }
          break;
        case tokens.TableComment:
          table.comment = doc.sliceString(node.from, node.to);
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
        case tokens.IndexDeclaration:
          parseIndex(tree, doc, table, node);
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

function parseColumn(tree: Tree, doc: Text, table: Table, node: SyntaxNodeRef) {
  let column: any = {};
  tree.iterate({
    from: node.from,
    to: node.to,
    enter(node: SyntaxNodeRef) {
      switch (node.type.id) {
        case tokens.ColumnName:
          column.name = doc.sliceString(node.from, node.to);
          break;
        case tokens.ColumnType:
          column.type = doc
            .sliceString(node.from, node.to)
            .replace(/[\[\]]/g, "");
          const { from, to } = node.node.getChild(tokens.Type) as SyntaxNodeRef;
          column.rawType = doc.sliceString(from, to);
          const [precision, scale] = [
            node.node.getChild(tokens.Precision),
            node.node.getChild(tokens.Scale),
          ];
          if (precision != null) {
            column.precision = parseInt(
              doc.sliceString(precision.from, precision.to)
            );
          }
          if (scale != null) {
            column.scale = parseInt(doc.sliceString(scale.from, scale.to));
          }
          break;
        case tokens.ColumnOptions:
          let option = doc.sliceString(node.from, node.to);
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
        table.columns[column.name] = column;
        column = {};
      }
    },
  });
}

function parseIndex(tree: Tree, doc: Text, table: Table, node: SyntaxNodeRef) {
  let index: any = { columns: [] };
  tree.iterate({
    from: node.from,
    to: node.to,
    enter(node: SyntaxNodeRef) {
      switch (node.type.id) {
        case tokens.IndexName:
          index.name = doc.sliceString(node.from, node.to);
          break;
        case tokens.ColumnName:
          const column: any = {};
          column.name = doc.sliceString(node.from, node.to);
          if (node.node.nextSibling?.type.id === tokens.Keyword) {
            const { from, to } = node.node.nextSibling;
            const order = doc.sliceString(from, to).toUpperCase();
            if (order === "ASC" || order === "DESC") {
              column.order = order;
            }
          }
          index.columns.push(column);
          break;
        case tokens.IndexOptions:
          if (node.node.firstChild?.type.id === tokens.Keyword) {
            const type = doc.sliceString(node.from, node.to).toLowerCase();
            if (type === "unique") {
              index.unique = true;
            }
            if (type === "btree" || type === "hash") {
              index.type = type;
            }
          }
          if (node.node.nextSibling?.type.id === tokens.Comment) {
            const { from, to } = node.node.nextSibling;
            index.comment = doc.sliceString(from, to);
          }
          break;
        default:
          break;
      }
    },
    leave(node: SyntaxNodeRef) {
      if (node.type.is(tokens.IndexDeclaration)) {
        table.indexes.push(index);
        index = {};
      }
    },
  });
}

function generateSql(table: Table) {
  tables[table.name] = table;
  if (
    Object.values(table.columns).filter(
      (c) => c.type === undefined || c.name === undefined
    ).length
  ) {
    return;
  }
  sql.value = "";
  let sqlStr = db.value.schema
    .createTable(table.name, (tb) => {
      if (table.comment) {
        tb.comment(table.comment || "");
      }
      for (const c of Object.values(table.columns)) {
        let b: Knex.ColumnBuilder | null = null;
        if (c.auto) {
          b =
            c.rawType === "bigint"
              ? tb.bigIncrements(c.name)
              : tb.increments(c.name);
        } else if (c.name && c.rawType) {
          switch (c.rawType) {
            case "integer":
            case "int":
              b = tb.integer(c.name, c.precision || undefined);
              break;
            case "tinyint":
              b = tb.tinyint(c.name, c.precision || undefined);
              break;
            case "binary":
              b = tb.binary(c.name, c.precision || undefined);
              break;
            case "varchar":
              b = tb.string(c.name, c.precision || 255);
              break;
            case "decimal":
              b = tb.decimal(c.name, c.precision || 10, c.scale || 2);
              break;
            default:
              b = tb.specificType(c.name, c.rawType);
          }
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
      for (const index of table.indexes) {
        const columns = index.columns
          .filter((c) => table.columns[c.name])
          .map((c) => c.name);
        if (columns.length) {
          if (index.unique) {
            tb.unique(columns, {
              indexName: index.name,
              storageEngineIndexType: index.type,
            });
          } else {
            const options = index.type
              ? {
                  storageEngineIndexType:
                    index.type as Knex.storageEngineIndexType,
                }
              : {};
            tb.index(columns, index.name, options);
          }
        }
      }
    })
    .toSQL()
    .map((sql) => sql.sql)
    .join("");
  // const regex =
  //   /,(?=(?:[^']*'[^']*')*[^']*$)(?=(?:[^\/]*\/\/[^\n]*\n)*[^\/]*$)/g;
  // formatSql +=
  //   sqlStr.replace(/\((.+)\)/, "(\n\t$1\n)").replaceAll(regex, ",\n\t") + ";";
  sql.value +=
    reformatSql(sqlStr).replaceAll("alter table", ";\nalter table") + ";";
}

function reformatSql(str: string) {
  let stack = [];
  let output: string[] = [];
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    switch (char) {
      case "(":
        stack.push(char);
        output.push(char);
        if (stack.length === 1) {
          output.push("\n\t");
        }
        break;
      case "'":
        if (stack[stack.length - 1] == "'") {
          stack.pop();
        } else {
          stack.push(char);
        }
        output.push(char);
        break;
      case ",":
        output.push(char);
        if (stack.length === 1) {
          output.push("\n\t");
        }
        break;
      case ")":
        stack.pop();
        if (stack.length === 0) {
          output.push("\n");
          stack.push("(");
          stack.push(")");
        }
        output.push(char);
        break;
      default:
        output.push(char);
    }
  }
  return output.join("");
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

const resizable = ref<HTMLElement | null>(null);
const scriptEditor = ref<HTMLElement | null>(null);
const sqlEditor = ref<HTMLElement | null>(null);
const resizing = ref(false);
function startResize() {
  if (resizable.value) {
    resizing.value = true;
    resizable.value!.classList.add("bg-[#005FB8]");
    document.addEventListener("mousemove", resize);
    document.addEventListener("mouseup", stopResize);
  }
}

function resize(event: MouseEvent) {
  if (resizing.value) {
    const width = Math.min(event.clientX, window.innerWidth / 2);
    scriptEditor.value!.style.width = `${width}px`;
    sqlEditor.value!.style.width = `${window.innerWidth - width}px`;
  }
}

function stopResize() {
  resizing.value = false;
  resizable.value!.classList.remove("bg-[#005FB8]");
  document.removeEventListener("mousemove", resize);
  document.removeEventListener("mouseup", stopResize);
}
</script>
