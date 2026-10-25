import {
  StateEffect,
  StateField,
  Transaction,
  type EditorState,
  type Extension,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import type { WorkspaceFileLocation } from "@/workspace/file-open";
import { resolveTargetLineRange, TARGET_LINE_FLASH_MS } from "../target-line";

// Highlights the line(s) a file link points at. The target is kept as line
// numbers rather than mapped positions: live file updates replace the whole
// document, which would collapse mapped positions to the top of the file.
// Your own edits clear it instead, since they shift the lines underneath.
interface TargetLine {
  lineStart: number;
  lineEnd?: number;
  flashing: boolean;
  // Flips on every new target so a line that is still flashing gets a different
  // animation name and the CSS animation restarts.
  alternate: boolean;
}

const setTargetLine = StateEffect.define<Pick<TargetLine, "lineStart" | "lineEnd"> | null>();
const settleTargetLine = StateEffect.define<null>();

const targetLineField = StateField.define<TargetLine | null>({
  create: () => null,
  update(value, tr) {
    let next = tr.docChanged && tr.annotation(Transaction.userEvent) ? null : value;
    for (const effect of tr.effects) {
      if (effect.is(setTargetLine)) {
        next = effect.value && { ...effect.value, flashing: true, alternate: !value?.alternate };
      } else if (effect.is(settleTargetLine) && next) {
        next = { ...next, flashing: false };
      }
    }
    return next;
  },
});

const flashingLine = Decoration.line({ class: "cm-targetLine cm-targetLine-flash" });
const flashingLineAlternate = Decoration.line({
  class: "cm-targetLine cm-targetLine-flash-alternate",
});
const settledLine = Decoration.line({ class: "cm-targetLine" });

function flashDecoration(target: TargetLine): Decoration {
  if (!target.flashing) return settledLine;
  return target.alternate ? flashingLineAlternate : flashingLine;
}

function targetLineDecorations(state: EditorState): DecorationSet {
  const target = state.field(targetLineField);
  const range = target ? resolveTargetLineRange(target, state.doc.lines) : null;
  if (!target || !range) return Decoration.none;
  const decoration = flashDecoration(target);
  const lines = [];
  for (let line = range.start; line <= range.end; line++) {
    lines.push(decoration.range(state.doc.line(line).from));
  }
  return Decoration.set(lines);
}

const settleAfterFlash = ViewPlugin.fromClass(
  class {
    private timer: ReturnType<typeof setTimeout> | null = null;

    constructor(private readonly view: EditorView) {}

    update(update: ViewUpdate) {
      const retargeted = update.transactions.some((tr) =>
        tr.effects.some((effect) => effect.is(setTargetLine)),
      );
      if (!retargeted) return;
      this.clear();
      if (!update.state.field(targetLineField)?.flashing) return;
      this.timer = setTimeout(() => {
        this.timer = null;
        this.view.dispatch({ effects: settleTargetLine.of(null) });
      }, TARGET_LINE_FLASH_MS);
    }

    destroy() {
      this.clear();
    }

    private clear() {
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
    }
  },
);

export const targetLineExtension: Extension = [
  targetLineField,
  EditorView.decorations.compute(["doc", targetLineField], targetLineDecorations),
  settleAfterFlash,
];

export function targetLineEffect(location: Pick<WorkspaceFileLocation, "lineStart" | "lineEnd">) {
  return setTargetLine.of(
    location.lineStart ? { lineStart: location.lineStart, lineEnd: location.lineEnd } : null,
  );
}
