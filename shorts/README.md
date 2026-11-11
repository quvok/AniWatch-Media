# AniWatch Shorts cloud renderer

The repository renders vertical 1080x1920 MP4 videos on GitHub-hosted Linux runners. Your computer does not perform the render.

## What it does

- Cuts real moving video clips from repository files or public HTTPS URLs.
- Converts footage to vertical 9:16, 1080x1920, 30 fps.
- Can generate Russian narration and synchronized SRT captions with the Edge TTS online service.
- Generates an original electronic background bed and transition accents locally on the runner (no music-library download or paid music credits).
- Mixes voice and music, burns readable subtitles into the video, and uploads the MP4 as a GitHub Actions artifact for 7 days.
- Keeps the legacy still-image slideshow mode for image-only projects.

The narration service requires internet access from the GitHub runner. The default Russian female voice is `ru-RU-SvetlanaNeural`; voice availability depends on the upstream service. This is not a guaranteed offline service and may change independently of this repository.

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
- `start`: start time in seconds.
- `duration`: segment length in seconds (1–15).

Example with automatic narration:

```json
{
  "videos": [
    {"path": "shorts/assets/killua/clip.mp4", "start": 2, "duration": 5},
    {"path": "shorts/assets/killua/clip.mp4", "start": 9, "duration": 4}
  ],
  "narration": {
    "text": "Текст русской озвучки.",
    "voice": "ru-RU-SvetlanaNeural",
    "rate": "+8%"
  },
  "music_volume": 0.16
}
```

When `narration` is present, the workflow creates `output/narration.mp3`, synchronized `output/narration.srt`, and an original electronic `output/original_music.wav` soundtrack before rendering. The generated paths are added to the working manifest automatically.

You can also supply existing `voice`, `music`, and `subtitles` paths or HTTPS URLs manually. The renderer supports SRT subtitles and optional voice/music.

## Image manifest

The legacy `images` array remains supported. Each item has `url` (public HTTPS) or `path` (repository-relative) and optional `duration` in seconds (1–15). Images receive a subtle pan/zoom effect.

## Limits and rights

- Each downloaded asset is limited to 80 MB.
- Workflow timeout: 20 minutes.
- MP4 artifact retention: 7 days.
- Supply media that you own or are authorized to use. Copyrighted anime footage may trigger Content ID or rights claims.
