// tickets-retrieve.js — Retrieve Ticket page logic
(function () {
  'use strict';

  var API_BASE = 'https://api.deltaharvestfestival.ca/api';

  var form = document.getElementById('tix-retrieve-form');
  if (!form) return;

  var submitBtn = document.getElementById('tix-retrieve-submit');
  var statusEl = document.getElementById('tix-retrieve-status');

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

    var email = document.getElementById('tix-retrieve-email').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStatus('Please enter a valid email address.', 'error');
      return;
    }

    submitBtn.disabled = true;
    setStatus('Sending…', null);

    fetch(API_BASE + '/tickets/retrieve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email }),
    })
      .then(function (res) { return res.json().then(function (body) { return { ok: res.ok, body: body }; }); })
      .then(function (result) {
        submitBtn.disabled = false;
        // Same message is shown whether or not anything matched — the
        // endpoint itself never tells us either way (by design).
        if (result.body && result.body.success && result.body.data && result.body.data.message) {
          setStatus(result.body.data.message, null);
          form.reset();
        } else if (result.body && result.body.code === 'RATE_LIMITED') {
          setStatus(result.body.message, 'error');
        } else {
          setStatus((result.body && result.body.message) || 'Please enter a valid email address.', 'error');
        }
      })
      .catch(function () {
        submitBtn.disabled = false;
        setStatus('Could not reach the ticket office. Please check your connection and try again.', 'error');
      });
  });
})();
