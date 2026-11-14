// "Some of our work" gallery.
// Every image in the /scans folder is picked up automatically at build time.
// The file name becomes the caption: "02-Mustang door panel.jpg" -> "Mustang door panel".
// A number at the start (01-, 02-, ...) only sets the order and is not shown.
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
gsap.registerPlugin(ScrollTrigger);

const files = import.meta.glob('/scans/*.{jpg,jpeg,png,webp,avif,gif,JPG,JPEG,PNG,WEBP,AVIF,GIF}', {
  eager: true, query: '?url', import: 'default',
});

const toCaption = (path) => {
  const name = decodeURIComponent(path.split('/').pop()).replace(/\.[^.]+$/, '');
  let text = name.replace(/^\d+[\s._-]*/, '').replace(/_+/g, ' ');
  // "mustang-door-panel" -> "mustang door panel", but keep dashes like "GT-R" when the name already has spaces
  if (!/\s/.test(text)) text = text.replace(/-+/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  return text ? text[0].toUpperCase() + text.slice(1) : '';
};

const items = Object.keys(files)
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
  .map((path) => ({ src: files[path], caption: toCaption(path) }));

const section = document.getElementById('work');
const grid = section?.querySelector('.work-grid');

function build() {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;

  items.forEach((item, i) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'work-card';
    card.setAttribute('aria-label', `Enlarge${item.caption ? `: ${item.caption}` : ' image'}`);
    card.innerHTML = `
      <span class="work-media">
        <img class="work-bg" src="${item.src}" alt="" aria-hidden="true" loading="lazy" decoding="async" />
        <img class="work-img" src="${item.src}" alt="${escapeAttr(item.caption)}" loading="lazy" decoding="async" />
        <span class="work-scanline" aria-hidden="true"></span>
        <span class="work-glare" aria-hidden="true"></span>
        <span class="work-corners" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
      </span>
      <span class="work-meta"><span class="work-num">${String(i + 1).padStart(2, '0')}</span><span class="work-cap"></span></span>`;
    card.querySelector('.work-cap').textContent = item.caption;
    card.addEventListener('click', () => openLightbox(i, card));

    if (fine && !reduceMotion) {
      // 3D tilt that follows the cursor, with a moving glare highlight
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        gsap.to(card, { rotateY: x * 14, rotateX: -y * 14, z: 30, duration: 0.4, ease: 'power2.out' });
        card.style.setProperty('--gx', `${(x + 0.5) * 100}%`);
        card.style.setProperty('--gy', `${(y + 0.5) * 100}%`);
      });
      card.addEventListener('pointerleave', () => gsap.to(card, { rotateY: 0, rotateX: 0, z: 0, duration: 0.7, ease: 'elastic.out(1, 0.5)' }));
    }
    grid.appendChild(card);
  });

  if (!reduceMotion) {
    // Cards fly up out of the floor in 3D as the section scrolls into view
    gsap.from(grid.children, {
      rotateX: 65, y: 120, z: -260, opacity: 0, duration: 1.1, ease: 'power3.out',
      stagger: { each: 0.08, from: 'start' },
      scrollTrigger: { trigger: grid, start: 'top 85%', once: true },
    });
    gsap.from(section.querySelectorAll('.kicker, h2, p'), {
      y: 30, opacity: 0, duration: 0.8, stagger: 0.1, ease: 'power2.out',
      scrollTrigger: { trigger: section, start: 'top 80%', once: true },
    });
  }

  setupLightbox(reduceMotion);
}

