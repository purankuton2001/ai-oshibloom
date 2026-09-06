<div align="center">

# AI OshiBloom

### Bring your AI idol on air.

Create a character. Send a comment. Watch them answer with generated speech and movement.

**[Watch with sound](docs/media/comment-reaction.mp4) · [Create your first reaction](#get-started) · [日本語](README.ja.md)**

Open-source AI VTuber studio · No Live2D rig required · MIT code

</div>

[![A viewer asks the character to wave. The studio generates a spoken, animated response. Click to watch with sound.](docs/media/comment-reaction.gif)](docs/media/comment-reaction.mp4)

*Sound on: this is a real app test, with the generation wait preserved. The GIF is silent; click for the video. [How the demo was recorded](docs/ASSETS.md#readme-demonstration-media).*

**What would you ask your AI idol on their first stream?**

“Introduce yourself.” “What do you do on your day off?” “I'm nervous about tomorrow. Cheer me on?”

AI OshiBloom gives your character a stage—and your comments a part in the performance. Define their look and personality, then generate their next spoken reaction. Switch to continuous live to steer an audiovisual stream as it unfolds.

For creators who want to make their own AI VTuber, and developers exploring what an audience can do inside generated video.

**Early preview.** The studio code is open source. Real generation uses **paid fal APIs**; model weights and cloud inference are not included. You can explore the controls without a key.

## Your character. Your chat. Their next scene.

- **Give a character their first show.** Create their appearance, room, personality, and voice description in one local studio. These generation modes need no Live2D rig or motion capture.
- **Put your comment in the scene.** Ask a question or request a wave. The connected models generate speech and video together.
- **Choose the rhythm.** Generate a short reaction per comment, or experiment with one continuous audiovisual stream. Switch styles in the UI.
- **Make it your own.** Character settings live in portable folders. Change the persona, explore the provider code, or take comment reactions into OBS.

## The five-comment debut

Once generation is connected, try the five built-in prompts:

1. **Introduce yourself.** Meet the character.
2. **What's your favorite drink?** Find a little personality.
3. **What do you do on your day off?** Explore their world.
4. **I'm nervous about tomorrow. Cheer me on?** Try a more personal reply.
5. **Smile and wave hello.** See speech and movement together.

The current test prompts are Japanese. **What does your character say?** Share a short recording with the question visible and sound on. Include the mode and any cuts so others can reproduce it. Unexpected answers are useful feedback, too.

## Get started

Install **Node.js 22+**. Download or clone this repository, then run these commands from its folder:

```sh
npm ci
npm run build
npm start
```

Open **[localhost:8790](http://127.0.0.1:8790)**. Press **Start session**, choose a suggested comment, and send it.

The default demo needs no API key: it uses a sample still image and preset replies to let you try the controls. **New video and speech require a provider connection.** Switch the interface language with **日本語**.

### Generate your first real reaction

1. Copy `.env.example` to `.env`, set `FAL_KEY`, and restart the app.
2. In **Stream settings**, choose **fal** for both video and replies, then save.
3. In **My idol**, create a character, generate and confirm the three reference images, then create a small idle pool. Start with **one clip**.
4. Select **コメントに反応** at the top, start a session, enable sound, and send a comment.

Install **FFmpeg** for matching the reaction’s framing to the idle video. Set `FFMPEG_BINARY` if it is not on your PATH. Keys stay on the server; connected generation sends prompts and references to the provider.

See the [setup guide](docs/SETUP.md) for pacing, voice options, and troubleshooting.

## Choose your style

### Comment reactions · コメントに反応

Each accepted comment gets a spoken reply and a short video. Idle clips play between reactions. Reply text appears when playback starts, with compact captions at the bottom.

Uses **H3 Max Turbo** by default when selected with the mode switch. This mode includes a queue, optional approval, per-viewer cooldowns, spending estimates, and an OBS overlay. YouTube Live chat polling is available here; manual chat is the easiest place to start.

### Continuous live · 連続ライブ

Keep one audiovisual stream running and send new directions without restarting it. Uses **H3 Max Director** over WebRTC, with the same character reference and voice description throughout the session.

This experimental mode currently supports **manual comments** and recording the received stream with sound. It has a separate session lifecycle: the reaction queue, YouTube integration, spending meter, and OBS overlay do not control it. The provider reported a **120-second session cap** in our test.

## Tested today

We have tested five Japanese questions through both modes with real generated audio and video. In one Director session, transcription-aligned answer starts were approximately **5–8 seconds** after submission. This is a small test, not a latency guarantee; provider load and buffering matter.

Still being improved:

- **Unwanted speech after an answer.** Silent-wait instructions do not reliably eliminate it.
- **Voice consistency.** Saved seeds and voice descriptions help steer generation but do not lock a voice. Director and Turbo do not use the saved reference-audio file.
- **Long replies.** Generated text can exceed the intended clip length.
- **Long-running streams.** Session limits, reconnect behavior, and low-motion intervals need further work.

Start with a short supervised session. Cloud generation is paid. Reaction-mode estimates are configurable and are not provider invoices; **Director spending is not included in that meter**.

## Help build the next kind of livestream

The ambition: a character's show that takes shape through the people watching it. A first greeting becomes a conversation; a viewer's idea becomes the next scene.

Today's preview demonstrates comment-driven reactions and short continuous sessions. **The next priorities are proposals, not shipped features or dated commitments:**

- **A voice that stays recognizable.** Evaluate consistency across questions and sessions.
- **Answers that know when to stop.** Improve turn endings and eliminate extra speech.
- **A show that keeps going.** Work on session renewal and recovery.
- **An easier first debut.** Reduce setup steps and make the first real reaction easier to reach.

Try a character, share a reproducible recording, or help solve one of these problems. **Star the repository to bookmark it; use Watch → Custom → Releases for release notifications.**

For a bug report, include the mode, browser, reproduction steps, and a short recording if possible. Remove API keys and private content from logs.

```sh
npm test
npm run build
```

The current 18-test suite covers queueing, cancellation, spending reservations, playback acknowledgement, provider payloads, and local HTTP/WebSocket behavior. Model quality is evaluated separately through live recordings.

Implementation lives in `src/` (server and providers), `public/` (studio and overlay), and `client/` (continuous-stream client). For a custom local generation backend, see the experimental [ComfyUI adapter](local/README.md).

## License

Code: **[MIT](LICENSE)**. Model services and generated media have separate terms; see [asset provenance](docs/ASSETS.md). Use characters and references you have permission to use. The app marks generated content as AI-generated.

## Contributing

Issues and PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Reviews count as much as PRs; anyone can do one.
