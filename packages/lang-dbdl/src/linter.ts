import { syntaxTree } from "@codemirror/language";
import { linter, Diagnostic } from "@codemirror/lint";

export const langLinter: any = linter((view) => {
  let diagnostics: Diagnostic[] = [];
  if (view.state.doc.length == 0) {
    return diagnostics;
  }
  let columnNames: string[] = [];
  syntaxTree(view.state)
    .cursor()
    .iterate((node) => {
      if (node.node.parent?.name === "ColumnName" && !node.type.isError) {
        columnNames.push(view.state.sliceDoc(node.from, node.to));
      }
      if (node.node.parent?.name === "IndexColumnName") {
        if (
          node.from < node.to &&
          columnNames.indexOf(view.state.sliceDoc(node.from, node.to)) == -1
        ) {
          diagnostics.push({
            from: node.from,
            to: node.to,
            severity: "error",
            message: "Column name not found",
          });
        }
      }
      if (!node.type.isError) {
        return;
      }
      if (node.node.parent?.name === "SourceFile") {
        diagnostics.push({
          from: node.from,
          to: node.to,
          severity: "error",
          message: "Keyword 'Table' is required",
          actions: [
            {
              name: "Add",
              apply(view, from) {
                view.dispatch({ changes: { from, insert: "Table " } });
              },
            },
          ],
        });
        return;
      }
      if (node.node.parent?.name === "TableName") {
        diagnostics.push({
          from: node.from - 1,
          to: node.to,
          severity: "hint",
          message: "Table name",
        });
        return;
      }
      if (node.node.parent?.name === "ColumnName") {
        diagnostics.push({
          from: node.from,
          to: node.to,
          severity: "hint",
          message: "Column name",
        });
        return;
      }
      if (node.node.prevSibling?.name === "ColumnName") {
        diagnostics.push({
          from: node.from,
          to: node.to,
          severity: "error",
          message: "data type expected",
        });
        return;
      }
      if (node.node.prevSibling?.name === "TableName") {
        diagnostics.push({
          from: node.from,
          to: node.to,
          severity: "error",
          message:
            "'{', <as query clause>, <default charset option>, <default collate option>, <engine clause>, <like table clause>, <other table option>, COMMENT or PARTITION expected",
        });
        return;
      }
      if (node.node.parent?.name === "Precision") {
        let ident = node.node.parent?.prevSibling;
        let [from, to] = [node.from, node.to];
        if (ident?.getChild("Identifier")) {
          from = ident.getChild("Identifier")!.from;
          to = ident.getChild("Identifier")!.to;
        }
        diagnostics.push({
          from: from,
          to: to,
          severity: "error",
          message: `<number> expected, got '${view.state.sliceDoc(from, to)}'`,
        });
        return;
      }
      if (node.node.parent?.name === "Nullable") {
        const char = view.state.sliceDoc(node.from - 1, node.to);
        diagnostics.push({
          from: node.from,
          to: node.to,
          severity: "error",
          message: "NULL expected",
          actions: [
            {
              name: "Add",
              apply(view, from) {
                view.dispatch({
                  changes: {
                    from: from,
                    insert: char === " " ? "null " : " null ",
                  },
                });
              },
            },
          ],
        });
        return;
      }
      if (node.node.getChild("Identifier")) {
        diagnostics.push({
          from: node.from,
          to: node.to,
          severity: "error",
          message: "",
        });
      }
    });
  return diagnostics;
});
