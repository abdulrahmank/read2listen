// Split only when the tokenizer reports overflow; never silently truncate speech.
export async function generateBounded(tts, text, voice, speed) {
  try {
    const audio = await tts.generate(text, { voice, speed });
    return audio.audio;
  } catch (error) {
    if (!(error instanceof RangeError) || error.message !== 'PHONEME_LIMIT') throw error;
    const characters = Array.from(text);
    if (characters.length < 2) throw error;
    let boundary = text.lastIndexOf(' ', Math.floor(text.length / 2));
    if (boundary < text.length / 4) boundary = characters.slice(0, Math.floor(characters.length / 2)).join('').length;
    const left = await generateBounded(tts, text.slice(0, boundary).trim(), voice, speed);
    const right = await generateBounded(tts, text.slice(boundary).trim(), voice, speed);
    const combined = new Float32Array(left.length + right.length);
    combined.set(left); combined.set(right, left.length);
    return combined;
  }
}

