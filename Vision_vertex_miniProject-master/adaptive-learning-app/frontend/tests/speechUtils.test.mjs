import test from "node:test";
import assert from "node:assert/strict";
import {
  parseYesNo,
  parseUsername,
  parseEmail,
  parsePinDigits,
  parseSpokenPassword,
  makeUsernameSpeakable,
  makeEmailSpeakable,
} from "../src/utils/speechUtils.ts";

test("parseYesNo accurately detects affirmative", () => {
  assert.equal(parseYesNo("yes"), "yes");
  assert.equal(parseYesNo("yeah"), "yes");
  assert.equal(parseYesNo("yep"), "yes");
  assert.equal(parseYesNo("sure"), "yes");
  assert.equal(parseYesNo("correct"), "yes");
  assert.equal(parseYesNo("it is correct"), "yes");
  assert.equal(parseYesNo("that's right"), "yes");
  assert.equal(parseYesNo("that is right"), "yes");
  assert.equal(parseYesNo("sounds good"), "yes");
  assert.equal(parseYesNo("confirm"), "yes");
  assert.equal(parseYesNo("yes please"), "yes");
  assert.equal(parseYesNo("all good"), "yes");
});

test("parseYesNo accurately detects negative including negation phrases", () => {
  assert.equal(parseYesNo("no"), "no");
  assert.equal(parseYesNo("nope"), "no");
  assert.equal(parseYesNo("incorrect"), "no");
  assert.equal(parseYesNo("wrong"), "no");
  assert.equal(parseYesNo("that's wrong"), "no");
  assert.equal(parseYesNo("not right"), "no");
  assert.equal(parseYesNo("that's not right"), "no");
  assert.equal(parseYesNo("that is not right"), "no");
  assert.equal(parseYesNo("not correct"), "no");
  assert.equal(parseYesNo("it is not correct"), "no");
  assert.equal(parseYesNo("no it is not"), "no");
  assert.equal(parseYesNo("try again"), "no");
  assert.equal(parseYesNo("retry"), "no");
  assert.equal(parseYesNo("change"), "no");
});

test("parseYesNo returns null on unclear speech", () => {
  assert.equal(parseYesNo(""), null);
  assert.equal(parseYesNo("maybe"), null);
  assert.equal(parseYesNo("hello there"), null);
  assert.equal(parseYesNo("my name is alex"), null);
});

test("parseUsername handles conversational prefixes, symbols, and spelling", () => {
  assert.equal(parseUsername("john"), "john");
  assert.equal(parseUsername("my username is alex"), "alex");
  assert.equal(parseUsername("it's alex underscore 9 9"), "alex_99");
  assert.equal(parseUsername("alex dash 123"), "alex_123");
  assert.equal(parseUsername("username is user one two"), "user12");
  assert.equal(parseUsername("j o h n"), "john");
});

test("parseEmail handles conversational prefixes, at, and dot", () => {
  assert.equal(parseEmail("learner at gmail dot com"), "learner@gmail.com");
  assert.equal(parseEmail("my email is john dot doe at example dot org"), "john.doe@example.org");
  assert.equal(parseEmail("alex at the rate gmail dot com"), "alex@gmail.com");
  assert.equal(parseEmail("test@gmail.com"), "test@gmail.com");
});

test("parsePinDigits and parseSpokenPassword handle digits and words", () => {
  assert.equal(parsePinDigits("1 2 3 4 5 6 7 8"), "12345678");
  assert.equal(parsePinDigits("one two three four five six seven eight"), "12345678");
  assert.equal(parseSpokenPassword("one two three four five six seven eight"), "12345678");
  assert.equal(parseSpokenPassword("secret 1 2 3 4 5"), "secret12345");
});

test("makeUsernameSpeakable spells out characters and symbols", () => {
  assert.equal(makeUsernameSpeakable("alex"), "a, l, e, x");
  assert.equal(makeUsernameSpeakable("a_1"), "a, underscore, 1");
});

test("makeEmailSpeakable keeps at and dot as spoken words", () => {
  const spoken = makeEmailSpeakable("alex_1@gmail.com");
  assert.equal(spoken, "a, l, e, x, underscore, 1 at gmail dot com");
});
