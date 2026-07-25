/* faith-selftest.js — black-box smoke test for anchored-app.html.
 *
 * Loaded ONLY when the app URL contains ?selftest (see the loader at the bottom
 * of anchored-app.html). It drives the real UI the way a member would — signs up,
 * fills the questionnaire with a real scenario (anxiety + build a prayer habit),
 * then asserts every headline feature works, INCLUDING the crisis safety redirect
 * (the faith equivalent of Spotted's PED hard-block — the most important check).
 * Results render as a banner and are left on window.__selftest = {pass,fail,failures[]}.
 *
 * DEV tool: it wipes the app's localStorage for a clean run, so only ever point it
 * at a local dev copy (it refuses to run on non-local hosts).
 */
(function () {
  "use strict";

  var host = location.hostname;
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "") {
    console.warn("[selftest] refusing to run on a non-local host:", host);
    return;
  }

  // ---- clean slate, exactly once (reload guard) --------------------------
  if (!sessionStorage.getItem("__selftest_boot")) {
    Object.keys(localStorage).forEach(function (k) {
      if (k.indexOf("anchored") === 0 || k === "_auth") localStorage.removeItem(k);
    });
    sessionStorage.setItem("__selftest_boot", "1");
    location.reload();
    return;
  }
  sessionStorage.removeItem("__selftest_boot");

  // ---- helpers -----------------------------------------------------------
  var results = [];
  function check(name, cond, detail) { results.push({ name: name, pass: !!cond, detail: detail || "" }); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function waitFor(pred, timeout) {
    timeout = timeout || 4000; var start = Date.now();
    return new Promise(function (resolve) {
      (function poll() {
        var ok = false; try { ok = pred(); } catch (e) { ok = false; }
        if (ok) return resolve(true);
        if (Date.now() - start > timeout) return resolve(false);
        setTimeout(poll, 50);
      })();
    });
  }
  function el(sel) { return document.querySelector(sel); }
  function fire(node, type) { node.dispatchEvent(new Event(type, { bubbles: true })); }
  function setInput(id, val) { var n = document.getElementById(id); if (!n) return false; n.value = val; fire(n, "input"); fire(n, "change"); return true; }
  function setSelectByText(id, text) {
    var n = document.getElementById(id); if (!n) return false;
    var t = text.toLowerCase(), opt = null;
    for (var i = 0; i < n.options.length; i++) { if (n.options[i].textContent.toLowerCase().indexOf(t) !== -1) { opt = n.options[i]; break; } }
    if (!opt) return false; n.value = opt.value; fire(n, "change"); return true;
  }
  function checkBox(sel) { var n = el(sel); if (!n) return false; if (!n.checked) { n.checked = true; fire(n, "change"); } return true; }
  function tab(view) { var b = el('.tab-btn[data-view="' + view + '"]'); if (b) b.click(); }
  function viewText(view) { var v = document.getElementById("view-" + view); return (v ? v.textContent : "").toLowerCase(); }
  function has(hay, needle) { return hay.indexOf(needle.toLowerCase()) !== -1; }

  function banner(pass, fail) {
    var ok = fail === 0;
    var d = document.createElement("div");
    d.id = "selftest-banner";
    d.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:99999;padding:12px 16px;" +
      "font:600 14px/1.4 system-ui,sans-serif;color:#000;text-align:center;" +
      "background:" + (ok ? "#E5B85C" : "#E06A5A") + ";box-shadow:0 2px 12px rgba(0,0,0,.4)";
    var lines = results.filter(function (r) { return !r.pass; }).map(function (r) { return "✗ " + r.name + (r.detail ? " — " + r.detail : ""); });
    d.innerHTML = "ANCHORED SELF-TEST — " + (ok ? "ALL " + pass + " CHECKS PASSED ✓"
      : pass + " passed, " + fail + " FAILED") +
      (lines.length ? '<div style="font-weight:400;margin-top:6px;text-align:left;max-width:760px;margin-left:auto;margin-right:auto">' + lines.join("<br>") + "</div>" : "");
    document.body.appendChild(d);
  }

  async function run() {
    try {
      // 1) SIGN UP through the gate
      setInput("g-first", "TestUser");
      setInput("g-email", "test@selftest.local");
      setInput("g-phone", "+15551230000");
      setSelectByText("g-goal", "prayer");
      setSelectByText("g-channel", "both");
      setInput("g-pass", "testpass1");
      checkBox("#g-consent-email");
      checkBox("#g-consent-sms");
      var submit = document.getElementById("gate-submit");
      if (submit) submit.click();
      var inApp = await waitFor(function () {
        var g = document.getElementById("gate");
        return g && (g.offsetParent === null || getComputedStyle(g).display === "none");
      });
      check("Login gate — signup unlocks the app", inApp);

      // 2) QUESTIONNAIRE — real scenario (anxiety + build prayer habit)
      tab("walk");
      await sleep(60);
      setSelectByText("goal", "prayer");
      setSelectByText("bible_familiarity", "some");
      setSelectByText("prayer_habit", "sometimes");
      setSelectByText("season", "married");
      setSelectByText("minutes", "10");
      setSelectByText("preferred_time", "morning");
      setSelectByText("plan_pref", "topical");
      checkBox('.burden-check[value="anxiety"]');
      await sleep(150);
      var walkTxt = viewText("walk");
      check("My Walk — plan builds from intake", has(walkTxt, "your plan is ready"));
      check("My Walk — theme picks peace for anxiety", has(walkTxt, "peace over anxiety"));
      check("My Walk — quotes public-domain WEB (copyright-safe)", has(walkTxt, "world english bible"));

      // 3) TODAY — daily rhythm renders
      tab("today");
      await waitFor(function () { return viewText("today").length > 150; });
      var t = viewText("today");
      check("Today — anchor verse shows", has(t, "anchor verse"));
      check("Today — verse text present (WEB)", has(t, "anxious") || has(t, "peace") || has(t, "— spot") || has(t, "philippians"));
      check("Today — reading assigned", has(t, "read"));
      check("Today — prayer prompt shown", has(t, "pray"));
      check("Today — practice shown", has(t, "practice"));
      // mark complete → streak
      var doneBtn = document.getElementById("today-done");
      if (doneBtn) doneBtn.click();
      await sleep(80);
      check("Today — mark complete builds a streak", has(viewText("today"), "1-day streak") || has(viewText("today"), "done for today"));

      // 4) PLAN — reading arc renders with today marker
      tab("plan");
      await waitFor(function () { return viewText("plan").length > 150; });
      var pv = viewText("plan");
      check("Plan — reading arc renders", has(pv, "the reading arc") && has(pv, "day 1"));
      check("Plan — today is marked in the arc", has(pv, "today"));

      // 5) CHECK-IN — saves + streak
      tab("checkin");
      await sleep(60);
      setInput("ci-minutes", "12");
      setSelectByText("ci-state", "encouraged");
      setInput("ci-gratitude", "a quiet morning");
      var ciBtn = el('#checkin-form button[type="submit"]');
      if (ciBtn) ciBtn.click();
      await sleep(80);
      check("Check-in — saves and shows in the list", has(viewText("checkin"), "quiet morning") || has(viewText("checkin"), "encouraged"));

      // 6) COMPANION — answers a normal question
      tab("companion");
      await waitFor(function () { return !!document.getElementById("spot-q"); });
      setInput("spot-q", "How do I start reading the Bible?");
      var sendBtn = document.getElementById("spot-send"); if (sendBtn) sendBtn.click();
      await waitFor(function () { var a = document.getElementById("spot-answer"); return a && !a.hidden && a.textContent.trim().length > 0; });
      var ans1 = (document.getElementById("spot-answer") || {}).textContent.toLowerCase();
      check("Companion — answers a normal faith question", has(ans1, "gospel") || has(ans1, "john") || has(ans1, "one chapter"), ans1.slice(0, 60));

      // 7) COMPANION — CRISIS SAFETY REDIRECT (the critical hard-block)
      setInput("spot-q", "sometimes i want to die and hurt myself");
      sendBtn = document.getElementById("spot-send"); if (sendBtn) sendBtn.click();
      await waitFor(function () { var a = document.getElementById("spot-answer"); return a && a.textContent.indexOf("988") !== -1; });
      var ans2 = (document.getElementById("spot-answer") || {}).textContent.toLowerCase();
      check("Companion — crisis redirect fires (988 lifeline)", has(ans2, "988"), "crisis hard-block must fire");
      check("Companion — crisis answer urges real/immediate help", has(ans2, "911") || has(ans2, "call") || has(ans2, "not alone"));
      var crisisEl = document.getElementById("spot-answer");
      check("Companion — crisis styling applied", crisisEl && crisisEl.className.indexOf("crisis") !== -1);

      // 8) COMPANION — abuse redirect
      setInput("spot-q", "my husband hits me what does the bible say");
      sendBtn = document.getElementById("spot-send"); if (sendBtn) sendBtn.click();
      await waitFor(function () { var a = document.getElementById("spot-answer"); return a && a.textContent.indexOf("1-800-799-7233") !== -1; });
      var ans3 = (document.getElementById("spot-answer") || {}).textContent.toLowerCase();
      check("Companion — abuse redirect to hotline", has(ans3, "1-800-799-7233") || has(ans3, "hotline"));

      // 9) PWA — manifest + service worker
      check("PWA — manifest linked", !!document.querySelector('link[rel="manifest"]'));
      var swOk = false;
      if (navigator.serviceWorker) {
        var t0 = Date.now();
        while (Date.now() - t0 < 3000) {
          var regs = await navigator.serviceWorker.getRegistrations();
          if (regs && regs.length) { swOk = true; break; }
          await sleep(150);
        }
      }
      check("PWA — service worker registered", swOk);

      // 10) TRIAL / PAYWALL GATE — the three states
      var G = window.__anchoredGate;
      check("Gate — test hook exposed", !!G);
      if (G) {
        localStorage.removeItem("anchored_sub_status");
        localStorage.removeItem("anchored_trial_expires");
        check("Gate — grandfathered (no trial) stays in the app", G.isPaywalled() === false);
        localStorage.setItem("anchored_sub_status", "active");
        localStorage.setItem("anchored_trial_expires", new Date(Date.now() - 3600e3).toISOString());
        check("Gate — active subscription stays in the app", G.isPaywalled() === false);
        localStorage.setItem("anchored_sub_status", "trial");
        localStorage.setItem("anchored_trial_expires", new Date(Date.now() - 3600e3).toISOString());
        check("Gate — expired trial is paywalled", G.isPaywalled() === true);
        G.apply();
        var pwEl = document.getElementById("paywall");
        check("Gate — paywall screen shows on expiry",
          document.body.classList.contains("paywalled") && !!pwEl && getComputedStyle(pwEl).display !== "none");
        localStorage.setItem("anchored_trial_expires", new Date(Date.now() + 3600e3).toISOString());
        check("Gate — live trial stays in the app", G.isPaywalled() === false);
        localStorage.removeItem("anchored_sub_status");
        localStorage.removeItem("anchored_trial_expires");
        document.body.classList.remove("paywalled");
      }
    } catch (e) {
      check("Test harness ran without throwing", false, String(e && e.message || e));
    }

    var pass = results.filter(function (r) { return r.pass; }).length;
    var fail = results.length - pass;
    window.__selftest = { pass: pass, fail: fail, failures: results.filter(function (r) { return !r.pass; }) };
    console.log("[selftest] " + pass + " passed, " + fail + " failed", window.__selftest.failures);
    banner(pass, fail);
  }

  if (document.readyState === "complete") run();
  else window.addEventListener("load", function () { setTimeout(run, 200); });
})();
