import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeFrame, hex, mapStick } from "./protocol.ts";

const state = { axes: [-1000, 1000, -1, 0], channels: [0, 1000, 1, 999], enabled: true, stopped: false };

test("encodes the upstream v2 fixture including its four packed channels and CRC", () => {
  assert.equal(hex(encodeFrame(state, 255)), "A5 5A 02 FF 18 FC E8 03 FF FF 00 00 00 A0 1F C0 F9 01 7B CE");
  assert.equal(encodeFrame(state, 256)[3], 0);
});

test("a stop overrides enable and zeros all output bytes", () => {
  const stopped = encodeFrame({ ...state, stopped: true }, 0);
  assert.deepEqual(Array.from(stopped.subarray(4, 18)), [...Array(13).fill(0), 2]);
  const disabled = encodeFrame({ ...state, enabled: false }, 0);
  assert.deepEqual(Array.from(disabled.subarray(4, 18)), Array(14).fill(0));
});

test("maps dead zone, configured range and four-way diagonal priority to original values", () => {
  assert.deepEqual(mapStick(50, -1000, { mode: "free", dead: 5, max: 255 }), [0, -255]);
  assert.deepEqual(mapStick(1000, -1000, { mode: "four-way", dead: 5, max: 255 }), [0, -255]);
  assert.deepEqual(mapStick(600, -1000, { mode: "horizontal", dead: 0, max: 1000 }), [600, 0]);
});
