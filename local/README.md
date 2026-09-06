# Local ComfyUI adapter

Export a video-generation workflow from your own ComfyUI instance in **API format** to `local/workflow.json`. No model, weights or GPU runtime is included.

The adapter uploads the three in-app generated references via `/upload/image`, replaces exact JSON string values below, submits `/prompt`, polls `/history/<id>`, and downloads `/view`. Your output node must report an mp4 or webm in `gifs` or `videos` (for example a Video Combine output).

- `{{PROMPT}}`: the complete guarded prompt
- `{{FACE}}`, `{{FULL}}`, `{{SCENE}}`: uploaded reference filenames for image-loader nodes
- `{{FRAMES}}`: duration × 24, as a number
- `{{SEED}}`: random seed, as a number

Generate and confirm a real reference set through fal first, then stop the session and switch to local. The demo sample is deliberately not treated as a validated reference set. Local generation has a zero **provider-charge estimate**; GPU/electricity costs are not included. Treat it as a pre-generation path: interactive latency is not guaranteed. Cancelling a request stops this client's wait; a local workflow may continue on the GPU.

This adapter is implemented but has not been exercised against an installed H3 workflow in this delivery.
