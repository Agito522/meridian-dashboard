# Earnings ATM straddle implied move

Educational workings for the standalone calculator at [`earnings-move.html`](../earnings-move.html).

Traditional Chinese title on the page: **1 分鐘計出業績後多數升或跌**.

This file is the GitHub-saved method note: formulas, the half-move band, hedge-value bias rules, and the NVDA arithmetic. It is **not** a transcript of any paid post.

## Source (attribution)

Educational paraphrase of a public method associated with **C泰龍** (ATM call + put around earnings).

Saved here:

- The arithmetic: straddle premium as a fraction of spot, split into a symmetric band, then a hedge-value lean.
- Timing comment: the chain is most useful **about one day before** the print.
- Author remark: when call and put (hedge) prices are close, up/down odds are similar.

**Not copied:** full Patreon or other paywalled prose, narrative commentary, or member-only wording. Implement from the formulas below; do not paste paid text into this repo.

This is research / education, not investment advice. Premiums are user-entered.

## Inputs

Same expiry and same strike (ATM or nearest ATM):

| Symbol | Meaning |
|--------|---------|
| `S` | Spot |
| `K` | ATM strike |
| `C` | Call premium |
| `P` | Put premium |
| Symbol / expiry | Optional labels only |

## 1. Total expected move

ATM straddle cost as a fraction of spot:

```text
moveTotal = (C + P) / S
```

Display as a percent (one decimal matches the source post’s “≈11.2%”).

## 2. Symmetric half-move band

```text
half = moveTotal / 2
low  = S * (1 - half)
high = S * (1 + half)
```

The band is always centred on `S`. Strike `K` is only used for intrinsic / hedge, not for shifting the high/low.

## 3. Hedge-value bias (direction lean)

Strip intrinsic first (remaining premium ≈ time / hedge value):

```text
putIntrinsic  = max(K - S, 0)
callIntrinsic = max(S - K, 0)
PutHedge      = P - putIntrinsic
CallHedge     = C - callIntrinsic
```

Compare the two hedges with a **2%** relative gate (`× 1.02`):

| Condition | Verdict |
|-----------|---------|
| `CallHedge >= PutHedge * 1.02` **and** the put-side test does not also fire | **Majority UP** · 多數升 |
| `PutHedge >= CallHedge * 1.02` **and** the call-side test does not also fire | **Majority DOWN** · 多數跌 |
| Otherwise (including equal / both-zero hedges) | **Balanced / no edge** · 均衡／無優勢 |

The source post stated the **up** case explicitly (call hedge higher by ≥2%). This repo implements the **symmetric down** rule and labels it. Equal hedge prices → similar up/down odds (author comment).

If both `CallHedge >= PutHedge * 1.02` and `PutHedge >= CallHedge * 1.02` (e.g. both hedges are `0`), treat as **balanced**, not UP.

A lean that clears 2% by less than ~0.25 percentage points is still a lean; the calculator flags it as **barely** over so the edge is not oversold.

## NVDA worked example

Inputs used on the page (must reproduce within rounding):

```text
S = 126.46
K = 127
C = 6.90
P = 7.30
```

### Range

```text
C + P                 = 14.20
moveTotal             = 14.20 / 126.46 = 0.112288…  →  11.2%  (1 d.p.)
half                  = 0.056144…       →  ±5.6%
low                   = 126.46 × (1 − half) = 119.3598…  →  $119.36
high                  = 126.46 × (1 + half) = 133.5601…  →  $133.56
```

Source post rounded the band to **~$119.5 to ~$133.7**. Exact two-decimal dollars are **$119.36–$133.56**; both are within the post’s rounding.

### Hedge / bias

```text
putIntrinsic  = max(127 − 126.46, 0) = 0.54
callIntrinsic = max(126.46 − 127, 0) = 0
PutHedge      = 7.30 − 0.54 = 6.76
CallHedge     = 6.90 − 0    = 6.90

PutHedge × 1.02 = 6.8952
6.90 >= 6.8952  →  true   (majority UP test)
6.76 >= 6.90 × 1.02 = 7.038  →  false

Call / Put hedge − 1 = 6.90 / 6.76 − 1 = 2.071%  →  just over the 2% gate
```

Verdict: **majority UP**, with an honest “barely” label. Call is only slightly above put; the 2% rule is not a wide edge on this print.

## Timing

Best read **~1 day before** earnings (author comment). Earlier, time value is fatter; later, the move may already be in the chain.

## Implementation in this repo

| File | Role |
|------|------|
| [`earnings-move.html`](../earnings-move.html) | Calculator UI |
| [`earnings-move-calc.js`](../earnings-move-calc.js) | Pure functions (`BIAS_RATIO = 1.02`) |
| [`earnings-move-calc.test.js`](../earnings-move-calc.test.js) | NVDA + up / down / balanced assertions |

```bash
node earnings-move-calc.test.js
```

## Disclaimer

Education only. User-entered marks. The 2% hedge lean is an empirical rule of thumb, not a forecast or a win-rate claim.
