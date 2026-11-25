// PortOne mobile REDIRECTION return. This static page loads no analytics or app bundle.
// 1. Remove the provider query (it can carry paymentToken) from the address bar before anything else.
// 2. Send the token at most once, in a POST body, with the server-signed continuation. Never store or log it.
// 3. Resume the order by status lookup exactly once: when the POST settles, or at the deadline even if the
//    request never settles or ignores abort. The server, not this page, decides every result.
(function (w) {
  'use strict';
  var DEADLINE_MS = 8000;
  var params = new w.URLSearchParams(w.location.search);
  w.history.replaceState(null, '', w.location.pathname);
  var LANGS = ['ko', 'en', 'ja', 'zh-cn', 'zh-tw', 'id', 'es', 'bn', 'tl', 'th', 'vi', 'my'];
  var lang = params.get('lang');
  if (LANGS.indexOf(lang) < 0) lang = 'ko';
  var order = params.get('order');
  var validOrder = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(order || '');
  var back = '/' + lang + '/star-candy' + (validOrder ? '?portone_order=' + order : '');
  var paymentId = params.get('paymentId') || '';
  var txId = params.get('txId') || '';
  var token = params.get('paymentToken') || '';
  var continuation = params.get('c') || '';
  var confirmable = validOrder && !params.get('code')
    && /^web_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(paymentId)
    && /^[A-Za-z0-9._:-]{1,200}$/.test(txId) && /^[\x21-\x7e]{1,2048}$/.test(token)
    && /^v1\.[0-9]{1,12}\.[A-Za-z0-9_-]{43}$/.test(continuation);
  params = null;
  if (!confirmable) { token = ''; w.location.replace(back); return; }

  var done = false;
  var timer = null;
  var controller = null;
  try { controller = typeof w.AbortController === 'function' ? new w.AbortController() : null; } catch (e) { controller = null; }
  // The only navigation. Repeated callbacks, late settlement and the deadline all funnel here.
  function resume() {
    if (done) return;
    done = true;
    if (timer !== null && typeof w.clearTimeout === 'function') w.clearTimeout(timer);
    timer = null;
    if (controller) { try { controller.abort(); } catch (e) { /* Abort is best effort. */ } }
    controller = null;
    w.location.replace(back);
  }
  timer = w.setTimeout(resume, DEADLINE_MS);
  var body = w.JSON.stringify({ paymentId: paymentId, txId: txId, paymentToken: token, continuation: continuation });
  token = '';
  var init = { method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer',
    headers: { 'Content-Type': 'application/json' }, body: body };
  if (controller) init.signal = controller.signal;
  body = null;
  var pending;
  try { pending = w.fetch('/api/payment/orders/' + order + '/portone/hosted/confirm', init); }
  catch (e) { init = null; resume(); return; }
  init = null;
  w.Promise.resolve(pending).then(resume, resume);
})(window);
