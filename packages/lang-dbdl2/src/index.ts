import {
  indentNodeProp,
  foldNodeProp,
  LRLanguage,
  LanguageSupport,
  delimitedIndent,
} from "@codemirror/language";
import { Extension } from "@codemirror/state";
import {
  Completion,
  CompletionSource,
  completeFromList,
  ifIn,
  ifNotIn,
} from "@codemirror/autocomplete";
import { styleTags, tags as t } from "@lezer/highlight";
import { parser as baseParser } from "./dbdl.grammar";
import {
  tokens,
  Dialect,
  tokensFor,
  Keywords,
  SQLTypes,
  dialect,
} from "./tokens";
import { completeFromSchema, completeKeywords } from "./complete";
import { scriptSnippets, tableSnippets, dataTypeSnippets } from "./snippets";

export * as tokens from "./dbdl.grammar.terms";

let parser = baseParser.configure({
  props: [
    indentNodeProp.add({
      TableDeclarationBlock: delimitedIndent({ closing: "}" }),
      IndexDeclarationBlock: delimitedIndent({ closing: "}" }),
      BlockComment: () => null,
    }),
    foldNodeProp.add({
      TableDeclaration(tree) {
        return { from: tree.firstChild!.to, to: tree.to };
      },
      BlockComment(tree) {
        return { from: tree.from + 2, to: tree.to - 2 };
      },
    }),
    styleTags({
      Table: t.keyword,
      Index: t.keyword,
      Keyword: t.keyword,
      Type: t.typeName,
      Builtin: t.standard(t.name),
      Bits: t.number,
      Bytes: t.string,
      Bool: t.bool,
      Not: t.keyword,
      Null: t.null,
      Number: t.number,
      String: t.string,
      Identifier: t.name,
      QuotedIdentifier: t.special(t.string),
      SpecialVar: t.special(t.name),
      LineComment: t.lineComment,
      BlockComment: t.blockComment,
      TableComment: t.lineComment,
      Operator: t.operator,
      "Semi Punctuation": t.punctuation,
      "( )": t.paren,
      "{ }": t.brace,
      "[ ]": t.squareBracket,
    }),
  ],
});

/// Configuration for an [SQL Dialect](#lang-sql.SQLDialect).
export type SQLDialectSpec = {
  name: string;
  /// A space-separated list of keywords for the dialect.
  keywords?: string;
  /// A space-separated string of built-in identifiers for the dialect.
  builtin?: string;
  /// A space-separated string of type names for the dialect.
  types?: string;
  /// Controls whether regular strings allow backslash escapes.
  backslashEscapes?: boolean;
  /// Controls whether # creates a line comment.
  hashComments?: boolean;
  /// Controls whether `//` creates a line comment.
  slashComments?: boolean;
  /// When enabled `--` comments are only recognized when there's a
  /// space after the dashes.
  spaceAfterDashes?: boolean;
  /// When enabled, things quoted with "$$" are treated as
  /// strings, rather than identifiers.
  doubleDollarQuotedStrings?: boolean;
  /// When enabled, things quoted with double quotes are treated as
  /// strings, rather than identifiers.
  doubleQuotedStrings?: boolean;
  /// Enables strings like `_utf8'str'` or `N'str'`.
  charSetCasts?: boolean;
  /// Enables string quoting syntax like `q'[str]'`, as used in
  /// PL/SQL.
  plsqlQuotingMechanism?: boolean;
  /// The set of characters that make up operators. Defaults to
  /// `"*+\-%<>!=&|~^/"`.
  operatorChars?: string;
  /// The set of characters that start a special variable name.
  /// Defaults to `"?"`.
  specialVar?: string;
  /// The characters that can be used to quote identifiers. Defaults
  /// to `"\""`.
  identifierQuotes?: string;
  /// Controls whether bit values can be defined as 0b1010. Defaults
  /// to false.
  unquotedBitLiterals?: boolean;
  /// Controls whether bit values can contain other characters than 0 and 1.
  /// Defaults to false.
  treatBitsAsBytes?: boolean;
};

/// Represents an SQL dialect.
export class SQLDialect {
  private constructor(
    /// @internal
    readonly dialect: Dialect,
    /// The language for this dialect.
    readonly language: LRLanguage,
    /// The spec used to define this dialect.
    readonly spec: SQLDialectSpec
  ) {}

  /// Returns the language for this dialect as an extension.
  get extension() {
    return this.language.extension;
  }

