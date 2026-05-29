/* shared-nav.js — Heritage Navigation · Delta Mill Society */
(function () {
  'use strict';

  var nav  = document.getElementById('hn-nav');
  var burger = document.getElementById('hn-burger');
  var menu   = document.getElementById('hn-menu');

  if (!nav) return;

  /* ── Active page ─────────────────────────────────────── */
  var active = nav.getAttribute('data-active'); // "festival" | "mill" | "hall"
  if (active) {
    var activeItem = nav.querySelector('.hn-item[data-section="' + active + '"]');
    if (activeItem) activeItem.classList.add('hn-active');
  }

  /* ── Mobile: hamburger toggle ────────────────────────── */
  if (burger && menu) {
    burger.addEventListener('click', function () {
      var isOpen = menu.classList.toggle('open');
      burger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    /* Mobile: tap on top-level link opens accordion, doesn't navigate */
    nav.querySelectorAll('.hn-item').forEach(function (item) {
      var link = item.querySelector('.hn-link');
      var drop = item.querySelector('.hn-drop');
      if (!link || !drop) return;

      link.addEventListener('click', function (e) {
        /* Only intercept on mobile widths */
        if (window.innerWidth > 820) return;
        e.preventDefault();
        var wasOpen = item.classList.contains('mob-open');
        /* Close all others */
        nav.querySelectorAll('.hn-item.mob-open').forEach(function (el) {
          el.classList.remove('mob-open');
        });
        if (!wasOpen) item.classList.add('mob-open');
      });
    });

    /* Close menu on outside click */
    document.addEventListener('click', function (e) {
      if (!nav.contains(e.target)) {
        menu.classList.remove('open');
        burger.setAttribute('aria-expanded', 'false');
        nav.querySelectorAll('.hn-item.mob-open').forEach(function (el) {
          el.classList.remove('mob-open');
        });
      }
    });

    /* Close menu when a dropdown link is tapped */
    nav.querySelectorAll('.hn-drop a').forEach(function (a) {
      a.addEventListener('click', function () {
        menu.classList.remove('open');
        burger.setAttribute('aria-expanded', 'false');
      });
    });
  }
})();
