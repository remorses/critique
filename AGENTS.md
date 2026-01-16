## opentui

opentui is the framework used to render the tui, using react.

IMPORTANT! before starting every task ALWAYS read opentui docs with `curl -s https://raw.githubusercontent.com/sst/opentui/refs/heads/main/packages/react/README.md`

ALWAYS!

### using unreleased opentui versions

to use a pkg.pr.new preview URL for opentui, get the last commit hash (first 7 chars) from PR https://github.com/anomalyco/opentui/pull/536:

```bash
gh pr view 536 -R anomalyco/opentui --json commits --jq '.commits[-1].oid[:7]'
```

then use it in package.json:

```
https://pkg.pr.new/anomalyco/opentui/@opentui/core@<hash>
https://pkg.pr.new/anomalyco/opentui/@opentui/react@<hash>
```

## bun

NEVER run the interactive TUI (e.g. `bun run src/cli.tsx` without arguments). It will hang. Instead ask the user to run it.

The `web` command is safe to run - it generates HTML and exits:
```bash
bun run src/cli.tsx web
```

NEVER use require. just import at the top of the file with esm

use bun add to install packages instead of npm

## React

NEVER pass function or callbacks as dependencies of useEffect, this will very easily cause infinite loops if you forget to use useCallback

NEVER use useCallback. it is useless if we never pass functions in useEffect dependencies

Try to never use useEffect if possible. usually you can move logic directly in event handlers instead

## Rules

- if you need Node.js apis import the namesapce and not the named exports: `import fs from 'fs'` and not `import { writeFileSync } from 'fs'`
- DO NOT use as any. instead try to understand how to fix the types in other ways
- to implement compound components like `List.Item` first define the type of List, using a interface, then use : to implement it and add compound components later using . and omitting the props types given they are already typed by the interface, here is an example
- DO NOT use console.log. only use logger.log instead
- <input> uses onInput not onChange. it is passed a simple string value and not an event object
- to render examples components use renderWithProviders not render
- ALWAYS bind all class methods to `this` in the constructor. This ensures methods work correctly when called in any context (callbacks, event handlers, etc). Example:

  ```typescript
  constructor(options: Options) {
    // Initialize properties
    this.prop = options.prop

    // Bind all methods to this instance
    this.method1 = this.method1.bind(this)
    this.method2 = this.method2.bind(this)
    this.privateMethod = this.privateMethod.bind(this)
  }
  ```

## reading github repositories

you can use gitchamber.com to read repo files. run `curl https://gitchamber.com` to see how the API works. always use curl to fetch the responses of gitchamber.com

for example when working with the vercel ai sdk, you can fetch the latest docs using:

https://gitchamber.com/repos/repos/vercel/ai/main/files

use gitchamber to read the .md files using curl

## researching opentui patterns

you can read more examples of opentui react code using gitchamber by listing and reading files from the correct endpoint: https://gitchamber.com/repos/sst/opentui/main/files?glob=packages/react/examples/**

## changelog

after any meaningful change update CHANGELOG.md with the version number and the list of changes made. in concise bullet points

in bullet points use nested list and specify for which command exactly are the changes. or group them to make it clear what they cover.

before updating the changelog bump the package.json version field first. NEVER do major bumps. NEVER publish yourself

NEVER update existing changelog bullet points for previous version unless you added those bullet points yourself recently and the change is of the same version as it is now.


## zustand

- minimize number of props. do not use props if you can use zustand state instead. the app has global zustand state that lets you get a piece of state down from the component tree by using something like `useStore(x => x.something)` or `useLoaderData<typeof loader>()` or even useRouteLoaderData if you are deep in the react component tree

- do not consider local state truthful when interacting with server. when interacting with the server with rpc or api calls never use state from the render function as input for the api call. this state can easily become stale or not get updated in the closure context. instead prefer using zustand `useStore.getState().stateValue`. notice that useLoaderData or useParams should be fine in this case.

## cli

the main cli functionality is in src/cli.tsx

the main command shows the git diff in a tui. the web command uploads the terminal output to html to domain critique.work

the command review helps the user review agents diffs, reordering and splitting diff hunks to create a progressive disclosure document with explanations and diagrams. it also supports using --web to upload the result to critique.work

this command takes a long time to run, because it uses ACP to generate the result using an LLM. so to test styles changes we will usually modify scripts/preview-review.tsx instead, which let you preview how the cli looks like. and passing --web to that script to also preview how the website looks like

<!-- opensrc:start -->

## Source Code Reference

Source code for dependencies is available in `opensrc/` for deeper understanding of implementation details.

See `opensrc/sources.json` for the list of available packages and their versions.

Use this source code when you need to understand how a package works internally, not just its types/interface.

### Fetching Additional Source Code

To fetch source code for a package or repository you need to understand, run:

```bash
npx opensrc <package>           # npm package (e.g., npx opensrc zod)
npx opensrc pypi:<package>      # Python package (e.g., npx opensrc pypi:requests)
npx opensrc crates:<package>    # Rust crate (e.g., npx opensrc crates:serde)
npx opensrc <owner>/<repo>      # GitHub repo (e.g., npx opensrc vercel/ai)
```

<!-- opensrc:end -->