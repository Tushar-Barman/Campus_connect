// Round 2: messages made of only 1–3 emoji render large, without a bubble.
// Emoji presentation only: "😀", "❤️" (with VS16), flags, keycaps. Plain symbols such as ™ don't count.
const EMOJI_GRAPHEME = /^(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}️|\p{Regional_Indicator}|[#*0-9]️?⃣)/u;
const HAS_TEXT = /[\p{L}\p{N}]/u;
const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

export function isEmojiOnly(text, max = 3) {
  const value = (text || '').replace(/\s+/g, '');
  if (!value || !segmenter) return false;
  const graphemes = [...segmenter.segment(value)].map((s) => s.segment);
  if (graphemes.length > max) return false;
  return graphemes.every((g) => EMOJI_GRAPHEME.test(g) && !HAS_TEXT.test(g.replace(/[#*0-9]️?⃣/u, '')));
}
