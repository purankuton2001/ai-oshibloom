# Setup / セットアップ

## Requirements

- Node.js 22+ and npm.
- A modern browser. Live tests were performed on macOS; other environments need validation.
- FFmpeg on PATH for comment reactions that share an idle clip's framing. If necessary, set `FFMPEG_BINARY` in `.env` to your executable path.
- A fal API key and available provider credits for generated images, audio and video. Cloud generation does not require a local GPU.

From the repository root:

```sh
npm ci
npm run build
npm start
```

The server listens on `127.0.0.1:8790`. The free demo uses a still image and preset responses. Clicking the comment-reaction mode selector selects paid fal Turbo; merely opening the app does not submit generation requests.

## Connect generation

```sh
cp .env.example .env
```

Edit `.env` locally, set `FAL_KEY`, and restart. Keep `.env` out of version control. You can leave `OPENAI_API_KEY` empty when selecting fal for replies.

In **Stream settings / 配信設定**:

- Select fal for video and replies; save.
- For quick manual tests, set the global interval and per-viewer cooldown to `0`. Defaults are 30 and 120 seconds respectively.
- Keep a small session estimate cap and create only one idle clip initially. Estimates differ from actual provider charges.

In **My idol / わたしの推し**, save an original adult character's appearance and personality, generate four face candidates, select one, derive the other references, and confirm the three images. Then generate an idle clip. The public UI currently generates reference images from descriptions; it does not offer image uploads. The recorded example used a separately configured test reference and is not a one-click preset.

## Voice options

A fixed seed and the exact voice description are saved per character. The three generation paths differ:

- **H3 Max Turbo:** native generated speech; saved voice description and seed, no reference audio. Reactions start from an idle-video frame when available, keeping their aspect ratio aligned.
- **H3 Max reference-to-video:** selectable under video settings; can include the saved synthetic reference audio. Voice samples must meet the provider's duration constraints. The voice-creation action uses voice design for an anime character without a saved voice ID, otherwise a saved/preset voice ID.
- **H3 Max Director:** native continuous audio/video with a starting image; no reference-audio field is used. The current experiment sends questions directly as generation instructions, rather than through the separate reply LLM.

Selecting **コメントに反応** in the top switch selects Turbo, including after returning from the continuous mode. To use reference-to-video, choose it in settings after that switch. No mode guarantees an identical voice.

## OBS and YouTube

For **comment reactions**, add this OBS Browser Source at 1920×1080:

```text
http://127.0.0.1:8790/overlay?audio=1
```

The output shows the same character and reactions as the studio. OBS and the browser can have different audio policies; verify your mix before broadcasting. Full production broadcasts have not been validated.

YouTube Live chat polling requires `YOUTUBE_API_KEY`, an already-live YouTube video ID, and the YouTube chat source selected in settings. Starting the studio does not start a YouTube broadcast. The poller respects the API's requested interval and has a conservative process-local quota estimate.

The continuous-live screen currently accepts manual comments. Its stream is not wired into `/overlay`, the YouTube poller, the approval queue, or the reaction spending meter. Use its **停止・録画を保存** button to stop and save the native WebRTC recording. Recordings are written beside the project folder. The provider reported a 120-second session cap in testing; the client also has a 180-second stop timer.

## Costs and data

Reaction mode reserves configurable estimates before paid calls. Ambiguous failures keep their reservations. fal reply calls use `PRICE_REPLY`; other model/API costs may not be represented. The provider's billing is authoritative. Director is billed separately from the app's reaction estimate.

Persona data and generated media live in `data/personas/`; settings and estimates live in `data/`. The runtime queue is memory-only. Event logs are under `data/logs/`. API keys remain server-side, but prompts, references and generated media are sent to connected services. This is a local application, not fully offline inference.

The server and its Director proxy are intended for loopback use. Public hosting requires authentication and additional operational work; do not expose the development server as a public service.

## Troubleshooting

- **Still image or canned reply:** demo mode is selected. Choose fal for both video and reply generation.
- **Comments are skipped:** check whether the session is started, plus rate limits, approval, command prefix and filters.
- **No sound:** enable sound inside the stage and check browser/OBS audio settings.
- **Frame preparation failed:** install FFmpeg or set `FFMPEG_BINARY`, then retry.
- **fal returns `403` / `TOP_UP`:** inspect the provider account and key permissions. The app cannot verify the account balance from this error alone.
- **Director stops:** check the recorded error/session events and provider session cap. Do not assume every stop is a browser fault.

For a custom ComfyUI workflow, see [local setup](../local/README.md).