  /// Define a new dialect.
  static define(spec: SQLDialectSpec) {
    let d = dialect(spec, spec.keywords, spec.types, spec.builtin);
    let language = LRLanguage.define({
      name: "dbdl",
      parser: parser.configure({
        tokenizers: [{ from: tokens, to: tokensFor(d) }],
      }),
      languageData: {
        commentTokens: { line: "--", block: { open: "/*", close: "*/" } },
        closeBrackets: { brackets: ["(", "[", "{", "'", '"', "`"] },
      },
    });
    return new SQLDialect(d, language, spec);
  }
}

/// The type used to describe a level of the schema for
/// [completion](#lang-sql.SQLConfig.schema). Can be an array of
/// options (columns), an object mapping table or schema names to
/// deeper levels, or a `{self, children}` object that assigns a
/// completion option to use for its parent property, when the default option
/// (its name as label and type `"type"`) isn't suitable.
export type SQLNamespace =
  | { [name: string]: SQLNamespace }
  | { self: Completion; children: SQLNamespace }
  | readonly (Completion | string)[];

/// Options used to configure an SQL extension.
export interface SQLConfig {
  /// The [dialect](#lang-sql.SQLDialect) to use. Defaults to
  /// [`StandardSQL`](#lang-sql.StandardSQL).
  dialect?: SQLDialect;
  /// You can use this to define the schemas, tables, and their fields
  /// for autocompletion.
  schema?: SQLNamespace;
  /// @hide
  tables?: readonly Completion[];
  /// @hide
  schemas?: readonly Completion[];
  /// When given, columns from the named table can be completed
  /// directly at the top level.
  defaultTable?: string;
  /// When given, tables prefixed with this schema name can be
  /// completed directly at the top level.
  defaultSchema?: string;
  /// When set to true, keyword completions will be upper-case.
  upperCaseKeywords?: boolean;
}

/// Returns a completion source that provides keyword completion for
/// the given SQL dialect.
export function keywordCompletionSource(
  dialect: SQLDialect,
  upperCase = false
): CompletionSource {
  return completeKeywords(dialect.dialect.words, upperCase);
}

/// FIXME remove on 1.0 @internal
export function keywordCompletion(
  dialect: SQLDialect,
  upperCase = false
): Extension {
  return dialect.language.data.of({
    autocomplete: keywordCompletionSource(dialect, upperCase),
  });
}

/// Returns a completion sources that provides schema-based completion
/// for the given configuration.
export function schemaCompletionSource(config: SQLConfig): CompletionSource {
  return config.schema
    ? completeFromSchema(
        config.schema,
        config.tables,
        config.schemas,
        config.defaultTable,
        config.defaultSchema,
        config.dialect || StandardSQL
      )
    : () => null;
}

/// FIXME remove on 1.0 @internal
export function schemaCompletion(config: SQLConfig): Extension {
  return config.schema
    ? (config.dialect || StandardSQL).language.data.of({
        autocomplete: schemaCompletionSource(config),
      })
    : [];
}

/// SQL language support for the given SQL dialect, with keyword
/// completion, and, if provided, schema-based completion as extra
/// extensions.
export function dbdl(config: SQLConfig = {}) {
  let lang = config.dialect || StandardSQL;
  console.log(lang.dialect.name);
  return new LanguageSupport(lang.language, [
    schemaCompletion(config),
    keywordCompletion(lang, !!config.upperCaseKeywords),
    lang.language.data.of({
      autocomplete: ifIn(
        ["Script"],
        ifNotIn(["TableDeclaration"], completeFromList(scriptSnippets))
      ),
    }),
    lang.language.data.of({
      autocomplete: ifIn(
        ["TableDeclarationBlock"],
        ifNotIn(["IndexDeclarationBlock"], completeFromList(tableSnippets))
      ),
    }),
    lang.language.data.of({
      autocomplete: ifIn(
        ["ColumnDeclaration"],
        completeFromList(dataTypeSnippets)
      ),
    }),
  ]);
}

export const StandardSQL = SQLDialect.define({ name: "Standard SQL" });

const MySQLKeywords = "btree hash zerofill character collate";

const MySQLTypes =
  SQLTypes +
  "bool blob long longblob longtext medium mediumblob mediumint mediumtext tinyblob tinyint tinytext text bigint int1 int2 int3 int4 int8 float4 float8 varbinary varcharacter precision datetime unsigned signed";

const MySQLBuiltin =
  "charset clear edit ego help nopager notee nowarning pager print prompt quit rehash source status system tee";

