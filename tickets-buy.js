// tickets-buy.js — Buy Tickets page logic
(function () {
  'use strict';

  var API_BASE = 'https://api.deltaharvestfestival.ca/api';
  var MAX_QTY = 20; // keep in sync with MAX_TICKETS_PER_TYPE in the API repo
  // Display-only — the server always re-validates price against the live
  // event record. Shown here purely so visitors see a running subtotal.
  var ADULT_PRICE = 10;
  var KIDS_PRICE = 5;

  var form = document.getElementById('tix-buy-form');
  if (!form) return;

  var adultOut = document.getElementById('tix-adult-qty');
  var kidsOut = document.getElementById('tix-kids-qty');
  var subtotalEl = document.getElementById('tix-subtotal');
  var submitBtn = document.getElementById('tix-submit');
  var statusEl = document.getElementById('tix-status');

  var qty = { adult: 0, kids: 0 };

  function clamp(n) { return Math.max(0, Math.min(MAX_QTY, n)); }

  function render() {
    adultOut.textContent = qty.adult;
    kidsOut.textContent = qty.kids;
    var total = qty.adult * ADULT_PRICE + qty.kids * KIDS_PRICE;
    subtotalEl.textContent = '$' + total.toFixed(2) + ' CAD';
    submitBtn.disabled = qty.adult + qty.kids < 1;

    ['adult', 'kids'].forEach(function (type) {
      var dec = document.querySelector('[data-type="' + type + '"][data-step="-1"]');
      var inc = document.querySelector('[data-type="' + type + '"][data-step="1"]');
      if (dec) dec.disabled = qty[type] <= 0;
      if (inc) inc.disabled = qty[type] >= MAX_QTY;
    });
  }

  document.querySelectorAll('[data-step]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var type = btn.getAttribute('data-type');
      var delta = parseInt(btn.getAttribute('data-step'), 10);
      qty[type] = clamp(qty[type] + delta);
      render();
    });
  });

  function setStatus(message, tone) {
    statusEl.textContent = message || '';
    if (tone) {
      statusEl.setAttribute('data-tone', tone);
    } else {
      statusEl.removeAttribute('data-tone');
    }
    // Errors interrupt (assertive); routine status updates wait their turn
    // (polite) — screen reader users shouldn't miss a validation error.
    if (tone === 'error') {
      statusEl.setAttribute('role', 'alert');
      statusEl.setAttribute('aria-live', 'assertive');
    } else {
      statusEl.setAttribute('role', 'status');
      statusEl.setAttribute('aria-live', 'polite');
    }
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    setStatus('', null);

    var name = document.getElementById('tix-name').value.trim();
    var email = document.getElementById('tix-email').value.trim();

    if (!name) {
      setStatus('Please enter your name.', 'error');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStatus('Please enter a valid email address.', 'error');
      return;
    }
    if (qty.adult + qty.kids < 1) {
      setStatus('Please select at least one ticket.', 'error');
      return;
    }

    var submitLabel = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Redirecting…';
    setStatus('Redirecting to secure checkout…', null);

    fetch(API_BASE + '/payments/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: name,
        customerEmail: email,
        adultQty: qty.adult,
        kidsQty: qty.kids,
      }),
    })
      .then(function (res) { return res.json().then(function (body) { return { ok: res.ok, body: body }; }); })
      .then(function (result) {
        if (result.ok && result.body.success && result.body.data && result.body.data.url) {
          window.location.href = result.body.data.url;
          return;
        }
        submitBtn.disabled = false;
        submitBtn.textContent = submitLabel;
        setStatus((result.body && result.body.message) || 'Something went wrong. Please try again.', 'error');
      })
      .catch(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = submitLabel;
        setStatus('Could not reach the ticket office. Please check your connection and try again.', 'error');
      });
  });

  render();
})();
