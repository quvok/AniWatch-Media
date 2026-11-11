#!/usr/bin/env python3
"""Generate narration, synchronized SRT captions, and an original electronic music bed."""
from __future__ import annotations

import json
import math
import random
import subprocess
import sys
import wave
from array import array
from pathlib import Path

ROOT = Path.cwd().resolve()
OUT = ROOT / "output"
SAMPLE_RATE = 44100


def render_music(path: Path, duration: float) -> None:
    """Create a restrained original synth bed with pulse and transition whooshes."""
    frames = max(1, round(duration * SAMPLE_RATE))
    rng = random.Random(20261112)
    samples = array("h")
    chord_sets = [
        (174.61, 207.65, 261.63),
        (146.83, 174.61, 220.00),
        (130.81, 155.56, 196.00),
        (164.81, 196.00, 246.94),
    ]
    arp = (523.25, 659.25, 783.99, 659.25, 587.33, 698.46, 880.00, 698.46)
    beat = 0.72
    whooshes = (2.7, 5.5, 8.0, 10.7, 12.9)

    for n in range(frames):
        t = n / SAMPLE_RATE
        bar = int(t // 3.6) % len(chord_sets)
        chord = chord_sets[bar]
        pad = sum(math.sin(2 * math.pi * f * t) for f in chord) / 3
        pad += 0.22 * math.sin(2 * math.pi * (chord[0] / 2) * t)
        pulse_phase = t % beat
        bass_env = math.exp(-pulse_phase * 8.5)
        bass = math.sin(2 * math.pi * 55 * t) * bass_env
        step = int(t / (beat / 2))
        arp_freq = arp[step % len(arp)]
        arp_env = min(1.0, (t % (beat / 2)) * 18) * math.exp(-(t % (beat / 2)) * 3)
        sparkle = math.sin(2 * math.pi * arp_freq * t) * arp_env

        fx = 0.0
        for center in whooshes:
            dt = t - center
            if 0 <= dt <= 0.42:
                env = math.sin(math.pi * dt / 0.42) ** 1.5
                noise = rng.uniform(-1.0, 1.0)
                sweep = math.sin(2 * math.pi * (180 + 900 * dt) * t)
                fx += env * (0.55 * noise + 0.45 * sweep)

        fade_in = min(1.0, t / 0.8)
        fade_out = min(1.0, max(0.0, (duration - t) / 1.0))
        value = (0.105 * pad + 0.075 * bass + 0.035 * sparkle + 0.025 * fx) * fade_in * fade_out
        value = max(-0.85, min(0.85, value))
        sample = int(value * 32767)
        samples.append(sample)
        samples.append(sample)

    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)
        wav.writeframes(samples.tobytes())


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python3 shorts/generate_assets.py <manifest.json>")
    manifest_path = (ROOT / sys.argv[1]).resolve()
    if ROOT not in manifest_path.parents or not manifest_path.is_file():
        raise FileNotFoundError("Manifest must exist inside the repository")

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    narration = manifest.get("narration")
    if not isinstance(narration, dict) or not narration.get("text"):
        raise ValueError("Manifest must contain narration.text")

    OUT.mkdir(exist_ok=True)
    voice_path = OUT / "narration.mp3"
    subtitles_path = OUT / "narration.srt"
    voice = narration.get("voice", "ru-RU-SvetlanaNeural")
    rate = narration.get("rate", "+8%")

    command = [
        sys.executable, "-m", "edge_tts",
        "--voice", voice,
        "--rate", rate,
        "--text", narration["text"],
        "--write-media", str(voice_path),
        "--write-subtitles", str(subtitles_path),
    ]
    print(f"Generating Russian narration with {voice}...")
    subprocess.run(command, check=True)

    clips = manifest.get("videos") or manifest.get("images") or []
    duration = sum(float(item.get("duration", 4)) for item in clips)
    music_path = OUT / "original_music.wav"
    render_music(music_path, duration)
    manifest["voice"] = "output/narration.mp3"
    manifest["subtitles"] = "output/narration.srt"
    manifest["music"] = "output/original_music.wav"
    manifest.setdefault("music_volume", 0.16)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Generated narration, captions, and {duration:.2f}s original music bed.")


if __name__ == "__main__":
    main()
