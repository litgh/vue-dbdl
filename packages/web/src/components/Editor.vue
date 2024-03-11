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
    <span class="inline-block">pos:{{ state.pos }}</span>
    <span class="inline-block">{{ config.tabSize }} spaces</span>
  </div>
</template>

<script lang="ts">
import {
  defineComponent,
  reactive,
  shallowRef,
  ref,
  watch,
  PropType,
} from "vue";
import { EditorView, ViewUpdate } from "@codemirror/view";
import { redo, undo } from "@codemirror/commands";
import { Codemirror } from "vue-codemirror";
import { debounce } from "lodash";
import { Extension } from "@codemirror/state";

export default defineComponent({
  name: "Editor",
  title: "Editor",
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
    extensions: {
      type: Array as PropType<Array<Extension>>,
      required: false,
    },
  },
  emits: ["change", "autoSave"],
  components: {
    Codemirror,
  },
  setup(props, { emit }) {
    let modified = false;
    const log = console.log;
    const internalCode = ref(props.code);
    watch(
      () => props.code,
      (newCode) => {
        internalCode.value = newCode;
      }
    );

    setInterval(() => {
      if (modified) {
        emit("autoSave", internalCode.value);
        modified = false;
      }
    }, 5000);

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
      selected: "",
      length: 0,
      pos: 0,
    });

    const handleStateUpdate = (viewUpdate: ViewUpdate) => {
      // selected
      const ranges = viewUpdate.state.selection.ranges;
      const selected = ranges.reduce(
        (plus, range) => plus + range.to - range.from,
        0
      );
      state.selected =
        selected > 0 ? `(${selected} char${selected > 1 ? "s" : ""})` : "";
      state.pos = ranges[0].anchor;
      // length
      state.length = viewUpdate.state.doc.length;
      state.lines = viewUpdate.state.doc.lines;
      state.cursor =
        ranges[0].head - viewUpdate.state.doc.lineAt(ranges[0].head).from + 1;
    };

    const debouncedUpdate = debounce((view: ViewUpdate) => {
      modified = true;
      emit("change", view);
    }, 1000);

    const handleUpdateModelValue = (_newCode: string, view: ViewUpdate) => {
      debouncedUpdate(view);
    };

    return {
      log,
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
