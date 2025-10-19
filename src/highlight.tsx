import { RGBA } from "@opentui/core";
import { render } from "@opentui/react";
import * as React from "react";
import { createHighlighter, type GrammarState, type ThemedToken } from "shiki";
import { createMonochromeTheme } from "./monochrome";
import { createMonotoneTheme } from "./monotone";

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
  "",
  "class Person {",
  "  constructor(name, age) {",
  "    this.name = name;",
  "    this.age = age;",
  "  }",
  "",
  "  greet() {",
  '    return `Hello, my name is ${this.name}`;',
  "  }",
  "}",
  "",
  "const person = new Person('Alice', 30);",
  "console.log(person.greet());",
  "",
  "async function fetchData(url) {",
  "  const response = await fetch(url);",
  "  return response.json();",
  "}",
  "",
  "const data = await fetchData('/api/users');",
  "console.log(data);",
];

const monotoneGreen = createMonotoneTheme({
  name: "monotone-green-dark",
  hue: 120,
  isDark: true,
});

const monotoneGray = createMonotoneTheme({
  name: "monotone-gray-dark",
  hue: 0,
  isDark: true,
  saturation: 0.05,
});

const monotoneRed = createMonotoneTheme({
  name: "monotone-red-dark",
  hue: 0,
  isDark: true,
});

const themes = [monotoneGreen, monotoneGray, monotoneRed];

const highlighter = await createHighlighter({
  themes,
  langs: ["javascript"],
});

const themePattern = [0, 1, 2, 1, 0, 2];
const highlightedLines: ThemedToken[][] = [];
const lineThemes: number[] = [];

const states: (GrammarState | undefined)[] = [undefined, undefined, undefined];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i]!;
  const themeIndex = themePattern[i % themePattern.length]!;
  const theme = themes[themeIndex]!;
  
  const result = highlighter.codeToTokens(line, {
    lang: "js",
    theme: theme.name!,
    defaultColor: false,
    grammarState: states[themeIndex],
  });

  if (result.tokens[0]) {
    highlightedLines.push(result.tokens[0]);
    lineThemes.push(themeIndex);
  }

  states[themeIndex] = highlighter.getLastGrammarState(result.tokens);
}

function HighlightedCode() {
  return (
    <box style={{ flexDirection: "column", padding: 2 }}>
      {highlightedLines.map((line, lineIdx) => {
        const isGreenTheme = lineThemes[lineIdx] === 0;
        
        return (
          <text key={lineIdx} wrap={false}>
            {line.map((token, tokenIdx) => {
              const hexColor = token.color?.slice(0, 7);
              const fg = hexColor ? RGBA.fromHex(hexColor) : undefined;
              const shouldHighlight = isGreenTheme && token.content.trim() && Math.random() > 0.7;
              const bg = shouldHighlight ? RGBA.fromHex("#1a3a1a") : undefined;

              return (
                <span key={tokenIdx} fg={fg} bg={bg}>
                  {token.content}
                </span>
              );
            })}
          </text>
        );
      })}
    </box>
  );
}

await render(<HighlightedCode />);
