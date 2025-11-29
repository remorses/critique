import { afterEach, describe, expect, it } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { FileEditPreview, FileEditPreviewTitle } from "./diff.tsx";
import type { StructuredPatch } from "diff";

let testSetup: Awaited<ReturnType<typeof testRender>>;

// Sample diff hunks for testing
const sampleHunks: StructuredPatch["hunks"] = [
  {
    oldStart: 1,
    oldLines: 5,
    newStart: 1,
    newLines: 6,
    lines: [
      " function hello() {",
      "-  return 'hello';",
      "+  return 'hello world';",
      " }",
      " ",
      "+// New comment",
    ],
    linedelimiter: "\n",
  },
];

const additionOnlyHunks: StructuredPatch["hunks"] = [
  {
    oldStart: 1,
    oldLines: 0,
    newStart: 1,
    newLines: 3,
    lines: ["+function newFunc() {", "+  return true;", "+}"],
    linedelimiter: "\n",
  },
];

const deletionOnlyHunks: StructuredPatch["hunks"] = [
  {
    oldStart: 1,
    oldLines: 3,
    newStart: 1,
    newLines: 0,
    lines: ["-function oldFunc() {", "-  return false;", "-}"],
    linedelimiter: "\n",
  },
];

describe("FileEditPreview", () => {
  afterEach(() => {
    if (testSetup) {
      testSetup.renderer.destroy();
    }
  });

  describe("Unified View", () => {
    it("should render a simple diff in unified view", async () => {
      testSetup = await testRender(
        <FileEditPreview
          hunks={sampleHunks}
          splitView={false}
          filePath="test.ts"
        />,
        {
          width: 60,
          height: 10,
        }
      );

      await testSetup.renderOnce();
      const frame = testSetup.captureCharFrame();
      expect(frame).toMatchInlineSnapshot(`
" 1  function hello() {                                      
 2    return 'hello ';                                      
 2    return 'hello world';                                 
 4  }                                                       
 5                                                          
 6  // New comment                                          
                                                            
                                                            
                                                            
                                                            
"
`);
    });

    it("should render additions only diff", async () => {
      testSetup = await testRender(
        <FileEditPreview
          hunks={additionOnlyHunks}
          splitView={false}
          filePath="new-file.ts"
        />,
        {
          width: 60,
          height: 6,
        }
      );

      await testSetup.renderOnce();
      const frame = testSetup.captureCharFrame();
      expect(frame).toMatchInlineSnapshot(`
" 1  function newFunc() {                                    
 2    return true;                                          
 3  }                                                       
                                                            
                                                            
                                                            
"
`);
    });

    it("should render deletions only diff", async () => {
      testSetup = await testRender(
        <FileEditPreview
          hunks={deletionOnlyHunks}
          splitView={false}
          filePath="deleted-file.ts"
        />,
        {
          width: 60,
          height: 6,
        }
      );

      await testSetup.renderOnce();
      const frame = testSetup.captureCharFrame();
      expect(frame).toMatchInlineSnapshot(`
" 1  function oldFunc() {                                    
 1    return false;                                         
 1  }                                                       
                                                            
                                                            
                                                            
"
`);
    });
  });

  describe("Split View", () => {
    it("should render a simple diff in split view", async () => {
      testSetup = await testRender(
        <FileEditPreview
          hunks={sampleHunks}
          splitView={true}
          filePath="test.ts"
        />,
        {
          width: 100,
          height: 10,
        }
      );

      await testSetup.renderOnce();
      const frame = testSetup.captureCharFrame();
      expect(frame).toMatchInlineSnapshot(`
" 1  function hello() {                             1  function hello() {                            
 2    return 'hello ';                             2    return 'hello world';                       
 4  }                                              4  }                                             
 5                                                 5                                                
                                                   6  // New comment                                
                                                                                                    
                                                                                                    
                                                                                                    
                                                                                                    
                                                                                                    
"
`);
    });

    it("should render additions only diff in split view", async () => {
      testSetup = await testRender(
        <FileEditPreview
          hunks={additionOnlyHunks}
          splitView={true}
          filePath="new-file.ts"
        />,
        {
          width: 100,
          height: 6,
        }
      );

      await testSetup.renderOnce();
      const frame = testSetup.captureCharFrame();
      expect(frame).toMatchInlineSnapshot(`
"                                                   1  function newFunc() {                          
                                                   2    return true;                                
                                                   3  }                                             
                                                                                                    
                                                                                                    
                                                                                                    
"
`);
    });
  });
});

describe("FileEditPreviewTitle", () => {
  afterEach(() => {
    if (testSetup) {
      testSetup.renderer.destroy();
    }
  });

  it("should show 'Updated' for mixed changes", async () => {
    testSetup = await testRender(
      <FileEditPreviewTitle filePath="test.ts" hunks={sampleHunks} />,
      {
        width: 60,
        height: 1,
      }
    );

    await testSetup.renderOnce();
    const frame = testSetup.captureCharFrame();
    expect(frame).toMatchInlineSnapshot(`
"Updated test.ts with 2 additions and 1 removal              
"
`);
  });

  it("should show 'Created' for additions only", async () => {
    testSetup = await testRender(
      <FileEditPreviewTitle filePath="new-file.ts" hunks={additionOnlyHunks} />,
      {
        width: 60,
        height: 1,
      }
    );

    await testSetup.renderOnce();
    const frame = testSetup.captureCharFrame();
    expect(frame).toMatchInlineSnapshot(`
"Created new-file.ts with 3 additions                        
"
`);
  });

  it("should show 'Deleted' for deletions only", async () => {
    testSetup = await testRender(
      <FileEditPreviewTitle
        filePath="deleted-file.ts"
        hunks={deletionOnlyHunks}
      />,
      {
        width: 60,
        height: 1,
      }
    );

    await testSetup.renderOnce();
    const frame = testSetup.captureCharFrame();
    expect(frame).toMatchInlineSnapshot(`
"Deleted deleted-file.ts with 3 removals                     
"
`);
  });
});
