import { syntaxTree } from '@codemirror/language';
import { Completion, CompletionSource } from '@codemirror/autocomplete';
import { sourceFileSnippets, columnSnippets } from './snippets';

let kwCompletion = (name: string) => ({ label: name, type: 'keyword' });

const keywords = [
  'pk',
  'auto',
  'not',
  'null',
  'unique',
  'default',
  'asc',
  'desc',
  'default',
  'unsigned',
  'zerofill',
  'true',
  'false',
  'integer',
  'tinyint',
  'smallint',
  'mediumint',
  'bigint',
  'numeric',
  'float',
  'double',
  'real',
  'bit',
  'char',
  'text',
  'tinytext',
  'mediumtext',
  'longtext',
  'date',
  'datetime',
  'timestamp',
  'time',
  'year',
  'enum',
  'set',
  'binary',
  'varbinary',
  'blob',
  'tinyblob',
  'mediumblob',
  'longblob',
  'json',
  'bool',
  'boolean',
].map(kwCompletion);

const dontComplete = ['String', 'LineComment', 'BlockComment', 'ColumnComment'];

export const localIndexBlockCompletionSource: CompletionSource = (context) => {
  let node = syntaxTree(context.state).resolve(context.pos, 0);
  if (dontComplete.indexOf(node.name) > -1) return null;

  if (node.name === 'SourceFile') {
    return {
      options: sourceFileSnippets,
      from: context.pos - 1,
    }
  }

  if (node.name === 'Column') {
    return {
      options: columnSnippets.concat(keywords),
      from: context.pos - 1,
    };
  }

  if (node.name === 'Index') {
    let column: string[] = node.getChildren('ColumnName').map((c) => context.state.sliceDoc(c.from, c.to));

    let parent = node.parent;
    while (parent != null && parent.parent != null) {
      if (parent.name === 'TableBlock') {
        let options: Completion[] = [];
        parent
          .getChildren('Column')
          .map((c) => {
            let name = c.getChild('ColumnName');
            return context.state.sliceDoc(name?.from, name?.to);
          })
          .forEach((name) => {
            if (column.indexOf(name) !== -1) {
              return null;
            }
            options.push(kwCompletion(name));
          });
        return {
          options,
          from: context.pos - 1,
        };
      }
      parent = parent.parent;
    }
  }
  return null;
};
