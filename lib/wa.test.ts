import test from "node:test";
import assert from "node:assert/strict";
import { telHref, waMeLink } from "./wa";

test("a call link dials the number as the family typed it", () => {
  assert.equal(telHref("+91 98470 12345"), "tel:+919847012345");
  assert.equal(telHref("0484-2345678"), "tel:04842345678");
  // Most stored numbers are ten digits with no country code: dial them locally,
  // never as "+98…" (Iran).
  assert.equal(telHref("9847012345"), "tel:9847012345");
  assert.equal(telHref("919847012345"), "tel:+919847012345");
  assert.equal(telHref("108"), "tel:108");
  assert.equal(telHref("999"), "tel:999");
  assert.equal(telHref("98470 12345 / 98470 54321"), "tel:9847012345");
  assert.equal(telHref(""), null);
  assert.equal(telHref(null), null);
});

test("a WhatsApp link needs the country code, so Indian numbers get 91", () => {
  assert.equal(waMeLink("9847012345"), "https://wa.me/919847012345");
  assert.equal(waMeLink("09847012345"), "https://wa.me/919847012345");
  assert.equal(waMeLink("+91 98470 12345"), "https://wa.me/919847012345");
  assert.equal(waMeLink("+971 50 123 4567"), "https://wa.me/971501234567");
  assert.equal(waMeLink("98470 12345, 98470 54321"), "https://wa.me/919847012345");
  assert.equal(waMeLink("108"), null);
  assert.equal(waMeLink(undefined), null);
});

test("two numbers in one field: the first is used, however they're separated", () => {
  for (const typed of ["9847012345 9847054321", "9847012345 & 9847054321", "9847012345 - 9847054321", "9847012345\n9847054321", "9847012345 and 9847054321"]) {
    assert.equal(telHref(typed), "tel:9847012345", typed);
    assert.equal(waMeLink(typed), "https://wa.me/919847012345", typed);
  }
  // Never a link to a number that cannot exist.
  assert.equal(telHref("98470123459847054321"), null);
  assert.equal(waMeLink("98470123459847054321"), null);
});

test("a foreign number stored with its country code but no + still dials abroad", () => {
  assert.equal(telHref("971501234567"), "tel:+971501234567");
  assert.equal(telHref("447700900123"), "tel:+447700900123");
  assert.equal(telHref("04842345678"), "tel:04842345678");
  assert.equal(waMeLink("971501234567"), "https://wa.me/971501234567");
});