/// [MySQL](https://dev.mysql.com/) dialect.
export const MySQL = SQLDialect.define({
  name: "MySQL",
  operatorChars: "*+-%<>!=&|^",
  charSetCasts: true,
  doubleQuotedStrings: true,
  unquotedBitLiterals: true,
  hashComments: true,
  spaceAfterDashes: true,
  specialVar: "@?",
  identifierQuotes: "`",
  keywords: Keywords + MySQLKeywords,
  types: MySQLTypes,
  builtin: MySQLBuiltin,
});

/// Variant of [`MySQL`](#lang-sql.MySQL) for
/// [MariaDB](https://mariadb.org/).
export const MariaSQL = SQLDialect.define({
  name: "MariaDB",
  operatorChars: "*+-%<>!=&|^",
  charSetCasts: true,
  doubleQuotedStrings: true,
  unquotedBitLiterals: true,
  hashComments: true,
  spaceAfterDashes: true,
  specialVar: "@?",
  identifierQuotes: "`",
  keywords: Keywords + MySQLKeywords,
  types: MySQLTypes,
  builtin: MySQLBuiltin,
});

/// SQL dialect for Microsoft [SQL
/// Server](https://www.microsoft.com/en-us/sql-server).
export const MSSQL = SQLDialect.define({
  name: "Microsoft SQL Server",
  keywords: Keywords,
  types:
    SQLTypes +
    "bigint smallint smallmoney tinyint money real text nvarchar ntext varbinary image hierarchyid uniqueidentifier sql_variant xml",
  builtin:
    "binary_checksum checksum connectionproperty context_info current_request_id error_line error_message error_number error_procedure error_severity error_state formatmessage get_filestream_transaction_context getansinull host_id host_name isnull isnumeric min_active_rowversion newid newsequentialid rowcount_big xact_state object_id",
  operatorChars: "*+-%<>!=^&|/",
  specialVar: "@",
});

/// [SQLite](https://sqlite.org/) dialect.
export const SQLite = SQLDialect.define({
  name: "SQLite",
  keywords: Keywords,
  types:
    SQLTypes +
    "bool blob long longblob longtext medium mediumblob mediumint mediumtext tinyblob tinyint tinytext text bigint int2 int8 unsigned signed real",
  builtin:
    "auth backup bail changes clone databases dbinfo dump echo eqp explain fullschema headers help import imposter indexes iotrace lint load log mode nullvalue once print prompt quit restore save scanstats separator shell show stats system tables testcase timeout timer trace vfsinfo vfslist vfsname width",
  operatorChars: "*+-%<>!=&|/~",
  identifierQuotes: '`"',
  specialVar: "@:?$",
});

/// [PL/SQL](https://en.wikipedia.org/wiki/PL/SQL) dialect.
export const PLSQL = SQLDialect.define({
  name: "PL/SQL",
  keywords: Keywords,
  builtin:
    "appinfo arraysize autocommit autoprint autorecovery autotrace blockterminator break btitle cmdsep colsep compatibility compute concat copycommit copytypecheck define echo editfile embedded feedback flagger flush heading headsep instance linesize lno loboffset logsource longchunksize markup native newpage numformat numwidth pagesize pause pno recsep recsepchar repfooter repheader serveroutput shiftinout show showmode spool sqlblanklines sqlcase sqlcode sqlcontinue sqlnumber sqlpluscompatibility sqlprefix sqlprompt sqlterminator suffix tab term termout timing trimout trimspool ttitle underline verify version wrap",
  types:
    SQLTypes +
    "ascii bfile bfilename bigserial bit blob dec long number nvarchar nvarchar2 serial smallint string text uid varchar2 xml",
  operatorChars: "*/+-%<>!=~",
  doubleQuotedStrings: true,
  charSetCasts: true,
  plsqlQuotingMechanism: true,
});

/// Dialect for [PostgreSQL](https://www.postgresql.org).
export const PostgreSQL = SQLDialect.define({
  name: "PostgreSQL",
  charSetCasts: true,
  doubleDollarQuotedStrings: true,
  operatorChars: "+-*/<>=~!@#%^&|`?",
  specialVar: "",
  keywords: Keywords,
  types:
    SQLTypes +
    "bigint int8 bigserial serial8 varbit bool box bytea cidr circle precision float8 inet int4 json jsonb line lseg macaddr macaddr8 money numeric pg_lsn point polygon float4 int2 smallserial serial2 serial serial4 text timetz timestamptz tsquery tsvector txid_snapshot uuid xml",
});
