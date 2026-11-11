# AniWatch Shorts cloud renderer

The repository renders vertical 1080x1920 MP4 videos on GitHub-hosted Linux runners. Your computer does not perform the render.

## What it does

- Cuts real video clips from repository files or public HTTPS URLs.
- Supports multiple clips with per-clip start time and duration.
- Converts footage to vertical 9:16, 1080x1920, 30 fps.
- Keeps the image slideshow mode for still-image projects.
- Optionally mixes voice-over and background music.
- Optionally burns SRT subtitles into the video.
- Uploads the MP4 as a GitHub Actions artifact for 7 days.

This is a basic FFmpeg assembly pipeline, not a full nonlinear editor. It does not find footage, generate narration, or create subtitles automatically. Supply media that you own or are authorized to use. Copyrighted anime footage may trigger Content ID or rights claims.

## Run

1. Open the repository Actions tab.
2. Select Render AniWatch Short.
3. Choose Run workflow.
4. Set the manifest path, for example `shorts/jobs/killua.json`.
5. Set an output name and start the workflow.
6. When it finishes, download the MP4 from the workflow run Artifacts section.

## Video manifest

Use `videos` for actual moving footage. Each item has:
- `path`: repository-relative video path, or `url`: public HTTPS URL.
- `start`: start time in seconds (optional, default 0).
- `duration`: segment length in seconds (1–15).

Example:

```json
{
  "videos": [
    {"path": "shorts/assets/killua/clip.mp4", "start": 2, "duration": 5},
    {"path": "shorts/assets/killua/clip.mp4", "start": 9, "duration": 4}
  ],
  "voice": "assets/voiceover.mp3",
  "music": "assets/music.wav",
  "music_volume": 0.12,
  "subtitles": "assets/subtitles.srt"
}
```

The total output duration is the sum of segment durations. Video source audio is intentionally not used; add voice/music separately.

## Image manifest

The legacy `images` array remains supported. Each item has `url` (public HTTPS) or `path` (repository-relative) and optional `duration` in seconds (1–15). Images receive a subtle pan/zoom effect.

## Audio and subtitles

- `voice`: optional HTTPS URL string or repository path.
- `music`: optional HTTPS URL string or repository path.
- `music_volume`: optional value from 0 to 1; default 0.12.
- `subtitles`: optional public SRT URL or repository path.

Voice is padded or trimmed to fit. Music loops and is mixed under the voice. Output is H.264 MP4, 30 fps, 1080x1920.

## Limits

- Each downloaded asset is limited to 80 MB.
- Workflow timeout: 20 minutes.
- MP4 artifact retention: 7 days.
- Never put secrets, API keys, private URLs, or personal data in a manifest.
