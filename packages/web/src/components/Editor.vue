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
    />
  </div>
  <!--<hr />
   <div class="flex h-8 justify-end items-center space-x-2 px-2">
    <span class="inline-block">
      {{ state.lines }}:{{ state.cursor }}{{ state.selected }}
    </span>
    <span class="inline-block">pos:{{ state.pos }}</span>
    <span class="inline-block">{{ config.tabSize }} spaces</span>
  </div> -->
</template>

<script lang="ts">
import {
  defineComponent,
  reactive,
  shallowRef,
  ref,
  PropType,
  onMounted,
  onBeforeUnmount,
  computed,
  watch,
} from "vue";
import { EditorView, Panel, ViewUpdate, showPanel } from "@codemirror/view";
import { redo, undo } from "@codemirror/commands";
import { Codemirror } from "vue-codemirror";
import { debounce } from "lodash";
import { Extension } from "@codemirror/state";
import { ChangedRange, Tree, TreeFragment } from "@lezer/common";
import { LanguageSupport } from "@codemirror/language";
import { diffChars } from "diff";

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
    language: {
      type: LanguageSupport as PropType<LanguageSupport>,
      required: false,
    },
  },
  emits: ["change", "autoSave"],
  components: {
    Codemirror,
  },
  setup(props, { emit }) {
    let docChanged = false;
    const log = console.log;
    const internalCode = ref(props.code);
    let fragments: TreeFragment[] = [];
    let tree: Tree | undefined;
    const parser = props.language?.language.parser;

    watch(
      () => props.code,
      (_newCode) => {
        internalCode.value = _newCode;
      }
    );

    const extensions = computed(() => {
      const exts: Extension[] = [];
      if (props.language) {
        exts.push(props.language);
      }
      if (props.extensions) {
        exts.push(...props.extensions);
      }
      exts.push(showPanel.of(handleStateUpdate));
      return exts;
    });

    let t: any = null;
    onMounted(() => {
      window.addEventListener("beforeunload", () => {
        console.log("auto save before unload");
        if (docChanged) {
          emit("autoSave", internalCode.value);
        }
      });
      if (props.code) {
        tree = parser?.parse(props.code);
        if (tree) {
          fragments.push(...TreeFragment.addTree(tree));
        }
      }
    });
    onBeforeUnmount(() => {
      if (t != null) {
        clearInterval(t);
        window.removeEventListener("beforeunload", () => {});
      }
    });

    t = setInterval(() => {
      if (docChanged) {
        console.log("auto save");
        emit("autoSave", internalCode.value);
        docChanged = false;
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

    const handleStateUpdate = (): Panel => {
      let dom = document.createElement("div");
      dom.className = "flex h-8 justify-end items-center space-x-2 px-2";
      return {
        dom,
        update(update) {
          const ranges = update.state.selection.ranges;
          const selected = ranges.reduce(
            (plus, range) => plus + range.to - range.from,
            0
          );
          state.selected =
            selected > 0 ? `(${selected} char${selected > 1 ? "s" : ""})` : "";
          state.pos = ranges[0].anchor;
          // length
          state.length = update.state.doc.length;
          state.lines = update.state.doc.lines;
          state.cursor =
            ranges[0].head - update.state.doc.lineAt(ranges[0].head).from + 1;
          dom.innerHTML = `<span class="inline-block">
                              ${state.lines}:${state.cursor}${state.selected}
                            </span>
                            <span class="inline-block">pos:${state.pos}</span>
                            <span class="inline-block">${props.config.tabSize} spaces</span>`;
        },
      };
    };

    let oldCode = props.code || "";
    const debouncedUpdate = debounce((view: ViewUpdate) => {
      if (view.docChanged) {
        docChanged = true;
        if (parser) {
          const newCode = view.state.doc.toString();
          const changes = diffChars(oldCode, newCode);
          log("---->");
          let changeFragments: ChangedRange[] = [];
          let pos = 0;
          changes.forEach((change) => {
            log(
              `added: ${change.added ?? false}, removed: ${
                change.removed ?? false
              }, count: ${change.count ?? 0}, value: ${change.value}`
            );
            if (change.added) {
              changeFragments.push({
                fromA: pos,
                toA: pos,
                fromB: pos,
                toB: pos + (change.count || 0),
              });
            } else if (change.removed) {
              changeFragments.push({
                fromA: pos,
                toA: pos + (change.count || 0),
                fromB: pos,
                toB: pos,
              });
            } else {
              pos += change.count || 0;
            }
          });
          log(JSON.stringify(changeFragments, null, 2));
          log("<----");
          fragments = [
            ...TreeFragment.applyChanges(fragments, changeFragments),
          ];
          tree = parser.parse(newCode, fragments);
          oldCode = newCode;
        }
        emit("change", view, tree);
      }
    }, 1200);

    const handleUpdateModelValue = (_newCode: string, view: ViewUpdate) => {
      debouncedUpdate(view);
    };

    return {
      log,
      state,
      internalCode,
      extensions,
      handleReady,
      handleRedo,
      handleUndo,
      handleUpdateModelValue,
    };
  },
});
</script>
