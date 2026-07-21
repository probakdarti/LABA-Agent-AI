import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const components: Components = {
  h1: ({ children }) => (
    <div style={{ fontWeight: 700, fontSize: 18, margin: "14px 0 6px" }}>
      {children}
    </div>
  ),
  h2: ({ children }) => (
    <div style={{ fontWeight: 700, fontSize: 16, margin: "14px 0 6px" }}>
      {children}
    </div>
  ),
  h3: ({ children }) => (
    <div style={{ fontWeight: 700, fontSize: 15, margin: "12px 0 4px" }}>
      {children}
    </div>
  ),
  h4: ({ children }) => (
    <div style={{ fontWeight: 700, fontSize: 14, margin: "12px 0 4px" }}>
      {children}
    </div>
  ),
  p: ({ children }) => (
    <p style={{ margin: "0 0 8px", lineHeight: 1.55 }}>{children}</p>
  ),
  ul: ({ children }) => (
    <ul style={{ margin: "0 0 8px", paddingLeft: 20 }}>{children}</ul>
  ),
  ol: ({ children }) => (
    <ol style={{ margin: "0 0 8px", paddingLeft: 20 }}>{children}</ol>
  ),
  li: ({ children }) => (
    <li style={{ marginBottom: 4, lineHeight: 1.5 }}>{children}</li>
  ),
  strong: ({ children }) => (
    <strong style={{ fontWeight: 700 }}>{children}</strong>
  ),
  code: ({ children }) => (
    <code
      style={{
        background: "#0a0a0a",
        border: "1px solid #333",
        borderRadius: 4,
        padding: "1px 5px",
        fontSize: 13,
        fontFamily: "monospace",
      }}
    >
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre
      style={{
        background: "#0a0a0a",
        border: "1px solid #333",
        borderRadius: 8,
        padding: 12,
        overflowX: "auto",
        margin: "0 0 8px",
      }}
    >
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div style={{ overflowX: "auto", margin: "0 0 10px" }}>
      <table
        style={{
          borderCollapse: "collapse",
          width: "100%",
          fontSize: 14,
        }}
      >
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead style={{ background: "#20202a" }}>{children}</thead>
  ),
  th: ({ children }) => (
    <th
      style={{
        border: "1px solid #333",
        padding: "6px 10px",
        textAlign: "left",
        fontWeight: 700,
      }}
    >
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td style={{ border: "1px solid #333", padding: "6px 10px" }}>
      {children}
    </td>
  ),
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" style={{ color: "#6ab0ff" }}>
      {children}
    </a>
  ),
  hr: () => <hr style={{ border: "none", borderTop: "1px solid #333", margin: "10px 0" }} />,
  blockquote: ({ children }) => (
    <blockquote
      style={{
        borderLeft: "3px solid #444",
        margin: "0 0 8px",
        paddingLeft: 10,
        color: "#bbb",
      }}
    >
      {children}
    </blockquote>
  ),
};

export function Markdown({ text }: { text: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {text}
    </ReactMarkdown>
  );
}
