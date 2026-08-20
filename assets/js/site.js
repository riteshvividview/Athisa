(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasGsap = !!(window.gsap && window.ScrollTrigger);
  if (hasGsap) { gsap.registerPlugin(ScrollTrigger); }
  else { document.documentElement.classList.add('no-gsap'); }

  /* ---- Mobile nav ---- */
  var toggle = document.getElementById('menuToggle');
  var menu = document.getElementById('mobileMenu');
  function closeMenu() {
    toggle.classList.remove('is-active');
    toggle.setAttribute('aria-expanded', 'false');
    menu.classList.remove('is-open');
  }
  function openMenu() {
    toggle.classList.add('is-active');
    toggle.setAttribute('aria-expanded', 'true');
    menu.classList.add('is-open');
  }
  toggle.addEventListener('click', function () {
    menu.classList.contains('is-open') ? closeMenu() : openMenu();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });
  menu.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', closeMenu); });

  /* ---- Lenis smooth scroll, synced to the GSAP ticker so ScrollTrigger
     and Lenis always agree on scroll position (avoids jitter/desync). ---- */
  var lenis = null;
  if (!reduceMotion && window.Lenis) {
    lenis = new Lenis({
      duration: 1.05,
      easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); },
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 1.1
    });

    if (hasGsap) {
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
      gsap.ticker.lagSmoothing(0);
    } else {
      (function raf(time) { lenis.raf(time); requestAnimationFrame(raf); })();
    }
  }

  /* ---- Anchor links respect Lenis ---- */
  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener('click', function (e) {
      var id = link.getAttribute('href');
      if (id.length < 2) return;
      var target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      if (lenis) { lenis.scrollTo(target, { offset: -20 }); }
      else { target.scrollIntoView({ behavior: 'smooth' }); }
    });
  });

  /* ---- Header: frosted state once the hero starts scrolling away ---- */
  var header = document.querySelector('.site-header');
  if (header) {
    if (hasGsap) {
      ScrollTrigger.create({
        start: 60,
        toggleClass: { targets: header, className: 'is-scrolled' }
      });
    } else {
      var headerTick = false;
      function updateHeader() {
        header.classList.toggle('is-scrolled', window.scrollY > 60);
        headerTick = false;
      }
      window.addEventListener('scroll', function () {
        if (!headerTick) { requestAnimationFrame(updateHeader); headerTick = true; }
      }, { passive: true });
      updateHeader();
    }
  }

  /* ---- Scroll reveal (fallback path: plain IntersectionObserver) ---- */
  var revealEls = document.querySelectorAll('.reveal, .reveal-stagger');
  function revealFallback() {
    if ('IntersectionObserver' in window && !reduceMotion) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
      revealEls.forEach(function (el) { io.observe(el); });
    } else {
      revealEls.forEach(function (el) { el.classList.add('is-visible'); });
    }
  }

  /* ---- Premium motion layer (GSAP + ScrollTrigger) ---- */
  if (hasGsap && !reduceMotion) {

    /* Reveal groups: same visual language as the CSS fallback (rise + fade)
       but driven by ScrollTrigger so timing/easing is consistent with the
       rest of the scroll story, with a gentle overshoot-free ease. */
    revealEls.forEach(function (el) {
      var isStagger = el.classList.contains('reveal-stagger');
      var targets = isStagger ? gsap.utils.toArray(el.children) : el;
      gsap.to(targets, {
        opacity: 1,
        y: 0,
        duration: 0.9,
        ease: 'power3.out',
        stagger: isStagger ? 0.08 : 0,
        scrollTrigger: {
          trigger: el,
          start: 'top 85%',
          once: true
        },
        onStart: function () { el.classList.add('is-visible'); }
      });
    });

    /* ---- Split-word heading reveal ---- */
    function splitWords(root) {
      var words = [];
      function walk(node) {
        Array.prototype.slice.call(node.childNodes).forEach(function (child) {
          if (child.nodeType === 3) {
            var parts = child.textContent.split(/(\s+)/).filter(function (s) { return s.length; });
            var frag = document.createDocumentFragment();
            parts.forEach(function (part) {
              if (/^\s+$/.test(part)) {
                frag.appendChild(document.createTextNode(part));
              } else {
                var outer = document.createElement('span');
                outer.className = 'split-word';
                var inner = document.createElement('span');
                inner.className = 'split-word-inner';
                inner.textContent = part;
                outer.appendChild(inner);
                frag.appendChild(outer);
                words.push(inner);
              }
            });
            node.replaceChild(frag, child);
          } else if (child.nodeType === 1) {
            walk(child);
          }
        });
      }
      walk(root);
      return words;
    }

    document.querySelectorAll('.js-split').forEach(function (heading) {
      var words = splitWords(heading);
      if (!words.length) { heading.classList.add('js-split-ready'); return; }
      gsap.set(words, { yPercent: 115, opacity: 0 });
      heading.classList.add('js-split-ready');
      gsap.to(words, {
        yPercent: 0,
        opacity: 1,
        duration: 0.85,
        ease: 'power4.out',
        stagger: 0.045,
        delay: parseFloat(heading.dataset.splitDelay || 0),
        scrollTrigger: {
          trigger: heading,
          start: 'top 88%',
          once: true
        }
      });
    });

    /* ---- Hero depth: content and photo drift at different speeds, and
       the whole hero softens as the next section rises over it, so the
       boundary reads as a continuous transition rather than a hard cut. ---- */
    var heroContent = document.querySelector('.hero__content');
    var heroVisual = document.querySelector('.hero__visual');
    var heroWave = document.querySelector('.hero__wave');
    if (heroContent && heroVisual) {
      gsap.to(heroContent, {
        yPercent: 14,
        ease: 'none',
        scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 0.6 }
      });
      gsap.to(heroVisual, {
        yPercent: -8,
        scale: 1.04,
        ease: 'none',
        scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 0.6 }
      });
      if (heroWave) {
        gsap.to(heroWave, {
          yPercent: 30,
          ease: 'none',
          scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 0.6 }
        });
      }
    }

    /* ---- "A Space to Be" decorative graphic: soft parallax + scale-in ---- */
    var chaosGraphic = document.querySelector('.space-block__graphic');
    if (chaosGraphic) {
      gsap.fromTo(chaosGraphic,
        { scale: 0.88, opacity: 0.6 },
        {
          scale: 1, opacity: 1, ease: 'none',
          scrollTrigger: { trigger: chaosGraphic, start: 'top 90%', end: 'top 40%', scrub: 0.6 }
        }
      );
    }

    /* ---- Privacy icons: the parent card is a single .reveal block (no
       per-item stagger of its own), so a light per-icon pop adds hierarchy
       without doubling up on motion already handled by .reveal-stagger
       elsewhere (feature/team/step cards animate as a group already). ---- */
    gsap.utils.toArray('.privacy-item__icon').forEach(function (icon) {
      gsap.fromTo(icon,
        { y: 16, opacity: 0.4 },
        {
          y: 0, opacity: 1, ease: 'power2.out', duration: 0.6,
          scrollTrigger: { trigger: icon, start: 'top 92%', once: true }
        }
      );
    });

    /* ---- Per-card scroll-scrubbed settle (opt-in via .card-scroll-fx) ----
       Unlike .reveal-stagger (a one-time fade+rise on scroll-in), this is
       continuously scrubbed to scroll position: each card rotates in from a
       slight tilt (alternating left/right down the grid) and scales up to
       rest, like a deck settling into place. Sets its own start state via
       GSAP at runtime, so a card is simply visible at rest with no motion
       if GSAP never loads — no CSS-side hidden state to fall back from. */
    gsap.utils.toArray('.card-scroll-fx').forEach(function (card, i) {
      var dir = i % 2 === 0 ? -1 : 1;
      gsap.fromTo(card,
        { autoAlpha: 0, rotation: dir * 5, y: 50, scale: 0.92 },
        {
          autoAlpha: 1, rotation: 0, y: 0, scale: 1, ease: 'none',
          scrollTrigger: { trigger: card, start: 'top 95%', end: 'top 60%', scrub: 0.4 }
        }
      );
    });

    /* ---- Opt-in photo depth (.js-parallax-photo): the WRAPPER drifts
       vertically as its section crosses the viewport, while the CSS hover
       zoom lives on the <img> inside it. Deliberately two different
       elements — GSAP sets an inline transform every scroll tick, which
       would permanently block a CSS :hover rule on the same element
       (inline style always wins over a stylesheet, hover or not). Keeping
       them on separate elements lets both coexist. ---- */
    gsap.utils.toArray('.js-parallax-photo').forEach(function (wrap) {
      gsap.fromTo(wrap,
        { yPercent: -4 },
        {
          yPercent: 4, ease: 'none',
          scrollTrigger: { trigger: wrap, start: 'top bottom', end: 'bottom top', scrub: 0.6 }
        }
      );
    });

    /* ---- CTA card: scroll-scrubbed scale/opacity entrance (opt-in via
       .js-cta-scale). Replaces the plain .reveal fade for a more dramatic
       "arrival" on the page's closing moment. No CSS hidden state — if
       GSAP never loads the card is simply visible at rest. ---- */
    gsap.utils.toArray('.js-cta-scale').forEach(function (card) {
      gsap.fromTo(card,
        { autoAlpha: 0, scale: 0.9, y: 40 },
        {
          autoAlpha: 1, scale: 1, y: 0, ease: 'power2.out',
          scrollTrigger: { trigger: card, start: 'top 90%', end: 'top 55%', scrub: 0.5 }
        }
      );
    });

    ScrollTrigger.refresh();
  } else {
    revealFallback();
    document.querySelectorAll('.js-split').forEach(function (h) { h.classList.add('js-split-ready'); });
  }

  /* ---- Magnetic button (opt-in via .btn-magnetic): nudges toward the
     cursor while hovered and springs back on leave. Desktop fine-pointer
     only, same guard as card tilt. ---- */
  if (hasGsap && !reduceMotion && window.matchMedia('(pointer: fine)').matches) {
    document.querySelectorAll('.btn-magnetic').forEach(function (btn) {
      var moveX = gsap.quickTo(btn, 'x', { duration: 0.4, ease: 'power3.out' });
      var moveY = gsap.quickTo(btn, 'y', { duration: 0.4, ease: 'power3.out' });
      btn.addEventListener('mousemove', function (e) {
        var r = btn.getBoundingClientRect();
        moveX((e.clientX - (r.left + r.width / 2)) * 0.3);
        moveY((e.clientY - (r.top + r.height / 2)) * 0.3);
      });
      btn.addEventListener('mouseleave', function () { moveX(0); moveY(0); });
    });
  }

  /* ---- Card tilt: subtle, cursor-linked depth on desktop pointers only ---- */
  if (hasGsap && !reduceMotion && window.matchMedia('(pointer: fine)').matches) {
    document.querySelectorAll('.service-card, .team-card, .step, .info-card').forEach(function (card) {
      card.classList.add('tilt-enhanced');
      var rotX = gsap.quickTo(card, 'rotationX', { duration: 0.5, ease: 'power3.out' });
      var rotY = gsap.quickTo(card, 'rotationY', { duration: 0.5, ease: 'power3.out' });
      var liftY = gsap.quickTo(card, 'y', { duration: 0.5, ease: 'power3.out' });
      card.addEventListener('mousemove', function (e) {
        var r = card.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5;
        var py = (e.clientY - r.top) / r.height - 0.5;
        rotY(px * 6);
        rotX(py * -6);
        liftY(-4);
      });
      card.addEventListener('mouseleave', function () {
        rotY(0); rotX(0); liftY(0);
      });
    });
  }

  /* ---- Testimonial mobile carousel dots ---- */
  var track = document.getElementById('testiTrack');
  var dotsWrap = document.getElementById('testiDots');
  if (track && dotsWrap) {
    var cards = Array.prototype.slice.call(track.children);
    cards.forEach(function (card, i) {
      var dot = document.createElement('button');
      dot.type = 'button';
      dot.setAttribute('aria-label', 'Go to testimonial ' + (i + 1));
      dot.setAttribute('aria-current', i === 0 ? 'true' : 'false');
      dot.addEventListener('click', function () {
        track.scrollTo({ left: card.offsetLeft - track.offsetLeft, behavior: 'smooth' });
      });
      dotsWrap.appendChild(dot);
    });
    var dots = Array.prototype.slice.call(dotsWrap.children);
    var scrollTimeout;
    track.addEventListener('scroll', function () {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(function () {
        var trackLeft = track.scrollLeft;
        var closest = 0;
        var closestDist = Infinity;
        cards.forEach(function (card, i) {
          var dist = Math.abs(card.offsetLeft - track.offsetLeft - trackLeft);
          if (dist < closestDist) { closestDist = dist; closest = i; }
        });
        dots.forEach(function (d, i) { d.setAttribute('aria-current', i === closest ? 'true' : 'false'); });
      }, 100);
    }, { passive: true });
  }

  /* ---- Contact form (opt-in via .js-contact-form) ----
     No backend exists yet — this validates client-side (native HTML5
     constraints) and swaps in a success state on submit, rather than
     silently doing nothing or pretending to POST somewhere. Replace the
     body of the submit handler with a real fetch()/endpoint call once a
     form-handling service or backend is wired up. */
  var contactForm = document.querySelector('.js-contact-form');
  if (contactForm) {
    var formCard = contactForm.closest('.form-card');
    var successEl = formCard ? formCard.querySelector('.form-success') : null;
    contactForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!contactForm.checkValidity()) {
        contactForm.reportValidity();
        return;
      }
      if (successEl) {
        if (hasGsap && !reduceMotion) {
          gsap.to(contactForm, {
            opacity: 0, y: -12, duration: 0.35, ease: 'power2.in',
            onComplete: function () {
              contactForm.style.display = 'none';
              successEl.classList.add('is-active');
              gsap.fromTo(successEl, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' });
            }
          });
        } else {
          contactForm.style.display = 'none';
          successEl.classList.add('is-active');
        }
      }
      contactForm.reset();
    });
  }

  /* ---- Accordion (opt-in via .js-accordion) ----
     Base behavior (instant open/close, single item per group via
     name="accordion-group" on each <details>, or independent items if no
     name is set) already works with zero JS through native <details> +
     the CSS [open] rule. This only takes over to animate the height
     smoothly and enforce "close the others" — if GSAP fails to load, the
     click falls through to the native toggle instead. */
  document.querySelectorAll('.js-accordion').forEach(function (group) {
    var items = Array.prototype.slice.call(group.querySelectorAll('.accordion-item'));
    if (!hasGsap || reduceMotion) return; /* let native <details> handle it */

    function closeItem(item) {
      var panel = item.querySelector('.accordion-panel');
      var h = panel.scrollHeight;
      gsap.fromTo(panel, { height: h }, {
        height: 0, duration: 0.35, ease: 'power2.inOut',
        onComplete: function () { item.removeAttribute('open'); panel.style.height = ''; }
      });
    }
    function openItem(item) {
      var panel = item.querySelector('.accordion-panel');
      item.setAttribute('open', '');
      var h = panel.scrollHeight;
      gsap.fromTo(panel, { height: 0 }, {
        height: h, duration: 0.4, ease: 'power2.out',
        onComplete: function () { panel.style.height = ''; }
      });
    }

    items.forEach(function (item) {
      var trigger = item.querySelector('.accordion-trigger');
      trigger.addEventListener('click', function (e) {
        e.preventDefault();
        var isOpen = item.hasAttribute('open');
        items.forEach(function (other) {
          if (other !== item && other.hasAttribute('open')) { closeItem(other); }
        });
        isOpen ? closeItem(item) : openItem(item);
      });
    });
  });
})();
