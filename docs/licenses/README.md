# Bundled license sources

`robot3.LICENSE.txt` is copied verbatim from https://github.com/matthewp/robot/blob/main/LICENSE (retrieved 2026-09-06). robot3 0.4.1 declares BSD-2-Clause but its npm archive does not include a license file.

The build reads license files directly from the other installed packages. It emits `public/THIRD_PARTY_NOTICES.txt` and embeds the same notices in `public/director-client.js`. New bundled packages without a license file fail the build.
