<template>
  <div class="container">
    <Codemirror
      v-model="internalCode"
      :style="{ width: '100%', height: config.height }"
      :extensions="extensions"
      :autofocus="config.autofocus"
      :disabled="config.disabled"
      :indent-with-tab="config.indentWithTab"
      :tab-size="config.tabSize"
      @update:modelValue="handleUpdateModelValue"
      @ready="handleReady"
      @update="handleStateUpdate"
    />
  </div>
  <hr />
  <div class="flex h-8 justify-end items-center space-x-2 px-2">
    <span class="inline-block">
      {{ state.lines }}:{{ state.cursor }}{{ state.selected }}
    </span>
    <span class="inline-block">{{ config.tabSize }} spaces</span>
  </div>
</template>

<script lang="ts">
  import { defineComponent, reactive, shallowRef, computed, ref, watch } from 'vue';
  import { EditorView, ViewUpdate } from '@codemirror/view';
  import { redo, undo } from '@codemirror/commands';
  import { Codemirror } from 'vue-codemirror';
  import { debounce } from 'lodash';

  export default defineComponent({
    name: 'Editor',
    title: 'Editor',
    url: import.meta.url,
    props: {
      config: {
        type: Object,
        required: true,
      },
      code: {
        type: String,
        required: false,
      },
      theme: [Object, Array],
      language: Function,
    },
    emits: ['change'],
    components: {
      Codemirror,
    },
    setup(props, { emit }) {
      const log = console.log;
      const internalCode = ref(props.code);
      watch(
        () => props.code,
        (newCode) => {
          internalCode.value = newCode;
        }
      );

      // const { code } = toRefs(props)
      // const editableCode = ref(code.value)
      // watch(code, (newCode) => {
      //     editableCode.value = newCode
      // })

      const extensions = computed(() => {
        const result = [];
        if (props.language) {
          result.push(props.language());
        }
        if (props.theme) {
          result.push(props.theme);
        }
        return result;
      });

      const cmView = shallowRef<EditorView>();
      const handleReady = ({ view }: any) => {
        cmView.value = view;
      };

      // https://github.com/codemirror/commands/blob/main/test/test-history.ts
      const handleUndo = () => {
        undo({
          state: cmView.value!.state,
          dispatch: cmView.value!.dispatch,
        });
      };

      const handleRedo = () => {
        redo({
          state: cmView.value!.state,
          dispatch: cmView.value!.dispatch,
        });
      };

      const state = reactive({
        lines: 0,
        cursor: 0,
        selected: '',
        length: 0
      });

      const handleStateUpdate = (viewUpdate: ViewUpdate) => {
        // selected
        const ranges = viewUpdate.state.selection.ranges;
        const selected = ranges.reduce((plus, range) => plus + range.to - range.from, 0);
        state.selected = selected > 0 ? `(${selected} char${selected > 1 ? 's' : ''})` : ''

        let cursor = ranges[0].anchor + 1;
        // length
        state.length = viewUpdate.state.doc.length;
        state.lines = viewUpdate.state.doc.lines;
        let c = 0
        for (let i = 1; i <= state.lines; i++) {
            const line = viewUpdate.state.doc.line(i);
            const n = line.to - line.from + 1;
            if (c + n >= cursor) {
                cursor -= c;
                break;
            }
            c+=n;
        }
        state.cursor = cursor;
      };

      const debouncedUpdate = debounce((newCode: string) => {
        emit('change', newCode);
      }, 1000);

      const handleUpdateModelValue = (newCode: string) => {
        debouncedUpdate(newCode);
      };

      return {
        log,
        extensions,
        state,
        internalCode,
        handleReady,
        handleStateUpdate,
        handleRedo,
        handleUndo,
        handleUpdateModelValue,
      };
    },
  });
</script>