function escapeAttr(s) { return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

// Lightbox
let lb, lbImg, lbCap, lbCount, current = 0, lastFocus, reduce = false;
function setupLightbox(reduceMotion) {
  reduce = reduceMotion;
  lb = document.createElement('div');
  lb.className = 'lightbox';
  lb.setAttribute('role', 'dialog');
  lb.setAttribute('aria-modal', 'true');
  lb.setAttribute('aria-label', 'Scan viewer');
  lb.hidden = true;
  lb.innerHTML = `
    <button type="button" class="lb-close" aria-label="Close">&times;</button>
    <button type="button" class="lb-nav lb-prev" aria-label="Previous image">&#8249;</button>
    <figure class="lb-figure">
      <div class="lb-frame"><img alt="" /><span class="lb-sweep" aria-hidden="true"></span></div>
      <figcaption><span class="lb-count"></span><span class="lb-cap"></span></figcaption>
    </figure>
    <button type="button" class="lb-nav lb-next" aria-label="Next image">&#8250;</button>`;
  document.body.appendChild(lb);
  lbImg = lb.querySelector('img'); lbCap = lb.querySelector('.lb-cap'); lbCount = lb.querySelector('.lb-count');
  if (items.length < 2) lb.querySelectorAll('.lb-nav').forEach((b) => b.remove());

  lb.querySelector('.lb-close').addEventListener('click', closeLightbox);
  lb.querySelector('.lb-prev')?.addEventListener('click', () => show(current - 1, -1));
  lb.querySelector('.lb-next')?.addEventListener('click', () => show(current + 1, 1));
  lb.addEventListener('click', (e) => { if (e.target === lb || e.target.classList.contains('lb-figure')) closeLightbox(); });
  addEventListener('keydown', (e) => {
    if (lb.hidden) return;
    if (e.key === 'Escape') closeLightbox();
    else if (e.key === 'ArrowRight' && items.length > 1) show(current + 1, 1);
    else if (e.key === 'ArrowLeft' && items.length > 1) show(current - 1, -1);
    else if (e.key === 'Tab') trapFocus(e);
  });
  // Swipe on phones
  let sx = null;
  lb.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', (e) => {
    if (sx === null || items.length < 2) return;
    const dx = e.changedTouches[0].clientX - sx; sx = null;
    if (Math.abs(dx) > 50) show(current + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
  });
}

function trapFocus(e) {
  const f = [...lb.querySelectorAll('button')];
  const i = f.indexOf(document.activeElement);
  if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
  else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
}

function fill(i) {
  current = (i + items.length) % items.length;
  const it = items[current];
  lbImg.src = it.src; lbImg.alt = it.caption;
  lbCap.textContent = it.caption;
  lbCount.textContent = `${String(current + 1).padStart(2, '0')} / ${String(items.length).padStart(2, '0')}`;
}

function show(i, dir) {
  if (reduce) return fill(i);
  const frame = lb.querySelector('.lb-frame');
  gsap.timeline()
    .to(frame, { rotateY: -dir * 35, x: -dir * 80, opacity: 0, duration: 0.22, ease: 'power2.in' })
    .add(() => fill(i))
    .fromTo(frame, { rotateY: dir * 35, x: dir * 80, opacity: 0 }, { rotateY: 0, x: 0, opacity: 1, duration: 0.45, ease: 'power3.out' });
}

function openLightbox(i, card) {
  lastFocus = card;
  fill(i);
  lb.hidden = false;
  document.documentElement.classList.add('lb-open');
  lb.querySelector('.lb-close').focus();
  if (reduce) return;
  gsap.fromTo(lb, { opacity: 0 }, { opacity: 1, duration: 0.3 });
  gsap.fromTo(lb.querySelector('.lb-frame'), { rotateX: 40, scale: 0.6, z: -300, opacity: 0 }, { rotateX: 0, scale: 1, z: 0, opacity: 1, duration: 0.7, ease: 'power3.out' });
}

function closeLightbox() {
  const done = () => { lb.hidden = true; document.documentElement.classList.remove('lb-open'); lastFocus?.focus({ preventScroll: true }); };
  if (reduce) return done();
  gsap.to(lb.querySelector('.lb-frame'), { scale: 0.85, rotateX: -20, opacity: 0, duration: 0.25, ease: 'power2.in' });
  gsap.to(lb, { opacity: 0, duration: 0.3, onComplete: done });
}

if (section && grid) {
  if (!items.length) section.remove();
  else build();
}
