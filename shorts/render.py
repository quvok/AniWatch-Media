#!/usr/bin/env python3
"""Render a vertical slideshow Short from a JSON manifest using FFmpeg.
Assets may be repository-relative paths or public HTTPS URLs. Use only media
that you own or are licensed/authorized to use.
"""
from __future__ import annotations
import json, re, subprocess, sys, urllib.request
from pathlib import Path
from urllib.parse import urlparse
ROOT = Path.cwd().resolve()
ASSET_DIR = Path('output/assets')
FPS, WIDTH, HEIGHT = 30, 1080, 1920
MAX_DOWNLOAD = 80 * 1024 * 1024

def asset_path(value, label):
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f'{label}: expected a file path or HTTPS URL')
    parsed = urlparse(value)
    if parsed.scheme:
        if parsed.scheme != 'https' or not parsed.netloc:
            raise ValueError(f'{label}: only public HTTPS URLs are accepted')
        ASSET_DIR.mkdir(parents=True, exist_ok=True)
        suffix = Path(parsed.path).suffix.lower()
        if suffix not in {'.jpg','.jpeg','.png','.webp','.mp3','.wav','.m4a','.aac','.srt'}:
            suffix = '.bin'
        target = ASSET_DIR / (re.sub(r'[^a-zA-Z0-9_-]', '_', label) + suffix)
        req = urllib.request.Request(value, headers={'User-Agent':'AniWatchMedia-Renderer/1.0'})
        with urllib.request.urlopen(req, timeout=45) as response, target.open('wb') as out:
            total = 0
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk: break
                total += len(chunk)
                if total > MAX_DOWNLOAD: raise ValueError(f'{label}: download exceeds 80 MB limit')
                out.write(chunk)
        return target.resolve()
    path = (ROOT / value).resolve()
    if ROOT not in path.parents or not path.is_file():
        raise FileNotFoundError(f'{label}: path must exist inside the repository: {value}')
    return path

def optional_asset(value, label):
    if isinstance(value, dict): value = value.get('url') or value.get('path')
    return asset_path(value, label) if value else None

def main():
    if len(sys.argv) != 3: raise SystemExit('Usage: python3 shorts/render.py <manifest.json> <output-name>')
    manifest_path = (ROOT / sys.argv[1]).resolve()
    if ROOT not in manifest_path.parents: raise ValueError('Manifest must be inside the repository')
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    images = manifest.get('images', [])
    if not isinstance(images, list) or not images: raise ValueError('Manifest must contain a non-empty images array')
    output_name = re.sub(r'[^a-zA-Z0-9_-]', '-', sys.argv[2]).strip('-')
    if not output_name: raise ValueError('Invalid output filename')
    outdir = ROOT / 'output'; outdir.mkdir(exist_ok=True)
    outfile = outdir / (output_name + '.mp4')
    inputs, filters, labels = [], [], []
    duration_total = 0.0
    for i, item in enumerate(images):
        duration = float(item.get('duration', 4))
        if not 1 <= duration <= 15: raise ValueError(f'images[{i}].duration must be 1..15 seconds')
        img = asset_path(item.get('url') or item.get('path'), f'image_{i}')
        inputs += ['-loop','1','-framerate','1','-t','1','-i',str(img)]
        frames = round(duration * FPS); label = f'v{i}'
        filters.append(f'[{i}:v]scale={WIDTH}:{HEIGHT}:force_original_aspect_ratio=increase,crop={WIDTH}:{HEIGHT},zoompan=z=\'min(zoom+0.0007,1.10)\':x=\'iw/2-(iw/zoom/2)\':y=\'ih/2-(ih/zoom/2)\':d={frames}:s={WIDTH}x{HEIGHT}:fps={FPS},setsar=1,format=yuv420p[{label}]')
        labels.append(f'[{label}]'); duration_total += duration
    filters.append(''.join(labels) + f'concat=n={len(images)}:v=1:a=0[vbase]')
    video_map = '[vbase]'
    subtitles = optional_asset(manifest.get('subtitles'), 'subtitles')
    if subtitles:
        p = str(subtitles).replace('\\','\\\\').replace(':','\\:').replace("'", "\\'")
        filters.append(f"[vbase]subtitles='{p}':force_style='FontName=DejaVu Sans,FontSize=17,Outline=2,Shadow=1,Alignment=2,MarginV=150'[vsub]")
        video_map = '[vsub]'
    voice = optional_asset(manifest.get('voice'), 'voice')
    music = optional_asset(manifest.get('music'), 'music')
    audio_labels = []
    if voice:
        idx = len(images); inputs += ['-i',str(voice)]
        filters.append(f'[{idx}:a]aresample=44100,apad,atrim=0:{duration_total:.3f}[voice]'); audio_labels.append('[voice]')
    if music:
        idx = len(images) + (1 if voice else 0); inputs += ['-stream_loop','-1','-i',str(music)]
        vol = float(manifest.get('music_volume',0.12))
        if not 0 <= vol <= 1: raise ValueError('music_volume must be between 0 and 1')
        filters.append(f'[{idx}:a]volume={vol},aresample=44100,atrim=0:{duration_total:.3f}[music]'); audio_labels.append('[music]')
    if len(audio_labels) == 2:
        filters.append('[voice][music]amix=inputs=2:duration=first:dropout_transition=2[aout]'); audio_map='[aout]'
    elif audio_labels: audio_map=audio_labels[0]
    else: audio_map=None
    cmd = ['ffmpeg','-hide_banner','-y',*inputs,'-filter_complex',';'.join(filters),'-map',video_map]
    if audio_map: cmd += ['-map',audio_map]
    cmd += ['-t',f'{duration_total:.3f}','-r',str(FPS),'-c:v','libx264','-preset','veryfast','-crf','21','-pix_fmt','yuv420p']
    if audio_map: cmd += ['-c:a','aac','-b:a','192k']
    else: cmd += ['-an']
    cmd += ['-movflags','+faststart',str(outfile)]
    subprocess.run(cmd,check=True)
    print(f'Rendered {outfile} ({duration_total:.1f}s)')
if __name__ == '__main__': main()
