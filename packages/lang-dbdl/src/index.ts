import { parser } from './dbdl.grammar';
import {
  LRLanguage,
  LanguageSupport,
  indentNodeProp,
  foldNodeProp,
  delimitedIndent,
} from '@codemirror/language';
import { styleTags, tags as t } from '@lezer/highlight';
import { localIndexBlockCompletionSource } from './completes';
import { langLinter } from './linter';

export const dbdlLanguage = LRLanguage.define({
  parser: parser.configure({
    props: [
      indentNodeProp.add({
        TableBlock: delimitedIndent({ closing: '}' }),
        IndexBlock: delimitedIndent({ closing: '}' }),
        BlockComment: () => null,
      }),
      foldNodeProp.add({
        // IndexBlock: foldInside,
        BlockComment(tree) {
          return { from: tree.from + 2, to: tree.to - 2 };
        },
      }),
      styleTags({
        'pk auto unique': t.keyword,
        Number: t.number,
        Identifier: t.variableName,
        LineComment: t.lineComment,
        BlockComment: t.blockComment,
        ColumnComment: t.docComment,
        Table: t.keyword,
        Indexes: t.keyword,
        String: t.string,
        'DataType/...': t.keyword,
        '( )': t.paren,
        '[ ]': t.squareBracket,
        '{ }': t.brace,
      }),
    ],
  }),
  languageData: {
    closeBrackets: { brackets: ['(', '[', '{', "'", '"', '`'] },
    commentTokens: { line: '//', block: { open: '/*', close: '*/' } },
  },
});

export function dbdl(): LanguageSupport {
  return new LanguageSupport(dbdlLanguage, [
    dbdlLanguage.data.of({
      autocomplete: localIndexBlockCompletionSource,
    }),
    // dbdlLanguage.data.of({
    //   autocomplete: ifNotIn(dontComplete, completeFromList(completions)),
    // }),
    langLinter,
  ]);
}
