#!/usr/bin/env python3
"""Render vertical Shorts from real video clips or still images using FFmpeg."""
from __future__ import annotations
import json, re, subprocess, sys, urllib.request
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path.cwd().resolve()
ASSET_DIR = Path('output/assets')
FPS, WIDTH, HEIGHT = 30, 1080, 1920
MAX_DOWNLOAD = 80 * 1024 * 1024
VIDEO_EXTS = {'.mp4', '.mov', '.m4v', '.webm', '.mkv'}
IMAGE_EXTS = {'.jpg', '.jpeg', '.png', '.webp'}
AUDIO_EXTS = {'.mp3', '.wav', '.m4a', '.aac'}

def asset_path(value, label):
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f'{label}: expected a file path or HTTPS URL')
    parsed = urlparse(value)
    if parsed.scheme:
        if parsed.scheme != 'https' or not parsed.netloc:
            raise ValueError(f'{label}: only public HTTPS URLs are accepted')
        ASSET_DIR.mkdir(parents=True, exist_ok=True)
        suffix = Path(parsed.path).suffix.lower()
        if suffix not in VIDEO_EXTS | IMAGE_EXTS | AUDIO_EXTS | {'.srt'}:
            raise ValueError(f'{label}: unsupported media extension {suffix}')
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
        raise FileNotFoundError(f'{label}: repository path does not exist: {value}')
    return path

def optional_asset(value, label):
    if isinstance(value, dict): value = value.get('url') or value.get('path')
    return asset_path(value, label) if value else None

def main():
    if len(sys.argv) != 3: raise SystemExit('Usage: python3 shorts/render.py <manifest.json> <output-name>')
    manifest_path = (ROOT / sys.argv[1]).resolve()
    if ROOT not in manifest_path.parents: raise ValueError('Manifest must be inside the repository')
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    videos, images = manifest.get('videos', []), manifest.get('images', [])
    if bool(videos) == bool(images): raise ValueError('Provide exactly one non-empty array: videos or images')
    clips, mode = (videos, 'video') if videos else (images, 'image')
    if not isinstance(clips, list) or not clips: raise ValueError(f'{mode}s must be a non-empty array')
    name = re.sub(r'[^a-zA-Z0-9_-]', '-', sys.argv[2]).strip('-')
    if not name: raise ValueError('Invalid output filename')
    outdir = ROOT / 'output'; outdir.mkdir(exist_ok=True)
    outfile = outdir / (name + '.mp4')
    inputs, filters, labels = [], [], []
    total = 0.0
    for i, item in enumerate(clips):
        duration = float(item.get('duration', 4))
        if not 1 <= duration <= 15: raise ValueError(f'{mode}s[{i}].duration must be 1..15 seconds')
        source = asset_path(item.get('url') or item.get('path'), f'{mode}_{i}')
        label = f'v{i}'
        if mode == 'video':
            start = float(item.get('start', 0))
            if start < 0: raise ValueError(f'videos[{i}].start cannot be negative')
            inputs += ['-ss', str(start), '-t', str(duration), '-i', str(source)]
            filters.append(f'[{i}:v]scale={WIDTH}:{HEIGHT}:force_original_aspect_ratio=increase,crop={WIDTH}:{HEIGHT},fps={FPS},setpts=PTS-STARTPTS,setsar=1,format=yuv420p[{label}]')
        else:
            inputs += ['-loop','1','-framerate','1','-t','1','-i',str(source)]
            frames = round(duration * FPS)
            filters.append(f'[{i}:v]scale={WIDTH}:{HEIGHT}:force_original_aspect_ratio=increase,crop={WIDTH}:{HEIGHT},zoompan=z=\'min(zoom+0.0007,1.10)\':x=\'iw/2-(iw/zoom/2)\':y=\'ih/2-(ih/zoom/2)\':d={frames}:s={WIDTH}x{HEIGHT}:fps={FPS},setsar=1,format=yuv420p[{label}]')
        labels.append(f'[{label}]'); total += duration
    filters.append(''.join(labels) + f'concat=n={len(clips)}:v=1:a=0[vbase]')
    video_map = '[vbase]'
    subtitles = optional_asset(manifest.get('subtitles'), 'subtitles')
    if subtitles:
        p = str(subtitles).replace('\\','\\\\').replace(':','\\:').replace("'", "\\'")
        filters.append(f"[vbase]subtitles='{p}':force_style='FontName=DejaVu Sans,FontSize=17,Outline=2,Shadow=1,Alignment=2,MarginV=150'[vsub]")
        video_map = '[vsub]'
    voice, music = optional_asset(manifest.get('voice'), 'voice'), optional_asset(manifest.get('music'), 'music')
    audio, idx = [], len(clips)
    if voice:
        inputs += ['-i',str(voice)]
        filters.append(f'[{idx}:a]aresample=44100,apad,atrim=0:{total:.3f}[voice]')
        audio.append('[voice]'); idx += 1
    if music:
        inputs += ['-stream_loop','-1','-i',str(music)]
        vol = float(manifest.get('music_volume',0.12))
        if not 0 <= vol <= 1: raise ValueError('music_volume must be between 0 and 1')
        filters.append(f'[{idx}:a]volume={vol},aresample=44100,atrim=0:{total:.3f}[music]')
        audio.append('[music]')
    if len(audio) == 2:
        filters.append('[voice][music]amix=inputs=2:duration=first:dropout_transition=2[aout]'); amap='[aout]'
    elif audio: amap=audio[0]
    else: amap=None
    cmd = ['ffmpeg','-hide_banner','-y',*inputs,'-filter_complex',';'.join(filters),'-map',video_map]
    if amap: cmd += ['-map',amap]
    cmd += ['-t',f'{total:.3f}','-r',str(FPS),'-c:v','libx264','-preset','veryfast','-crf','21','-pix_fmt','yuv420p']
    cmd += (['-c:a','aac','-b:a','192k'] if amap else ['-an'])
    cmd += ['-movflags','+faststart',str(outfile)]
    subprocess.run(cmd,check=True)
    print(f'Rendered {outfile} ({total:.1f}s)')

if __name__ == '__main__': main()
