import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyInboundKeyword, isOptOutKeyword } from "./opt-out.ts";

describe("classifyInboundKeyword", () => {
  it("classifies every STOP synonym", () => {
    for (const kw of ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]) {
      assert.equal(classifyInboundKeyword(kw), "stop", `expected stop for ${kw}`);
    }
  });

  it("classifies every START synonym", () => {
    for (const kw of ["START", "YES", "UNSTOP"]) {
      assert.equal(classifyInboundKeyword(kw), "start", `expected start for ${kw}`);
    }
  });

  it("classifies every HELP synonym", () => {
    for (const kw of ["HELP", "INFO"]) {
      assert.equal(classifyInboundKeyword(kw), "help", `expected help for ${kw}`);
    }
  });

  it("normalizes mixed case", () => {
    assert.equal(classifyInboundKeyword("stop"), "stop");
    assert.equal(classifyInboundKeyword("Stop"), "stop");
    assert.equal(classifyInboundKeyword("uNsUbScRiBe"), "stop");
    assert.equal(classifyInboundKeyword("sTaRt"), "start");
    assert.equal(classifyInboundKeyword("Help"), "help");
  });

  it("normalizes surrounding whitespace", () => {
    assert.equal(classifyInboundKeyword("  stop  "), "stop");
    assert.equal(classifyInboundKeyword("\tstop\n"), "stop");
    assert.equal(classifyInboundKeyword("   YES   "), "start");
  });

  it("normalizes surrounding punctuation", () => {
    assert.equal(classifyInboundKeyword("stop."), "stop");
    assert.equal(classifyInboundKeyword(".stop."), "stop");
    assert.equal(classifyInboundKeyword("stop!"), "stop");
    assert.equal(classifyInboundKeyword(",CANCEL,"), "stop");
    assert.equal(classifyInboundKeyword("HELP?"), "help");
  });

  it("returns none for random messages", () => {
    assert.equal(classifyInboundKeyword("Hello there!"), "none");
    assert.equal(classifyInboundKeyword("When is my appointment?"), "none");
    assert.equal(classifyInboundKeyword("no thanks"), "none");
    assert.equal(classifyInboundKeyword(""), "none");
    assert.equal(classifyInboundKeyword("   "), "none");
  });
});

describe("isOptOutKeyword", () => {
  it("returns true for stop keywords", () => {
    assert.equal(isOptOutKeyword("STOP"), true);
    assert.equal(isOptOutKeyword("unsubscribe"), true);
    assert.equal(isOptOutKeyword("quit."), true);
  });

  it("returns false for non-stop input", () => {
    assert.equal(isOptOutKeyword("START"), false);
    assert.equal(isOptOutKeyword("HELP"), false);
    assert.equal(isOptOutKeyword("hello"), false);
  });
});
