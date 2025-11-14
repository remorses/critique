import { createCliRenderer, RGBA } from "@opentui/core";
import { createRoot } from "@opentui/react";
import * as React from "react";

function TransparencyDemo() {
  // Using RGBA.fromInts - this works
  const workingColor = RGBA.fromInts(255, 0, 0, 128); // Red with 50% opacity

  return (
    <box style={{ flexDirection: "column", padding: 2 }}>
      <text>Transparency Bug Repro</text>
      
      <box style={{ flexDirection: "row", marginTop: 2, gap: 2 }}>
        <box style={{ flexDirection: "column" }}>
          <text>✅ Works (RGBA.fromInts)</text>
          <box style={{ padding: 3, backgroundColor: workingColor, marginTop: 1 }}>
            <text>Semi-transparent red</text>
          </box>
        </box>
        
        <box style={{ flexDirection: "column" }}>
          <text>❌ Doesn't work (hex with alpha)</text>
          <box style={{ padding: 3, backgroundColor: "#ff000080", marginTop: 1 }}>
            <text>Should be semi-transparent</text>
          </box>
        </box>
      </box>
    </box>
  );
}

const renderer = await createCliRenderer();
createRoot(renderer).render(<TransparencyDemo />);