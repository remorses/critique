import { RGBA } from "@opentui/core";
import { render } from "@opentui/react";
import * as React from "react";
import {
  createHighlighter,
  type GrammarState,
  type ThemedToken,
} from "shiki";

const lines = [
  'const greeting = "Hello, World!";',
  "console.log(greeting);",
  "",
  "function fibonacci(n) {",
  "  if (n <= 1) return n;",
  "  return fibonacci(n - 1) + fibonacci(n - 2);",
  "}",
  "",
  "const result = fibonacci(10);",
  'console.log("Result:", result);',
  "",
  "const numbers = [1, 2, 3, 4, 5];",
  "const doubled = numbers.map(n => n * 2);",
  "console.log(doubled);",
];

const highlighter = await createHighlighter({
  themes: ["github-light", "github-dark-dimmed"],
  langs: ["javascript"],
});

let state: GrammarState | undefined;
const highlightedLines: ThemedToken[][] = [];

for (const line of lines) {
  const result = highlighter.codeToTokens(line, {
    lang: "js",
    themes: { light: "github-light", dark: "github-dark-dimmed" },
    defaultColor: false,
    grammarState: state,
  });

  if (result.tokens[0]) {
    highlightedLines.push(result.tokens[0]);
  }

  state = highlighter.getLastGrammarState(result.tokens);
}

function HighlightedCode() {
  return (
    <box style={{ flexDirection: "column", padding: 2 }}>
      {highlightedLines.map((line, lineIdx) => (
        <text key={lineIdx} wrap={false}>
          {line.map((token, tokenIdx) => {
            const color = token.htmlStyle?.["--shiki-dark"];
            const hexColor = color?.slice(0, 7);
            const fg = hexColor ? RGBA.fromHex(hexColor) : undefined;

            return (
              <span key={tokenIdx} fg={fg}>
                {token.content}
              </span>
            );
          })}
        </text>
      ))}
    </box>
  );
}

await render(<HighlightedCode />);
