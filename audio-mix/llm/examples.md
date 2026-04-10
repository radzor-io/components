# @radzor/audio-mix — Usage Examples

## Mix multiple audio tracks
```typescript
import { AudioMix } from "@radzor/audio-mix";

const mixer = new AudioMix();

const result = await mixer.mix(
  [
    { path: "/audio/vocals.wav", volume: 1.0 },
    { path: "/audio/guitar.wav", volume: 0.7 },
    { path: "/audio/drums.wav", volume: 0.8 },
    { path: "/audio/bass.wav", volume: 0.6 },
  ],
  "/output/final-mix.mp3",
  { sampleRate: 44100, channels: 2, bitrate: "320k" },
);

console.log(`Mix: ${result.outputPath}, ${result.duration}s, ${(result.size / 1024 / 1024).toFixed(1)}MB`);
```

## Mix with timing offsets
```typescript
const mixer = new AudioMix();

const result = await mixer.mix(
  [
    { path: "/audio/intro.wav", volume: 0.5 },
    { path: "/audio/main.wav", delay: 3000 },       // starts 3s in
    { path: "/audio/sfx.wav", delay: 5000, volume: 0.3 }, // starts 5s in, quieter
  ],
  "/output/podcast-intro.mp3",
);
```

## Trim an audio file
```typescript
const mixer = new AudioMix();

// Extract seconds 30 to 90
const result = await mixer.trim("/audio/interview.mp3", "/output/clip.mp3", 30, 90);
console.log(`Trimmed: ${result.duration}s`);

// Trim from the start to second 15
const intro = await mixer.trim("/audio/song.mp3", "/output/intro.mp3", 0, 15);
```

## Concatenate audio files
```typescript
const mixer = new AudioMix();

const result = await mixer.concatenate(
  [
    "/episodes/intro.mp3",
    "/episodes/sponsor-read.mp3",
    "/episodes/main-content.mp3",
    "/episodes/outro.mp3",
  ],
  "/output/episode-42.mp3",
);

console.log(`Full episode: ${result.duration}s`);
```

## Adjust volume
```typescript
const mixer = new AudioMix();

// Double the volume
await mixer.adjustVolume("/audio/quiet.mp3", "/output/louder.mp3", 2.0);

// Halve the volume
await mixer.adjustVolume("/audio/loud.mp3", "/output/softer.mp3", 0.5);

// Normalize (approximate)
const meta = await mixer.getMetadata("/audio/track.mp3");
console.log(`Original bitrate: ${meta.bitrate} bps`);
```

## Get audio metadata
```typescript
const mixer = new AudioMix();

const meta = await mixer.getMetadata("/audio/song.mp3");
console.log(`Format: ${meta.format}`);
console.log(`Codec: ${meta.codec}`);
console.log(`Duration: ${meta.duration}s`);
console.log(`Sample Rate: ${meta.sampleRate}Hz`);
console.log(`Channels: ${meta.channels}`);
console.log(`Size: ${(meta.size / 1024 / 1024).toFixed(1)}MB`);
```

---

## Python Examples

### Mix tracks
```python
from audio_mix import AudioMix

mixer = AudioMix()

result = await mixer.mix(
    [
        {"path": "/audio/vocals.wav", "volume": 1.0},
        {"path": "/audio/music.wav", "volume": 0.5},
    ],
    "/output/mix.mp3",
    {"sample_rate": 44100, "bitrate": "192k"},
)
print(f"Mixed: {result['output_path']}, {result['duration']}s")
```

### Trim and concatenate
```python
clip = await mixer.trim("/audio/long.mp3", "/output/clip.mp3", 10, 30)

full = await mixer.concatenate(
    ["/audio/part1.mp3", "/audio/part2.mp3"],
    "/output/combined.mp3",
)
```

### Volume adjustment
```python
await mixer.adjust_volume("/audio/quiet.mp3", "/output/louder.mp3", 1.5)

meta = await mixer.get_metadata("/audio/track.mp3")
print(f"{meta['codec']} | {meta['duration']}s | {meta['sample_rate']}Hz")
```
