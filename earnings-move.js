(function () {
  "use strict";

  const Calc = window.EarningsMoveCalc;
  if (!Calc) return;

  const $ = (id) => document.getElementById(id);

  const fields = {
    symbol: $("fSymbol"),
    expiry: $("fExpiry"),
    S: $("fS"),
    K: $("fK"),
    C: $("fC"),
    P: $("fP"),
  };

  function isNvdaDefault(vals) {
    const ex = Calc.NVDA_EXAMPLE;
    return (
      String(vals.symbol || "").toUpperCase() === ex.symbol &&
      Number(vals.S) === ex.S &&
      Number(vals.K) === ex.K &&
      Number(vals.C) === ex.C &&
      Number(vals.P) === ex.P
    );
  }

  function readInputs() {
    return {
      symbol: fields.symbol.value.trim(),
      expiry: fields.expiry.value.trim(),
      S: fields.S.value,
      K: fields.K.value,
      C: fields.C.value,
      P: fields.P.value,
    };
  }

  function fillExample() {
    const ex = Calc.NVDA_EXAMPLE;
    fields.symbol.value = ex.symbol;
    fields.expiry.value = ex.expiry;
    fields.S.value = String(ex.S);
    fields.K.value = String(ex.K);
    fields.C.value = ex.C.toFixed(2);
    fields.P.value = ex.P.toFixed(2);
  }

  function setInvalid(ids, on) {
    ["S", "K", "C", "P"].forEach((k) => {
      fields[k].classList.toggle("invalid", on && ids.includes(k));
    });
  }

  function pctOnBar(value, low, high) {
    const span = high - low;
    if (!(span > 0) || !Number.isFinite(value)) return 50;
    const p = ((value - low) / span) * 100;
    return Math.min(100, Math.max(0, p));
  }

  function render(vals) {
    const result = Calc.compute(vals);
    const tag = $("exampleTag");
    const onExample = isNvdaDefault(vals) && result.ok;
    tag.textContent = onExample ? "NVDA 示例" : (vals.symbol || "自訂").toUpperCase();
    tag.classList.toggle("on-example", onExample);

    if (!result.ok) {
      setInvalid(result.errors, true);
      $("verdict").className = "em-verdict";
      $("verdictLabel").textContent = "請輸入有效數字";
      $("verdictEn").textContent = "Enter spot, strike, call and put ≥ 0";
      $("verdictNote").textContent = "現價與行使價須大於 0；權利金不可為負。";
      return;
    }
    setInvalid([], false);

    $("outMove").textContent = Calc.formatPct(result.moveTotal, 1);
    $("outHalf").textContent = "±" + Calc.formatPct(result.half, 1);
    $("outLow").textContent = Calc.formatMoney(result.low);
    $("outHigh").textContent = Calc.formatMoney(result.high);
    $("outMoveFormula").textContent =
      "(" + Calc.formatNum(result.C) + " + " + Calc.formatNum(result.P) + ") / " +
      Calc.formatNum(result.S) + " = " + Calc.formatPct(result.moveTotal, 2);
    $("outHalfFormula").textContent =
      Calc.formatPct(result.moveTotal, 2) + " / 2 = " + Calc.formatPct(result.half, 2);

    $("rangeMeta").textContent =
      "Δ " + Calc.formatMoney(result.dollarHalf) + "  ·  " +
      (vals.symbol ? vals.symbol.toUpperCase() : "—") +
      (vals.expiry ? "  ·  " + vals.expiry : "");

    $("barLowLabel").textContent = Calc.formatMoney(result.low);
    $("barHighLabel").textContent = Calc.formatMoney(result.high);

    const spotPct = pctOnBar(result.S, result.low, result.high);
    const strikePct = pctOnBar(result.K, result.low, result.high);
    $("markSpot").style.left = spotPct + "%";
    $("markStrike").style.left = strikePct + "%";
    $("markSpotCap").textContent = "現價 " + Calc.formatMoney(result.S);
    $("markStrikeCap").textContent = "K " + Calc.formatMoney(result.K, 2);
    $("barCaption").textContent =
      "區間由現價對稱 ±" + Calc.formatPct(result.half, 1) +
      "。行使價標記僅供對照 ATM 遠近，不改變高低價公式。";

    $("outPutInt").textContent = Calc.formatNum(result.putIntrinsic);
    $("outCallInt").textContent = Calc.formatNum(result.callIntrinsic);
    $("outPutHedge").textContent = Calc.formatNum(result.putHedge);
    $("outCallHedge").textContent = Calc.formatNum(result.callHedge);

    const maxHedge = Math.max(Math.abs(result.putHedge), Math.abs(result.callHedge), 1e-9);
    const putW = Math.max(0, (Math.abs(result.putHedge) / maxHedge) * 100);
    const callW = Math.max(0, (Math.abs(result.callHedge) / maxHedge) * 100);
    $("barPut").style.width = putW + "%";
    $("barCall").style.width = callW + "%";
    $("barPutVal").textContent = Calc.formatNum(result.putHedge);
    $("barCallVal").textContent = Calc.formatNum(result.callHedge);

    let ratioText = "Call / Put hedge —";
    if (result.callOverPutPct !== null) {
      const sign = result.callOverPutPct >= 0 ? "高" : "低";
      ratioText =
        "Call hedge 相對 Put hedge " + sign + " " +
        Math.abs(result.callOverPutPct).toFixed(2) + "%　·　門檻 2.00%";
    } else if (result.putHedge === 0 && result.callHedge !== 0) {
      ratioText = "Put hedge 為 0，Call hedge 無法做有限百分比比較";
    }
    $("hedgeRatioLabel").textContent = ratioText;

    const box = $("verdict");
    box.className = "em-verdict " + result.bias;

    if (result.bias === "up") {
      $("verdictLabel").textContent = "多數升";
      $("verdictEn").textContent = "Majority UP after earnings";
      $("verdictNote").textContent =
        (result.barely ? "剛過 2% 門檻（請如實看待，優勢極薄）。" : "") +
        "認購對沖價值 " + Calc.formatNum(result.callHedge) +
        " ≥ 認沽對沖 " + Calc.formatNum(result.putHedge) +
        " × 1.02（" + Calc.formatNum(result.putHedge * result.biasRatio, 4) + "）。";
    } else if (result.bias === "down") {
      $("verdictLabel").textContent = "多數跌";
      $("verdictEn").textContent = "Majority DOWN after earnings";
      $("verdictNote").textContent =
        (result.barely ? "剛過 2% 門檻（請如實看待，優勢極薄）。" : "") +
        "認沽對沖價值 " + Calc.formatNum(result.putHedge) +
        " ≥ 認購對沖 " + Calc.formatNum(result.callHedge) +
        " × 1.02（" + Calc.formatNum(result.callHedge * result.biasRatio, 4) + "）。";
    } else {
      $("verdictLabel").textContent = "均衡／無優勢";
      $("verdictEn").textContent = "Balanced / no edge";
      $("verdictNote").textContent =
        "對沖價值相差未達 2%。作者原意：兩邊價錢接近，業績後升跌機會也接近。";
    }

    const nvda = $("nvdaNote");
    if (onExample) {
      nvda.hidden = false;
      nvda.innerHTML =
        "<strong>NVDA 示例核對</strong>（原帖約 11.2%、±5.6%、~$119.5–$133.7）：" +
        "精確值 " + Calc.formatPct(result.moveTotal, 1) +
        " → ±" + Calc.formatPct(result.half, 1) +
        " → " + Calc.formatMoney(result.low) + " 至 " + Calc.formatMoney(result.high) +
        "。Put 內在價值 0.54、Put hedge 6.76、Call hedge 6.90。" +
        "Call 僅高 2.07%，剛過 2% 門檻，故顯示多數升，但優勢極薄。";
    } else {
      nvda.hidden = false;
      nvda.textContent =
        "預設載入 NVDA 示例（S=126.46, K=127, C=6.90, P=7.30）。改數字即時重算。";
    }
  }

  function onChange() {
    render(readInputs());
  }

  ["input", "change"].forEach((evt) => {
    Object.keys(fields).forEach((k) => {
      fields[k].addEventListener(evt, onChange);
    });
  });

  $("btnReset").addEventListener("click", function () {
    fillExample();
    render(readInputs());
    fields.S.focus();
  });

  fillExample();
  render(readInputs());
})();
