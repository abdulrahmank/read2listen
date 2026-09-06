// The Web Speech API has locale metadata but no gender field. Match only
// recognized built-in voice names or explicit provider labels; others stay unknown.
const femaleNames = /\b(samantha|karen|moira|tessa|zira|hazel|susan|salli|joanna|kendra|kimberly|ivy|amy|emma|nicole|raveena|aditi|veena|lekha|kathy|victoria|nicky)\b/i;
const maleNames = /\b(rishi|daniel|alex|aaron|david|mark|george|james|fred|tom|guy|ryan|brian|matthew|justin|joey|russell|enrique)\b/i;
export function voiceGender(voice) {
  if (/\bfemale\b/i.test(voice.name)) return 'female';
  if (/\bmale\b/i.test(voice.name)) return 'male';
  if (femaleNames.test(voice.name)) return 'female';
  if (maleNames.test(voice.name)) return 'male';
  return 'unknown';
}
const normalize = locale => String(locale || '').replace(/_/g, '-').toLowerCase();

export function chooseVoice(voices, locale, gender) {
  const target = normalize(locale);
  const language = target.split('-')[0];
  const candidates = voices.filter(voice => normalize(voice.lang).split('-')[0] === language);
  const score = voice => (normalize(voice.lang) === target ? 100 : 0) +
    (gender !== 'any' && voiceGender(voice) === gender ? 20 : 0) + (voice.localService ? 2 : 0) + (voice.default ? 1 : 0);
  const voice = [...candidates].sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name))[0] || null;
  const notices = [];
  if (!voice) return { voice: null, notice: 'No voice is available for this language on your device. Choose another language or install a system voice.' };
  if (normalize(voice.lang) !== target) notices.push(`Using the available ${voice.lang} accent.`);
  if (gender && gender !== 'any' && voiceGender(voice) !== gender) notices.push('Your preferred voice gender is not identified for this locale; using an available voice.');
  return { voice, notice: notices.join(' ') };
}

export function loadVoicePreferences(storage, defaultLocale) {
  try {
    const saved = JSON.parse(storage.getItem('read2listen.voice') || '{}');
    return { locale: typeof saved.locale === 'string' && saved.locale ? saved.locale : defaultLocale,
      gender: ['female', 'male', 'any'].includes(saved.gender) ? saved.gender : '' };
  } catch { return { locale: defaultLocale, gender: '' }; }
}
