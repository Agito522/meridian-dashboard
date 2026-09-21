"use strict";

const assert = require("assert");
const {
  compute,
  formatPct,
  formatMoney,
  NVDA_EXAMPLE,
  BIAS_RATIO,
} = require("./earnings-move-calc.js");

function almost(actual, expected, eps) {
  const e = eps == null ? 1e-9 : eps;
  assert.ok(
    Math.abs(actual - expected) < e,
    `expected ${expected}, got ${actual}`
  );
}

// --- NVDA worked example ---
const nvda = compute(NVDA_EXAMPLE);
assert.strictEqual(nvda.ok, true);
almost(nvda.moveTotal, (6.9 + 7.3) / 126.46);
almost(nvda.half, nvda.moveTotal / 2);
almost(nvda.low, 126.46 * (1 - nvda.half));
almost(nvda.high, 126.46 * (1 + nvda.half));
almost(nvda.putIntrinsic, 0.54);
almost(nvda.callIntrinsic, 0);
almost(nvda.putHedge, 6.76);
almost(nvda.callHedge, 6.9);

// Post rounding: ≈11.2% total → ±5.6% → ~$119.5 to ~$133.7
assert.strictEqual(formatPct(nvda.moveTotal, 1), "11.2%");
assert.strictEqual(formatPct(nvda.half, 1), "5.6%");
almost(nvda.low, 119.5, 0.2);
almost(nvda.high, 133.7, 0.2);
assert.strictEqual(formatMoney(nvda.low), "$119.36");
assert.strictEqual(formatMoney(nvda.high), "$133.56");

// 2% rule: Call hedge 6.90 vs Put hedge 6.76
// 6.76 × 1.02 = 6.8952 → 6.90 just clears → majority UP
almost(nvda.putHedge * BIAS_RATIO, 6.8952);
assert.ok(nvda.callHedge >= nvda.putHedge * BIAS_RATIO);
assert.strictEqual(nvda.bias, "up");
assert.ok(nvda.barely, "NVDA should be labelled as a hair over the 2% gate");
almost(nvda.callOverPutPct, ((6.9 / 6.76) - 1) * 100);

// --- ATM equal premiums → balanced ---
const eq = compute({ S: 100, K: 100, C: 5, P: 5 });
assert.strictEqual(eq.bias, "balanced");
assert.strictEqual(eq.putIntrinsic, 0);
assert.strictEqual(eq.callIntrinsic, 0);
almost(eq.moveTotal, 0.1);
almost(eq.low, 95);
almost(eq.high, 105);

// 1% hedge gap is inside the 2% band
const near = compute({ S: 100, K: 100, C: 5.05, P: 5 });
assert.strictEqual(near.bias, "balanced");
almost(near.callOverPutPct, 1);

// --- majority DOWN (symmetric rule) ---
const down = compute({ S: 100, K: 100, C: 5, P: 5.2 });
assert.strictEqual(down.bias, "down");
almost(down.putHedge, 5.2);
almost(down.callHedge, 5);

// ITM call: intrinsic strips out of the hedge
const itmCall = compute({ S: 110, K: 100, C: 12, P: 3 });
almost(itmCall.callIntrinsic, 10);
almost(itmCall.putIntrinsic, 0);
almost(itmCall.callHedge, 2);
almost(itmCall.putHedge, 3);
assert.strictEqual(itmCall.bias, "down"); // 3 >= 2*1.02

// Zero hedges → balanced (do not treat 0 >= 0 as UP)
const zero = compute({ S: 100, K: 100, C: 0, P: 0 });
assert.strictEqual(zero.bias, "balanced");
almost(zero.moveTotal, 0);
almost(zero.low, 100);
almost(zero.high, 100);

// Validation
assert.strictEqual(compute({ S: 0, K: 100, C: 1, P: 1 }).ok, false);
assert.ok(compute({ S: 100, K: 100, C: -1, P: 1 }).errors.includes("C"));

console.log("earnings-move-calc.test.js: all assertions passed");
console.log("NVDA", {
  moveTotal: formatPct(nvda.moveTotal, 1),
  half: formatPct(nvda.half, 1),
  low: formatMoney(nvda.low),
  high: formatMoney(nvda.high),
  putIntrinsic: nvda.putIntrinsic,
  putHedge: nvda.putHedge,
  callHedge: nvda.callHedge,
  callOverPutPct: nvda.callOverPutPct.toFixed(2) + "%",
  bias: nvda.bias,
  barely: nvda.barely,
});
