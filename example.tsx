import { structuredPatch } from "diff";
import { render } from "@opentui/react";
import * as React from "react";
import {
  ErrorBoundary,
  FileEditPreviewTitle,
  FileEditPreview,
  beforeContent,
  afterContent,
} from "./diff.tsx";

const filePath = "/src/components/Button.tsx";
const hunks = structuredPatch(
  filePath,
  filePath,
  beforeContent,
  afterContent,
  undefined,
  undefined,
  { context: 3, ignoreWhitespace: true, stripTrailingCr: true },
).hunks;

function App() {
  return (
    <box style={{ flexDirection: "column", height: "100%", padding: 1 }}>
      <FileEditPreviewTitle filePath={filePath} hunks={hunks} />
      <box paddingTop={3} />
      <scrollbox
        style={{
          flexGrow: 1,
          rootOptions: {
            backgroundColor: "transparent",
            border: false,
          },
          scrollbarOptions: {
            showArrows: false,
            trackOptions: {
              foregroundColor: "#4a4a4a",
              backgroundColor: "transparent",
            },
          },
        }}
        focused
      >
        <FileEditPreview hunks={hunks} paddingLeft={0} />
      </scrollbox>
    </box>
  );
}

await render(
  React.createElement(ErrorBoundary, null, React.createElement(App)),
);
