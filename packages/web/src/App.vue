<template>
  <div class="flex justify-center gap-2 mb-1 px-1">
    <select name="theme" v-model="config.theme" class="border p-1">
      <option :value="option" :key="option" v-for="option in ['default', ...Object.keys(themes)]">
        {{ option }}
      </option>
    </select>
  </div>
  <hr>
  <div class="flex flex-row">
    <div class="w-1/3 border-r">
      <Editor :config="config" :theme="currentTheme" :language="dbdl" @change="codeChange" />
    </div>
    <div class="w-1/3">
      <Editor :config="config" :theme="currentTheme" :language="json" :code="code" />
    </div>
    <div class="w-1/3">
      <Editor :config="config" :theme="currentTheme" :language="json" :code="ast" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import Editor from '@/components/Editor.vue'
import * as themes from './components/themes'
import { dbdlLanguage, dbdl } from '@vue-dbdl/lang-dbdl'
import { SyntaxNodeRef } from '@lezer/common'
import { json } from '@codemirror/lang-json'



interface Table {
  name: string;
  columns: {
    name: string
    type: string
    pk: boolean
    auto: boolean
    notNull: boolean
    default: string
    comment: string
  }[];
}

const ast = ref('')
const code = ref('')
const tables = {} as {
  [tableName: string]: Table
}

const config = reactive({
  disable: false,
  indentWithTab: true,
  tabSize: 2,
  autofocus: true,
  height: '93vh',
  theme: 'default'
})
const currentTheme = computed(() => {
  return config.theme !== 'default' ? (themes as any)[config.theme] : void 0
})

function indentStringWithBrackets(input: string) {
  let output = '';
  let indentLevel = 0;
  let token = ''

  // 遍历输入字符串的每个字符
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    // 如果字符是括号，则根据括号的类型增加或减少缩进级别
    if (char === '(') {
      indentLevel++
      output += token + '\n' + ' '.repeat(indentLevel * 2 - 2) + '- '
      token = ''
    } else if (char === ',') {
      if (token) {
        output += token + '\n' + ' '.repeat(indentLevel * 2 - 2) + '- '
        token = ''
      } else {
        output += ' '.repeat(indentLevel * 2 - 2) + '- '
      }
    } else if (char === ')') {
      indentLevel--
      if (token) {
        output += token + '\n'
        token = ''
      }
    } else {
      token += char
    }
  }

  return output;
}

const codeChange = (newCode: string) => {
  if (newCode === '') {
    return;
  }
  const tree = dbdlLanguage.parser.parse(newCode)
  ast.value = tree.toString() + '\n' + indentStringWithBrackets(tree.toString())
  let cursor = tree.cursor()
  let loop = cursor.next()
  do {
    switch (cursor.name) {
      case 'TableDefinition':
        console.log(cursor.from, cursor.to, newCode.substring(cursor.from, cursor.to))
        const table: Table = {
          name: '',
          columns: []
        }
        tree.iterate({
          ...cursor, enter(node: SyntaxNodeRef) {
            if (node.name === 'TableName') {
              table.name = newCode.substring(node.from, node.to)
            } else if (node.name === 'Column') {
              const column: any = {}
              tree.iterate({
                ...node, enter(node: SyntaxNodeRef) {
                  switch (node.name) {
                    case 'ColumnName':
                      column.name = newCode.substring(node.from, node.to)
                      break;
                    case 'DataType':
                      column.type = newCode.substring(node.from, node.to)
                      break;
                    case 'Nullable':
                      column.notNull = newCode.substring(node.from, node.to).includes('not')
                      break;
                    case 'PrimaryKey':
                      column.pk = true
                      break;
                    case 'AutoIncrement':
                      column.auto = true
                      break;
                    case 'DefaultValue':
                      column.default = newCode.substring(node.from, node.to)
                      break;
                    case 'ColumnComment':
                      if (node.node.firstChild?.name === 'Note') {
                        column.comment = newCode.substring(node.from + 1, node.to).trim()
                      } else if (node.node.firstChild?.name === 'MultiLineString') {
                        column.comment = newCode.substring(node.from + 3, node.to - 3).trim()
                      }
                      break;
                    default:
                      break;
                  }
                },
                leave(node: SyntaxNodeRef) {
                  if (node.name === 'Column') {
                    table.columns?.push(column)
                  }
                }
              })
            }
          },
          leave(node: SyntaxNodeRef) {
            if (node.name === 'TableDefinition' && table.name) {
              tables[table.name] = table
              code.value = JSON.stringify(tables, null, 2)
            }
          }
        })
        loop = cursor.nextSibling()
        break;
      default:
        loop = cursor.next()
        break;
    }
  } while (loop)
}


</script>
