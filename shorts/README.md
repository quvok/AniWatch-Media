# AniWatch Shorts cloud renderer

The repository can render a vertical 1080x1920 MP4 on GitHub-hosted Linux runners. Your computer does not perform the render.

## What it does

- Downloads public HTTPS images or reads assets committed inside the repository.
- Creates a vertical slideshow with subtle pan/zoom movement.
- Optionally mixes voice-over and background music.
- Optionally burns SRT subtitles into the video.
- Uploads the MP4 as a GitHub Actions artifact for 7 days.

This is a first rendering pipeline, not a full nonlinear editor. It does not find anime footage, generate narration, or create subtitles automatically. Supply media that you own or are authorized to use. Copyrighted anime footage and stills may trigger Content ID or rights claims.

## Run

1. Open the repository Actions tab.
2. Select Render AniWatch Short.
3. Choose Run workflow.
4. Set the manifest path, for example shorts/jobs/example.json.
5. Set an output name and start the workflow.
6. When it finishes, download the MP4 from the workflow run Artifacts section.

## Manifest

- images: ordered list of images; each has url (public HTTPS) or path (repository-relative) and optional duration in seconds (1–15).
- voice: optional HTTPS URL string or repository path.
- music: optional HTTPS URL string or repository path.
- music_volume: optional value from 0 to 1; default 0.12.
- subtitles: optional public SRT URL or repository path.

The total video duration is the sum of image durations. Voice is padded or trimmed to fit. Music loops and is mixed under the voice. Output is H.264 MP4, 30 fps, 1080x1920.

## Limits

- Public GitHub repository; GitHub-hosted Actions minutes are free for public repositories under GitHub current policy.
- Each downloaded asset is limited to 80 MB.
- Workflow timeout: 20 minutes.
- MP4 artifact retention: 7 days.
- Never put secrets, API keys, private URLs, or personal data in a manifest.
