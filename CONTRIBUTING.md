# Contributing to AI OshiBloom

Thanks for looking. AI OshiBloom is a small studio: a domain model (`src/domain.ts`), an engine that queues comments and plays clips (`src/engine.ts`), provider adapters (`src/providers.ts`, `src/director.ts`), a safety guard (`src/guard.ts`) and one HTTP/WebSocket server (`src/server.ts`) serving the static studio in `public/`. Most contributions are one file.

## Good first contributions

- **An Anthropic reply provider** in `src/providers.ts`, shaped like the existing OpenAI one, selectable from the studio.
- **A session log**: one JSONL line per received comment, generation, playback and cost, so a stream can be measured after the fact.
- **Continuous live**: reconnect when the Director session hits its limit, and quiet the extra speech after a reply.
- **Studio and overlay strings in your language** (`public/`), and a README translation (`README.<lang>.md`, linked from the top of every README).
- **Names for the own-character guard** in `src/guard.ts` (real idols, groups, characters, titles in your language).

## Development

```bash
npm ci
cp .env.example .env     # demo mode, no keys needed for the studio
npm run build            # bundles the director client and type-checks
npm start                # http://127.0.0.1:8790
npm test                 # queue, cancellation, cost reservation, provider inputs, HTTP/WebSocket
```

Real generation needs a fal key and costs money; see [docs/SETUP.md](docs/SETUP.md). Keep `.env` out of version control.

## Pull requests

- One change per PR; keep the settings shape (`Settings` in `src/domain.ts`) and the provider interfaces stable, or explain why.
- Add or update a test in `test/` when you touch the guard, the engine or provider inputs.
- Don't add anything that lets a real person's face or voice, or an existing character, into the pipeline. That rule is what keeps this project shippable.
- English in code and docs; Japanese and Korean are welcome in studio strings and translations.

## Reviewing

Reviews are how this project scales, and anyone can do one — you do not need write access. A review is worth as much as a PR.

How to review:

1. Check out the branch and run `npm run build` and `npm test` (demo mode, no keys needed).
2. Read the diff against the rules under **Pull requests** above: one change, stable interfaces, a test when the guard or engine changes, nothing that lets a real person or an existing character in.
3. Post your findings as a GitHub review on the PR (approve / request changes / comment), in your own words.

Using an AI coding tool to review is welcome — run it on your own machine, on your own account or subscription, and post the result under your own name. You are responsible for what you post, so cut anything you did not check. Never share API keys or subscription tokens with other contributors or put them in the repo.

Merging:

- Every PR needs one approving review before it is merged. Reviews from contributors without write access are read the same way; a maintainer adds the formal approval.
- Changes to the safety guard and the provider code (`src/guard.ts`, `src/providers.ts`, `src/director.ts`, `src/youtube.ts`) also need a maintainer's approval — see `.github/CODEOWNERS`.
- Contributors who review well and often are offered write access so their approvals count on their own. Write access is for reviewing; merging stays with maintainers by convention.

## Reporting a safety issue

If you find a way to bypass the own-character guard, open an issue titled `safety:` — or, if you prefer, a private report via GitHub's "Report a vulnerability" on this repository.
