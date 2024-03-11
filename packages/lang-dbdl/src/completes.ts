import { syntaxTree } from "@codemirror/language";
import {
  CompletionSource,
  CompletionContext,
  CompletionResult,
  Completion,
} from "@codemirror/autocomplete";
import { SyntaxNode, SyntaxNodeRef, Tree } from "@lezer/common";
import { sourceFileSnippets, dataTypeSnippets } from "./snippets";

let kwCompletion = (name: string, idx: number) => ({
  label: name,
  type: "keyword",
  boost: idx,
});

const dataTypes = [
  "integer",
  "tinyint",
  "smallint",
  "mediumint",
  "bigint",
  "numeric",
  "float",
  "double",
  "real",
  "bit",
  "char",
  "text",
  "tinytext",
  "mediumtext",
  "longtext",
  "date",
  "datetime",
  "timestamp",
  "time",
  "year",
  "enum",
  "set",
  "binary",
  "varbinary",
  "blob",
  "tinyblob",
  "mediumblob",
  "longblob",
  "json",
  "bool",
  "boolean",
  "unsigned",
  "zerofill",
].map(kwCompletion);

const options = [
  "pk",
  "auto",
  "not",
  "null",
  "unique",
  "default",
  "asc",
  "desc",
  "true",
  "false",
].map(kwCompletion);

const indexTypes = ["btree", "hash"];

export const dontComplete = [
  "String",
  "LineComment",
  "BlockComment",
  "ColumnComment",
];

const findParent = (node: SyntaxNode, name: string): SyntaxNode | null => {
  let parent = node.parent;
  while (parent != null) {
    if (parent.name === name) {
      return parent;
    }
    parent = parent.parent;
  }
  return null;
};

const findCompletion = (
  tree: Tree,
  context: CompletionContext
): CompletionResult | null => {
  let cursor = tree.cursor();
  do {
    console.log(cursor.name, cursor.from, cursor.to, context.pos);
    if (cursor.type.isError) {
      let node = cursor.node;
      if (node.parent?.name === "SourceFile") {
        return {
          options: sourceFileSnippets,
          from: node.from,
        };
      }
      let prev = node.prevSibling;
      if (prev?.name === "ColumnName" || findParent(node, "DataType")) {
        const char = context.state.sliceDoc(node.from - 1, node.to);
        if (char === " ") {
          return {
            options: dataTypeSnippets.concat(dataTypes),
            from: node.from,
          };
        }
      }
      if (findParent(node, "Options")) {
        return {
          options,
          from: node.from,
        };
      }
    }
  } while (cursor.next());

  return null;
};

export const indexBlockCompletionSource: CompletionSource = (context) => {
  let node: SyntaxNode | null = syntaxTree(context.state).resolve(
    context.pos,
    -1
  );
  while (node != null) {
    if (node.name === "Index") {
      const block = node.lastChild;
      if (block && context.pos >= block.to) {
        let str = context.state.sliceDoc(block.from, context.pos);
        let pos = block.from + str.lastIndexOf(" ") + 1;

        let completion: string[] = [];
        let idxType = node.getChild("IndexType") as SyntaxNodeRef;
        if (idxType) {
          let { from, to } = idxType;
          let typ = context.state.sliceDoc(from, to);
          if (typ.includes("unique")) {
            if (typ.includes("hash") || typ.includes("btree")) {
              return null;
            }
            completion = indexTypes;
          } else if (
            !typ.includes("unique") &&
            (typ.includes("hash") || typ.includes("btree"))
          ) {
            completion = ["unique"];
          }
        } else {
          completion = indexTypes.concat("unique");
        }
        if (completion.length > 0) {
          return {
            options: completion.map(kwCompletion),
            from: pos,
          };
        }
        return null;
      }
    }
    if (node.name === "IndexColumnBlock") {
      let from = context.pos;
      let column: string[] = node.getChildren("IndexColumnName").map((c) => {
        if (c.to === from) {
          from = c.from;
        }
        return context.state.sliceDoc(c.from, c.to);
      });

      let p = node.parent;
      while (p != null) {
        if (p.name === "TableBlock") {
          let options: Completion[] = [];
          let boost = 99;
          p.getChildren("Column")
            .map((c) => {
              let name = c.getChild("ColumnName");
              return context.state.sliceDoc(name?.from, name?.to);
            })
            .forEach((name) => {
              if (column.indexOf(name) !== -1) {
                return null;
              }
              options.push(kwCompletion(name, --boost));
            });
          return { options, from };
        }
        p = p.parent;
      }
    }
    node = node.parent;
  }
  return null;
};

export const localCompletionSource: CompletionSource = (context) => {
  console.log("===>", context.pos);
  let tree = syntaxTree(context.state);
  if (dontComplete.indexOf(tree.resolve(context.pos, -1).name) > -1)
    return null;
  return findCompletion(tree, context);
};
