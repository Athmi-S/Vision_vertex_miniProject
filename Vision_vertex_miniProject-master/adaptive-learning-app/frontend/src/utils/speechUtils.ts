/**
 * speechUtils.ts — Text and speech parsing helpers for VISION voice interaction.
 */

export const DIGIT_WORDS: Record<string, string> = {
  zero: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
};

/**
 * Determine if a spoken transcript is an affirmative ("yes") or negative ("no").
 * Returns null if the intent is unclear.
 */
export function parseYesNo(transcript: string): "yes" | "no" | null {
  if (!transcript) return null;
  // Normalize whitespace, apostrophes, and punctuation
  const t = transcript
    .toLowerCase()
    .trim()
    .replace(/['']/g, "'")
    .replace(/[^a-z0-9\s']/g, " ")
    .replace(/\s+/g, " ");

  if (!t) return null;

  // Strong negative phrases that take immediate precedence over words like "correct" or "right"
  const strongNoPhrases =
    /\b(not right|not correct|not true|no it is not|no it isn't|no its not|it is not correct|its not correct|it's not correct|it is not right|its not right|it's not right|that is not right|that's not right|thats not right|that is not correct|that's not correct|thats not correct|that is wrong|that's wrong|thats wrong|try again|do not confirm|dont confirm|don't confirm|no that is wrong|no that's wrong|no thats wrong|no it is wrong|no it's wrong|no its wrong)\b/i;

  if (strongNoPhrases.test(t)) {
    return "no";
  }

  // Strong affirmative phrases
  const strongYesPhrases =
    /\b(that's right|thats right|that is right|it is right|its right|it's right|it is correct|its correct|it's correct|that is correct|that's correct|thats correct|yes it is|yes please|yes that is right|yes that's right|sounds good|all good|looks good)\b/i;

  if (strongYesPhrases.test(t)) {
    return "yes";
  }

  // Words indicating affirmative
  const yesRegex =
    /\b(yes|yeah|yep|yup|sure|ok|okay|confirm|confirmed|proceed|continue|fine)\b/i;

  // Words indicating negative
  const noRegex =
    /\b(no|nope|nah|incorrect|wrong|false|again|retry|redo|change|cancel)\b/i;

  const isYesWord = yesRegex.test(t);
  const isNoWord = noRegex.test(t);

  // Standalone "correct" or "right"
  const hasCorrectOrRight = /\b(correct|right)\b/i.test(t);
  const hasNegation = /\b(not|never|neither|no|n't)\b/i.test(t);

  if (isYesWord && !isNoWord && !hasNegation) {
    return "yes";
  }

  if (isNoWord && !isYesWord) {
    return "no";
  }

  if (hasCorrectOrRight) {
    if (hasNegation) {
      return "no";
    }
    if (!isNoWord) {
      return "yes";
    }
  }

  return null;
}

/**
 * Normalise a spoken username.
 * Handles conversational filler, phonetic digits, underscore and dash words, and letter spacing.
 * e.g. "my username is alex underscore one two three" -> "alex_123"
 */
export function parseUsername(raw: string): string {
  if (!raw) return "";
  let s = raw.toLowerCase().trim();

  // Strip conversational prefixes
  s = s.replace(
    /^(my\s+username\s+is|the\s+username\s+is|username\s+is|it\s+is|it's|its|this\s+is|i\s+am|call\s+me)\s+/gi,
    ""
  );

  // Replace spoken symbols
  s = s.replace(/\bunderscore\b/gi, "_");
  s = s.replace(/\b(hyphen|dash)\b/gi, "_");

  // Replace spoken digit words
  for (const [word, digit] of Object.entries(DIGIT_WORDS)) {
    const re = new RegExp(`\\b${word}\\b`, "gi");
    s = s.replace(re, digit);
  }

  // Remove any remaining invalid characters (only letters, numbers, underscores allowed)
  s = s.replace(/[^a-z0-9_]/gi, "");
  return s;
}

/**
 * Normalise a spoken email address.
 * Handles conversational prefixes, "at", "dot", phonetic digits, and spacing.
 * e.g. "my email is learner at gmail dot com" -> "learner@gmail.com"
 */
export function parseEmail(raw: string): string {
  if (!raw) return "";
  let s = raw.toLowerCase().trim();

  // Strip conversational prefixes
  s = s.replace(
    /^(my\s+email\s+address\s+is|my\s+email\s+is|the\s+email\s+is|email\s+address\s+is|email\s+is|it\s+is|it's|its)\s+/gi,
    ""
  );

  // Replace spoken "at" variations
  s = s.replace(/\s*(at the rate of|at the rate|at sign|\bat\b)\s*/gi, "@");
  // Replace spoken "dot" variations
  s = s.replace(/\s*(\bdot\b|\bperiod\b)\s*/gi, ".");

  // Replace spoken digit words
  for (const [word, digit] of Object.entries(DIGIT_WORDS)) {
    const re = new RegExp(`\\b${word}\\b`, "gi");
    s = s.replace(re, digit);
  }

  // Remove whitespace
  s = s.replace(/\s+/g, "");
  return s;
}

/**
 * Normalise spoken PIN or password digits.
 * e.g. "1 2 3 4 5 6 7 8" or "one two three four five six seven eight" -> "12345678"
 */
export function parsePinDigits(raw: string): string {
  if (!raw) return "";
  const words = raw.toLowerCase().trim().split(/[\s,]+/);
  return words
    .map((w) => DIGIT_WORDS[w] ?? (/^\d$/.test(w) ? w : ""))
    .filter(Boolean)
    .join("");
}

/**
 * Normalise a spoken password (digits or alphanumeric).
 */
export function parseSpokenPassword(raw: string): string {
  if (!raw) return "";
  const digits = parsePinDigits(raw);
  if (digits.length >= 8) {
    return digits;
  }
  let s = raw.toLowerCase().trim();
  for (const [word, digit] of Object.entries(DIGIT_WORDS)) {
    const re = new RegExp(`\\b${word}\\b`, "gi");
    s = s.replace(re, digit);
  }
  return s.replace(/\s+/g, "");
}

/**
 * Format a username so Text-to-Speech pronounces it clearly (letter-by-letter, with symbols named).
 * e.g. "alex_99" -> "a, l, e, x, underscore, 9, 9"
 */
export function makeUsernameSpeakable(username: string): string {
  if (!username) return "";
  return username
    .split("")
    .map((c) => (c === "_" ? "underscore" : c === "-" ? "dash" : c))
    .join(", ");
}

/**
 * Format an email so Text-to-Speech pronounces it clearly.
 * Spells out local part characters clearly, while keeping "at" and "dot" as spoken whole words.
 * e.g. "alex_doe@gmail.com" -> "a, l, e, x, underscore, d, o, e at gmail dot com"
 */
export function makeEmailSpeakable(email: string): string {
  if (!email) return "";
  const atIdx = email.indexOf("@");
  if (atIdx === -1) {
    return makeUsernameSpeakable(email);
  }

  const localPart = email.slice(0, atIdx);
  const domainPart = email.slice(atIdx + 1);

  const spokenLocal = localPart
    .split("")
    .map((c) => (c === "_" ? "underscore" : c === "." ? "dot" : c === "-" ? "dash" : c))
    .join(", ");

  const spokenDomain = domainPart.replace(/\./g, " dot ");

  return `${spokenLocal} at ${spokenDomain}`;
}
