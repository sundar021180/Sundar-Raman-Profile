# Repository Guidelines

## Scope
These instructions apply to the entire `Sundar-Raman-Profile` repository. If you add new subdirectories, check whether they introduce their own `AGENTS.md` and place all AGENTS files in ./agents folder; the most specific file (closest to the file you are editing) always takes precedence. When in doubt, run `find . -name AGENTS.md` from the repository root and read every file whose scope overlaps your changes.

## Quick Start
- Use Node.js 18 or newer.
- From the `api/` directory run `npm install` to ensure the Google Generative AI client is available.
- Use `npm run start` from `api/` if you need to exercise the serverless function locally via Vercel.
- The project intentionally avoids global installs. Use the binaries provided by the local `node_modules` folder (e.g., `npx`) when running project-specific tooling.

## Coding Style

### HTML
- Keep markup semantic and accessible. Provide `aria` attributes for interactive elements, ensure keyboard operability, and verify contrast for text on colored backgrounds.
- Prefer utility classes (Tailwind-style) already present in the markup. If you introduce new utility-like classes, consider whether they belong in `styles.css` and document their purpose with an inline comment.
- Structure pages with two-space indentation and wrap lines at roughly 100 characters to preserve readability.

### CSS
- Only add custom rules to `styles.css`. Group related declarations, keep selectors as specific as necessary, and include a brief comment above non-obvious rules describing their intent or the component they support.
- Follow a mobile-first mindset: define base styles without media queries and add responsive overrides using ascending `min-width` breakpoints.
- Use CSS variables when introducing reusable colors, spacing, or typography tokens.

### JavaScript
- Use modern ES module syntax and prefer `const`/`let` over `var`.
- Favor small, composable functions. Document tricky logic with concise comments and include JSDoc blocks for exported functions.
- Handle asynchronous behavior with `async`/`await`, and propagate errors using `throw` rather than silent `console` logs.

### General
- Do not commit generated artifacts such as build outputs or additional `node_modules` directories.
- Include relevant updates to documentation when you introduce new behavior or configuration.

## Working With Additional Agent Files
- If you add a nested `AGENTS.md`, clearly scope it to its directory and outline any deviations from these root instructions.
- When editing files, read both the root instructions and any nested ones to understand all applicable constraints before making changes.
- Never delete an `AGENTS.md` without replacing it with updated guidance and explaining the reasoning in your commit message or PR description.

## Testing & Validation
- The test directory is located at ./test
- Run `npm run start` in `api/` to confirm the API bootstraps without runtime errors whenever you modify server-side code.
- For front-end changes, open `index.html` in a browser and perform a basic smoke test (navigation, collapsible sections, and copy-to-clipboard interactions).
- Ensure `git status` is clean before requesting review.

### Testing Standards
- Use Node's built-in test runner (`npm test` from the `api/` directory) for serverless functions. Keep tests under `./test/` and name files with the `.test.js` suffix.
- Prefer explicit request/response mocks that assert status codes, headers, and payloads so regression cases remain clear to future contributors.
- Cover both success paths and common failure scenarios (authentication, validation, upstream errors) when adding new logic.
- When stubbing globals such as `fetch`, always restore the original implementation in `beforeEach`/`afterEach` hooks to avoid cross-test pollution.
