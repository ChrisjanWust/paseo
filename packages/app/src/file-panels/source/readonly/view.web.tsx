import { useEffect, useRef, useState } from "react";
import { FileFind, FileFindModel } from "../find/index.web";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { getLanguageForFile } from "@getpaseo/highlight";
import type { WorkspaceFileLocation } from "@/workspace/file-open";
import type { EditorVisualTheme } from "../editor/extensions.web";
import { editorTheme } from "../editor/extensions.web";
import { targetLineEffect, targetLineExtension } from "../editor/target-line.web";
import { resolveTargetLineRange } from "../target-line";
import { FilePanelLoading } from "../../loading";
import type { SourcePresentation } from "./presentation";

interface FileSourceViewProps {
  content: string;
  filename: string;
  location: WorkspaceFileLocation;
  navigationRevision: number;
  presentation: Exclude<SourcePresentation, "unsupported">;
  theme: EditorVisualTheme;
}

const languageCompartment = new Compartment();
const themeCompartment = new Compartment();

/** A read-only source view for files Source does not edit. Shows Loading until the editor exists. */
export function FileSourceView({
  content,
  filename,
  location,
  navigationRevision,
  presentation,
  theme,
}: FileSourceViewProps) {
  const [find] = useState(() => new FileFindModel());
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [ready, setReady] = useState(false);
  const initial = useRef({ content, filename, presentation, theme });

  useEffect(() => {
    if (!hostRef.current) return;
    const values = initial.current;
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: values.content,
        extensions: [
          find.extension,
          targetLineExtension,
          EditorState.readOnly.of(true),
          EditorView.contentAttributes.of({
            tabindex: "0",
            "aria-label": `Source for ${values.filename}`,
          }),
          EditorView.editable.of(false),
          languageCompartment.of(
            languageFor({ filename: values.filename, presentation: values.presentation }),
          ),
          themeCompartment.of(editorTheme(values.theme)),
        ],
      }),
    });
    viewRef.current = view;
    setReady(true);
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [find]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === content) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: content } });
  }, [content]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: [
        languageCompartment.reconfigure(languageFor({ filename, presentation })),
        themeCompartment.reconfigure(editorTheme(theme)),
      ],
    });
  }, [filename, presentation, theme]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const target = { lineStart: location.lineStart, lineEnd: location.lineEnd };
    const range = resolveTargetLineRange(target, view.state.doc.lines);
    if (!range) {
      view.dispatch({ effects: targetLineEffect(target) });
      return;
    }
    const from = view.state.doc.line(range.start).from;
    view.dispatch({
      effects: [targetLineEffect(target), EditorView.scrollIntoView(from, { y: "center" })],
    });
  }, [location.lineEnd, location.lineStart, navigationRevision]);

  return (
    <div style={FRAME_STYLE}>
      <div ref={hostRef} data-testid="file-source-editor" style={HOST_STYLE} />
      <FileFind model={find} editor={viewRef} />
      {ready ? null : <FilePanelLoading />}
    </div>
  );
}

function languageFor(input: {
  filename: string;
  presentation: Exclude<SourcePresentation, "unsupported">;
}) {
  return input.presentation === "highlighted"
    ? (getLanguageForFile(input.filename)?.extension ?? [])
    : [];
}

const FRAME_STYLE = {
  display: "flex",
  position: "relative",
  flex: 1,
  minHeight: 0,
  minWidth: 0,
} as const;
const HOST_STYLE = { flex: 1, minHeight: 0, overflow: "hidden" } as const;
