const slides = [...document.querySelectorAll('.slide')];
const dots = document.querySelector('#slide-dots');
const menu = document.querySelector('#slide-menu');
const overview = document.querySelector('#overview-toggle');
const previous = document.querySelector('#previous-slide');
const next = document.querySelector('#next-slide');
let current = 0;

slides.forEach((slide, index) => {
  const dot = document.createElement('button');
  dot.setAttribute('aria-label', `Slide ${index + 1}: ${slide.dataset.title}`);
  dot.addEventListener('click', () => showSlide(index));
  dots.append(dot);
  const item = document.createElement('button');
  const number = document.createElement('span');
  number.textContent = String(index + 1).padStart(2, '0');
  item.append(number, document.createTextNode(slide.dataset.title));
  item.addEventListener('click', () => { showSlide(index); closeMenu(); overview.focus(); });
  menu.append(item);
});

function showSlide(index, updateHash = true) {
  current = Math.max(0, Math.min(slides.length - 1, index));
  slides.forEach((slide, i) => { slide.hidden = i !== current; slide.classList.toggle('is-active', i === current); });
  [...dots.children, ...menu.children].forEach((button, i) => button.setAttribute('aria-current', String(i % slides.length === current)));
  document.querySelector('#slide-counter').textContent = `${String(current + 1).padStart(2, '0')} / ${String(slides.length).padStart(2, '0')}`;
  previous.disabled = current === 0;
  next.disabled = current === slides.length - 1;
  if (updateHash) history.replaceState(null, '', `#slide-${current + 1}`);
  document.querySelector('#announcement').textContent = `Slide ${current + 1} of ${slides.length}: ${slides[current].dataset.title}`;
  if (window.matchMedia('(max-width: 700px)').matches) window.scrollTo({ top: 0, behavior: 'instant' });
}

function readHash() {
  const match = location.hash.match(/^#slide-(\d+)$/);
  showSlide(match ? Number(match[1]) - 1 : 0, false);
}

function sizeDeck() {
  if (window.innerWidth <= 700) return;
  const availableWidth = window.innerWidth - 68;
  const availableHeight = window.innerHeight - 196;
  const scale = Math.min(availableWidth / 1280, Math.max(260, availableHeight) / 720);
  document.documentElement.style.setProperty('--deck-scale', scale);
}

function closeMenu() { menu.hidden = true; overview.setAttribute('aria-expanded', 'false'); }
overview.addEventListener('click', () => {
  menu.hidden = !menu.hidden;
  overview.setAttribute('aria-expanded', String(!menu.hidden));
  if (!menu.hidden) menu.children[current].focus();
});
document.addEventListener('click', event => { if (!menu.contains(event.target) && !overview.contains(event.target)) closeMenu(); });
previous.addEventListener('click', () => showSlide(current - 1));
next.addEventListener('click', () => showSlide(current + 1));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !menu.hidden) { closeMenu(); overview.focus(); return; }
  if (event.altKey || event.ctrlKey || event.metaKey || /^(SELECT|INPUT|TEXTAREA)$/.test(event.target.tagName) || !menu.hidden) return;
  if (['ArrowRight', 'PageDown'].includes(event.key) || (event.code === 'Space' && event.target === document.body)) { event.preventDefault(); showSlide(current + 1); }
  if (['ArrowLeft', 'PageUp'].includes(event.key)) { event.preventDefault(); showSlide(current - 1); }
  if (event.key === 'Home') { event.preventDefault(); showSlide(0); }
  if (event.key === 'End') { event.preventDefault(); showSlide(slides.length - 1); }
});

const fullscreenButton = document.querySelector('#fullscreen-toggle');
if (!document.fullscreenEnabled) fullscreenButton.hidden = true;
fullscreenButton.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    document.querySelector('#announcement').textContent = 'Fullscreen is unavailable in this browser. The presentation remains available in this window.';
  }
});
document.addEventListener('fullscreenchange', () => {
  fullscreenButton.firstChild.textContent = document.fullscreenElement ? 'Exit presentation ' : 'Present ';
  sizeDeck();
});
window.addEventListener('resize', sizeDeck);
window.addEventListener('hashchange', readHash);

const entries = [
  { family: 'shuttle', familyName: 'Low-speed shuttle', odd: 'Paved campus, daylight, dry, ≤15 km/h', platform: 'Shuttle', sensor: 'multi', sensors: 'LiDAR, cameras, GNSS/IMU', software: 'Rule-based Planning' },
  { family: 'shuttle', familyName: 'Low-speed shuttle', odd: 'Paved campus, daylight, dry, ≤15 km/h', platform: 'Shuttle', sensor: 'multi', sensors: 'LiDAR, cameras, GNSS/IMU', software: 'Diffusion Planning' },
  { family: 'shuttle', familyName: 'Low-speed shuttle', odd: 'Campus target; model requirements to confirm', platform: 'Shuttle', sensor: 'unspecified', sensors: 'Sensor requirements to confirm', software: 'Meteor-based' },
  { family: 'highway', familyName: 'Highway assistance', odd: 'Highway target; ODD to specify', platform: 'Passenger vehicle', sensor: 'camera', sensors: 'Camera-based; inputs to specify', software: 'Vision Pilot' },
  { family: 'robotaxi', familyName: 'Urban robotaxi', odd: 'Urban target; ODD to specify', platform: 'Passenger vehicle', sensor: 'multi', sensors: 'Camera and LiDAR; details to specify', software: 'Fusion Pilot' }
];
const familyFilter = document.querySelector('#family-filter');
const sensorFilter = document.querySelector('#sensor-filter');
function renderCatalog(all = false) {
  const visible = entries.filter(entry => all || ((familyFilter.value === 'all' || familyFilter.value === entry.family) && (sensorFilter.value === 'all' || sensorFilter.value === entry.sensor)));
  const body = document.querySelector('#catalog-rows');
  body.replaceChildren();
  visible.forEach(entry => {
    const row = document.createElement('tr');
    [entry.familyName, entry.odd, entry.platform, entry.sensors, entry.software, 'Proposed'].forEach(value => { const cell = document.createElement('td'); cell.textContent = value; row.append(cell); });
    body.append(row);
  });
  document.querySelector('#catalog-count').textContent = `${visible.length} of ${entries.length} examples`;
  document.querySelector('#catalog-empty').hidden = visible.length !== 0;
}
familyFilter.addEventListener('change', () => renderCatalog());
sensorFilter.addEventListener('change', () => renderCatalog());
document.querySelector('#reset-filters').addEventListener('click', () => { familyFilter.value = 'all'; sensorFilter.value = 'all'; renderCatalog(); });
window.addEventListener('beforeprint', () => renderCatalog(true));
window.addEventListener('afterprint', () => renderCatalog());
window.prepareForExport = () => { renderCatalog(true); return slides.length; };
renderCatalog();
readHash();
sizeDeck();
