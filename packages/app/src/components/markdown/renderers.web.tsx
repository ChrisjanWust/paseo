import { Text } from "react-native";
import {
  forwardRef,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ComponentProps,
  type CSSProperties,
} from "react";
import type {
  CodeBlockRendererProps,
  LinkRendererProps,
  MarkdownRenderers,
  TableRendererProps,
} from "react-native-enriched-markdown";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useFileLink } from "@/assistant-file-links";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { HighlightedCodeBlock } from "@/components/highlighted-code-block";
import type { Theme } from "@/styles/theme";
import { MermaidFence } from "./fence/mermaid";
import { markdownLinkSource } from "./source";
import { MarkdownTableGutterContext } from "./table-gutter";

const ThemedCodeBlock = withUnistyles(HighlightedCodeBlock);
const codeStyle = (theme: Theme) => ({
  inheritedStyles: {
    color: theme.colors.foreground,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.code,
  },
  textStyle: { backgroundColor: theme.colors.surface2, padding: 12, borderRadius: 8 },
});
function WebCodeBlock({ code, language }: CodeBlockRendererProps) {
  if (language?.toLowerCase() === "mermaid") return <MermaidFence code={code} />;
  return <ThemedCodeBlock code={code} language={language} uniProps={codeStyle} />;
}

// The library styles links inline, so a stylesheet :hover rule cannot underline them.
const LINK_HOVER_STYLE = { textDecoration: "underline" } as const;

function WebLink({ link, anchorProps, children }: LinkRendererProps) {
  const { tooltipPath, onHoverIn } = useFileLink(markdownLinkSource(link.url, link.sourceType));
  const [hovered, setHovered] = useState(false);
  const handleMouseEnter = useCallback(() => setHovered(true), []);
  const handleMouseLeave = useCallback(() => setHovered(false), []);
  const anchorStyle = useMemo(
    () => ({
      ...anchorProps.style,
      overflowWrap: "anywhere" as const,
      ...(hovered ? LINK_HOVER_STYLE : null),
    }),
    [anchorProps.style, hovered],
  );
  const anchor = (
    <a
      {...anchorProps}
      style={anchorStyle}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
    </a>
  );
  return (
    <Tooltip delayDuration={400}>
      <TooltipTrigger asChild onHoverIn={onHoverIn}>
        <InlineLinkTrigger>{anchor}</InlineLinkTrigger>
      </TooltipTrigger>
      {tooltipPath ? (
        <TooltipContent side="top" align="start" maxWidth={520}>
          <Text selectable={false} style={styles.tooltipPath}>
            {tooltipPath}
          </Text>
        </TooltipContent>
      ) : null}
    </Tooltip>
  );
}
// TooltipTrigger also supplies native Pressable handlers; forward only DOM events.
// A View renders a div, which is invalid inside the library's prose paragraphs.
const InlineLinkTrigger = forwardRef<HTMLSpanElement, ComponentProps<"span">>(
  function InlineLinkTrigger({ children, onMouseEnter, onMouseLeave, onFocus, onBlur }, ref) {
    return (
      <span
        ref={ref}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onFocus={onFocus}
        onBlur={onBlur}
      >
        {children}
      </span>
    );
  },
);
const styles = StyleSheet.create((theme) => ({
  tooltipPath: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
  },
}));

// The browser sizes the columns to their content. A narrow table stays aligned with the text;
// a wide one grows evenly into the pane gutter on both sides, and scrolls once its columns can
// no longer shrink. The row spans the text column plus both gutters: the leading spacer caps at
// one gutter, so free space beyond it goes to the trailing spacer.
function WebTable({ children, wrapperStyle, topLevel }: TableRendererProps) {
  const paneGutter = useContext(MarkdownTableGutterContext);
  const gutter = topLevel ? paneGutter : 0;
  const rowStyle = useMemo<CSSProperties>(
    () => ({
      display: "flex",
      marginTop: wrapperStyle.marginTop,
      marginBottom: wrapperStyle.marginBottom,
      marginLeft: -gutter,
      marginRight: -gutter,
    }),
    [gutter, wrapperStyle.marginTop, wrapperStyle.marginBottom],
  );
  const leadingStyle = useMemo<CSSProperties>(
    () => ({ flex: "1 1 0", maxWidth: gutter }),
    [gutter],
  );
  const scrollStyle = useMemo<CSSProperties>(
    () => ({
      flex: "0 1 auto",
      minWidth: 0,
      overflowX: "auto",
      overflowY: "hidden",
      borderRadius: wrapperStyle.borderRadius,
    }),
    [wrapperStyle.borderRadius],
  );
  return (
    <div style={rowStyle} data-testid="markdown-table">
      <div style={leadingStyle} />
      <div style={scrollStyle}>{children}</div>
      <div style={TRAILING_SPACER_STYLE} />
    </div>
  );
}
const TRAILING_SPACER_STYLE: CSSProperties = { flex: "1 1 0" };

export const WEB_RENDERERS: MarkdownRenderers = {
  codeBlock: WebCodeBlock,
  link: WebLink,
  table: WebTable,
};
