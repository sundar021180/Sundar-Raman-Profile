# Repository Guidelines

## Scope
These instructions apply to the entire `Sundar-Raman-Profile` repository.

## Quick Start
- Use Node.js 18 or newer.
- From the `api/` directory run `npm install` to ensure the Google Generative AI client is available.
- Use `npm run start` from `api/` if you need to exercise the serverless function locally via Vercel.

## Coding Style
- Keep HTML semantic and accessible: provide `aria` attributes for interactive elements and ensure keyboard operability.
- Prefer Tailwind utility classes over custom CSS when possible. If you must add custom CSS, place it in `styles.css` and document the intent with a short comment.
- Write JavaScript in modern ES modules style, favoring `const`/`let` and async/await.
- Do not commit generated artifacts such as build outputs or additional `node_modules` directories.

## Testing & Validation
- Run `npm run start` in `api/` to confirm the API bootstraps without runtime errors whenever you modify server-side code.
- For front-end changes, open `index.html` in a browser and perform a basic smoke test (navigation, collapsible sections, and copy-to-clipboard interactions).
- Ensure `git status` is clean before requesting review.
