import * as Tone from 'tone';

export const processAudio = async (
  buffer: AudioBuffer,
  options: {
    volume: number;
    speed: number;
    pitch: number;
    trimStart: number;
    trimEnd: number;
  }
) => {
  const { volume, speed, pitch, trimStart, trimEnd } = options;
  const trimDuration = trimEnd - trimStart;
  const outputDuration = trimDuration / speed;

  // Ensure minimum duration
  if (outputDuration <= 0) {
    throw new Error('Invalid trim region. Please select a valid range.');
  }

  return await Tone.Offline(async ({ transport }) => {
    // Create a ToneAudioBuffer from the raw AudioBuffer
    const toneBuffer = new Tone.ToneAudioBuffer(buffer);

    // Create the audio processing chain
    const pitchShift = new Tone.PitchShift({
      pitch: pitch,
      windowSize: 0.1,
      delayTime: 0,
    }).toDestination();

    const volumeNode = new Tone.Volume(
      volume === 0 ? -Infinity : Tone.gainToDb(volume)
    ).connect(pitchShift);

    // Create the source player
    const player = new Tone.Player(toneBuffer).connect(volumeNode);
    player.playbackRate = speed;

    // Schedule playback from trimStart for the trim duration
    player.start(0, trimStart, trimDuration);
  }, outputDuration, 2, buffer.sampleRate);
};
