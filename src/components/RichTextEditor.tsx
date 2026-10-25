"use client";

import { useRef, useState } from "react";

/**
 * A small "Word home tab" editor (bold / italic / underline / lists) writing sanitized-on-the-server HTML into a hidden
 * field. The server re-sanitizes everything on save, so this is convenience only — never a trust boundary.
 * Typing works without JavaScript only as a plain textarea fallback inside <noscript>.
 */
export function RichTextEditor({ name, initialHtml, label, error }: { name: string; initialHtml: string; label: string; error?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState(initialHtml);
  const sync = () => setHtml(ref.current?.innerHTML ?? "");
  const cmd = (c: string) => { ref.current?.focus(); document.execCommand(c, false); sync(); };
  const btn = (c: string, text: string, title: string, style?: React.CSSProperties) => (
    <button type="button" className="btn btn-small btn-secondary" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd(c)} title={title} aria-label={title} style={style}>{text}</button>
  );
  return (
    <div className="field full">
      <label id={`${name}_lbl`}>{label}<span className="req"> *</span></label>
      <div role="toolbar" aria-label="Text formatting" style={{ display: "flex", gap: 4, margin: "6px 0", flexWrap: "wrap" }}>
        {btn("bold", "B", "Bold", { fontWeight: 700 })}{btn("italic", "I", "Italic", { fontStyle: "italic" })}{btn("underline", "U", "Underline", { textDecoration: "underline" })}
        {btn("insertUnorderedList", "• List", "Bulleted list")}{btn("insertOrderedList", "1. List", "Numbered list")}
      </div>
      <div
        ref={ref} contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-labelledby={`${name}_lbl`} aria-invalid={!!error || undefined}
        className={error ? "is-invalid" : undefined} onInput={sync} onBlur={sync}
        style={{ minHeight: 160, border: "1px solid var(--border)", borderRadius: 6, padding: 10, background: "var(--white)" }}
        dangerouslySetInnerHTML={{ __html: initialHtml }}
      />
      <input type="hidden" name={name} value={html} />
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  );
}
