import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderTemplate } from "./templates.ts";
import type { SmsTemplateVars } from "./templates.ts";

const baseVars: SmsTemplateVars = { companyName: "Acme HVAC" };
const fullVars: SmsTemplateVars = {
  companyName: "Acme HVAC",
  customerName: "Alice",
  jobDate: "Jan 15",
  jobTimeWindow: "8am-10am",
  techName: "Bob",
  etaMinutes: 20,
};

const OPT_OUT_FOOTER = " Reply STOP to opt out.";

describe("renderTemplate", () => {
  it("renders reminder with minimal vars", () => {
    const msg = renderTemplate("reminder", baseVars);
    assert.ok(msg.includes("Acme HVAC"), "should include company name");
    assert.ok(msg.endsWith(OPT_OUT_FOOTER), "should end with opt-out footer");
    assert.ok(msg.length <= 320, `reminder length ${msg.length} exceeds 320`);
  });

  it("renders confirmation with minimal vars", () => {
    const msg = renderTemplate("confirmation", baseVars);
    assert.ok(msg.includes("Acme HVAC"));
    assert.ok(msg.endsWith(OPT_OUT_FOOTER));
    assert.ok(msg.length <= 320);
  });

  it("renders on_my_way with minimal vars", () => {
    const msg = renderTemplate("on_my_way", baseVars);
    assert.ok(msg.includes("Acme HVAC"));
    assert.ok(msg.endsWith(OPT_OUT_FOOTER));
    assert.ok(msg.length <= 320);
  });

  it("all templates stay under 320 chars with all vars", () => {
    for (const id of ["reminder", "confirmation", "on_my_way"] as const) {
      const msg = renderTemplate(id, fullVars);
      assert.ok(msg.length <= 320, `${id} length ${msg.length} exceeds 320`);
    }
  });

  it("contains opt-out footer exactly once", () => {
    for (const id of ["reminder", "confirmation", "on_my_way"] as const) {
      const msg = renderTemplate(id, fullVars);
      const occurrences = (msg.match(/Reply STOP to opt out\./g) ?? []).length;
      assert.equal(occurrences, 1, `${id} has ${occurrences} opt-out footers`);
    }
  });

  it("includes customer name when provided", () => {
    const msg = renderTemplate("reminder", fullVars);
    assert.ok(msg.includes("Alice"), "should include customerName");
  });

  it("omits greeting when customerName is absent", () => {
    for (const id of ["reminder", "confirmation", "on_my_way"] as const) {
      const msg = renderTemplate(id, baseVars);
      assert.ok(!msg.startsWith("Hi "), `${id} should not start with greeting`);
      assert.ok(!msg.includes("undefined"), `${id} should not contain 'undefined'`);
    }
  });

  it("on_my_way includes tech name when provided", () => {
    const msg = renderTemplate("on_my_way", fullVars);
    assert.ok(msg.includes("Bob"), "should include techName");
  });

  it("on_my_way includes ETA when provided", () => {
    const msg = renderTemplate("on_my_way", fullVars);
    assert.ok(msg.includes("20 min"), "should include etaMinutes");
  });

  it("throws on unknown template id", () => {
    assert.throws(
      () => renderTemplate("unknown" as unknown as SmsTemplateId, baseVars),
      /Unknown SMS template id/,
    );
  });
});
