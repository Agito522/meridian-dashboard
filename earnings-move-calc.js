/**
 * C泰龍 earnings ATM-straddle implied-move calculator.
 * Pure functions — used by the page and Node tests.
 *
 * moveTotal = (C + P) / S
 * half      = moveTotal / 2
 * low/high  = S * (1 ± half)
 * hedge     = premium − intrinsic
 * bias      = Call hedge ≥ Put hedge × 1.02 → majority UP
 *             Put  hedge ≥ Call hedge × 1.02 → majority DOWN
 *             else balanced / no edge
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.EarningsMoveCalc = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const BIAS_RATIO = 1.02; // 2% hedge-edge threshold

  function toNum(v) {
    if (typeof v === "number") return v;
    if (typeof v === "string" && v.trim() === "") return NaN;
    return Number(v);
  }

  function max0(n) {
    return n > 0 ? n : 0;
  }

  /**
   * @param {{ S: number, K: number, C: number, P: number }} inputs
   * @returns {object}
   */
  function compute(inputs) {
    const S = toNum(inputs && inputs.S);
    const K = toNum(inputs && inputs.K);
    const C = toNum(inputs && inputs.C);
    const P = toNum(inputs && inputs.P);

    const errors = [];
    if (!Number.isFinite(S) || S <= 0) errors.push("S");
    if (!Number.isFinite(K) || K <= 0) errors.push("K");
    if (!Number.isFinite(C) || C < 0) errors.push("C");
    if (!Number.isFinite(P) || P < 0) errors.push("P");

    if (errors.length) {
      return { ok: false, errors };
    }

    const moveTotal = (C + P) / S;
    const half = moveTotal / 2;
    const low = S * (1 - half);
    const high = S * (1 + half);

    const putIntrinsic = max0(K - S);
    const callIntrinsic = max0(S - K);
    const putHedge = P - putIntrinsic;
    const callHedge = C - callIntrinsic;

    // Both conditions can fire when hedges are equal and zero (0 >= 0).
    // Require a one-sided 2% edge; otherwise balanced.
    const callLeans = callHedge >= putHedge * BIAS_RATIO;
    const putLeans = putHedge >= callHedge * BIAS_RATIO;

    let bias = "balanced";
    if (callLeans && !putLeans) bias = "up";
    else if (putLeans && !callLeans) bias = "down";

    let hedgeRatio = null; // Call / Put when Put ≠ 0
    let callOverPutPct = null; // (Call/Put − 1) × 100
    if (putHedge !== 0) {
      hedgeRatio = callHedge / putHedge;
      callOverPutPct = (hedgeRatio - 1) * 100;
    } else if (callHedge === 0) {
      hedgeRatio = 1;
      callOverPutPct = 0;
    }

    const thresholdPct = (BIAS_RATIO - 1) * 100;
    const barely =
      bias !== "balanced" &&
      callOverPutPct !== null &&
      Math.abs(Math.abs(callOverPutPct) - thresholdPct) < 0.25;

    return {
      ok: true,
      errors: [],
      S,
      K,
      C,
      P,
      moveTotal,
      half,
      low,
      high,
      dollarHalf: S * half,
      putIntrinsic,
      callIntrinsic,
      putHedge,
      callHedge,
      bias,
      hedgeRatio,
      callOverPutPct,
      thresholdPct,
      barely,
      biasRatio: BIAS_RATIO,
    };
  }

  /** NVDA worked example from the source post. */
  const NVDA_EXAMPLE = {
    symbol: "NVDA",
    expiry: "",
    S: 126.46,
    K: 127,
    C: 6.9,
    P: 7.3,
  };

  function formatPct(n, digits) {
    if (!Number.isFinite(n)) return "—";
    const d = digits == null ? 1 : digits;
    return (n * 100).toFixed(d) + "%";
  }

  function formatMoney(n, digits) {
    if (!Number.isFinite(n)) return "—";
    const d = digits == null ? 2 : digits;
    const abs = Math.abs(n).toFixed(d);
    return (n < 0 ? "−$" : "$") + abs;
  }

  function formatNum(n, digits) {
    if (!Number.isFinite(n)) return "—";
    return n.toFixed(digits == null ? 2 : digits);
  }

  return {
    BIAS_RATIO,
    NVDA_EXAMPLE,
    compute,
    formatPct,
    formatMoney,
    formatNum,
  };
});
