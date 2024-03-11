import { parser } from "./dbdl.grammar";
import {
  LRLanguage,
  LanguageSupport,
  indentNodeProp,
  foldNodeProp,
  delimitedIndent,
} from "@codemirror/language";
import { completeFromList, ifNotIn, ifIn } from "@codemirror/autocomplete";
import { styleTags, tags as t } from "@lezer/highlight";
import {
  localCompletionSource,
  indexBlockCompletionSource,
  dontComplete,
} from "./completes";
import { langLinter } from "./linter";
import { tableSnippets } from "./snippets";

export const dbdlLanguage = LRLanguage.define({
  parser: parser.configure({
    props: [
      indentNodeProp.add({
        TableBlock: delimitedIndent({ closing: "}" }),
        IndexBlock: delimitedIndent({ closing: "}" }),
        BlockComment: () => null,
      }),
      foldNodeProp.add({
        // IndexBlock: foldInside,
        BlockComment(tree) {
          return { from: tree.from + 2, to: tree.to - 2 };
        },
      }),
      styleTags({
        "pk auto unique": t.keyword,
        Number: t.number,
        Identifier: t.variableName,
        LineComment: t.lineComment,
        BlockComment: t.blockComment,
        ColumnComment: t.docComment,
        Table: t.keyword,
        Indexes: t.keyword,
        String: t.string,
        "DataType/...": t.keyword,
        "( )": t.paren,
        "[ ]": t.squareBracket,
        "{ }": t.brace,
      }),
    ],
  }),
  languageData: {
    closeBrackets: { brackets: ["(", "[", "{", "'", '"', "`"] },
    commentTokens: { line: "//", block: { open: "/*", close: "*/" } },
  },
});

export function dbdl(): LanguageSupport {
  return new LanguageSupport(dbdlLanguage, [
    dbdlLanguage.data.of({
      autocomplete: ifIn(["Index"], indexBlockCompletionSource),
    }),
    dbdlLanguage.data.of({
      autocomplete: ifNotIn(
        ["IndexBlock"],
        ifIn(["SourceFile", "Column"], localCompletionSource)
      ),
    }),
    dbdlLanguage.data.of({
      autocomplete: ifIn(
        ["TableBlock"],
        ifNotIn(["IndexBlock"], completeFromList(tableSnippets))
      ),
    }),
    langLinter,
  ]);
}
