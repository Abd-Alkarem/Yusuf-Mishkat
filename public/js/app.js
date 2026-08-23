/* ===== Theme Toggle ===== */
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}
window.scrollTo(0, 0);
(function() {
  const saved = localStorage.getItem('theme');
  if (saved === 'dark') {
    document.documentElement.classList.add('dark');
  }
})();

function toggleTheme() {
  const isDark = document.documentElement.classList.toggle('dark');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

/* ===== Mobile Menu ===== */
function toggleMobileMenu() {
  const menu = document.getElementById('mobile-menu');
  if (menu) menu.classList.toggle('open');
}

/* ===== Back to Top ===== */
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('back-to-top');
  if (btn) {
    window.addEventListener('scroll', () => {
      btn.classList.toggle('is-visible', window.scrollY > 400);
    }, { passive: true });
    btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  // Reveal on scroll
  initReveals();

  // Auto-dismiss alerts after 5s
  document.querySelectorAll('.alert[data-auto-dismiss]').forEach(el => {
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 5000);
  });
  
  // Initialize audio cover if present
  initAudioCover();
  
  // Initialize scrolling marquees
  initMarquees();
});

function initReveals() {
  const reveals = document.querySelectorAll('.reveal');
  if (reveals.length && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: .12, rootMargin: '0px 0px -8% 0px' });
    reveals.forEach(el => observer.observe(el));
  } else {
    reveals.forEach(el => el.classList.add('is-visible'));
  }
}

function updateNavSlider() {
  const navLinks = document.querySelector('.nav-links');
  const slider = document.getElementById('nav-slider');
  if (!navLinks) return;
  
  if (!slider) {
    navLinks.insertAdjacentHTML('beforeend', '<div id="nav-slider" class="nav-slider"></div>');
  }
  
  const activeLink = navLinks.querySelector('.nav-link.active');
  const navSlider = document.getElementById('nav-slider');
  
  if (activeLink && navSlider) {
    const linkRect = activeLink.getBoundingClientRect();
    const navRect = navLinks.getBoundingClientRect();
    // padding inline is .625rem (10px) to .75rem (12px), we'll offset
    const offset = 10; 
    navSlider.style.width = `${linkRect.width - (offset * 2)}px`;
    
    const isRTL = document.documentElement.dir === 'rtl';
    if (isRTL) {
      navSlider.style.right = `${navRect.right - linkRect.right + offset}px`;
      navSlider.style.left = 'auto';
    } else {
      navSlider.style.left = `${linkRect.left - navRect.left + offset}px`;
      navSlider.style.right = 'auto';
    }
    navSlider.classList.add('visible');
  } else if (navSlider) {
    navSlider.classList.remove('visible');
  }
}

/* ===== Confirm Delete ===== */
function confirmDelete(msg) {
  return confirm(msg || 'هل أنت متأكد من الحذف؟');
}

/* ===== File Preview ===== */
function previewImage(input, previewId) {
  const preview = document.getElementById(previewId);
  if (!preview || !input.files || !input.files[0]) return;
  const reader = new FileReader();
  reader.onload = e => {
    preview.src = e.target.result;
    preview.style.display = 'block';
  };
  reader.readAsDataURL(input.files[0]);
}

/* ===== PJAX Navigation ===== */
document.addEventListener('click', e => {
  const a = e.target.closest('a');
  if (!a || !a.href || a.target === '_blank' || a.hasAttribute('download')) return;
  const url = new URL(a.href);
  if (url.origin !== window.location.origin) return;
  if (url.pathname.startsWith('/admin') || url.pathname.startsWith('/uploads')) return;
  if (a.getAttribute('href').startsWith('#') || (url.pathname === window.location.pathname && url.hash)) return;

  e.preventDefault();
  navigateTo(url.href);
});

window.addEventListener('popstate', () => {
  navigateTo(window.location.href, false);
});

async function navigateTo(url, push = true) {
  const main = document.getElementById('main');
  if (!main) {
    window.location = url;
    return;
  }
  
  main.style.opacity = '0.5';
  main.style.pointerEvents = 'none';

  try {
    const res = await fetch(url);
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    
    document.title = doc.title;
    const newMain = doc.getElementById('main');
    
    if (newMain) {
      // Handle Audio Player Injection
      const newPlayer = doc.getElementById('persistent-audio-player');
      const oldPlayer = document.getElementById('persistent-audio-player');
      if (newPlayer && !oldPlayer) {
        document.body.insertAdjacentHTML('afterbegin', newPlayer.outerHTML);
        document.body.style.paddingTop = '60px';
      } else if (newPlayer && oldPlayer) {
        const newAudio = newPlayer.querySelector('audio');
        const oldAudio = oldPlayer.querySelector('audio');
        if (newAudio && oldAudio && newAudio.src !== oldAudio.src) {
          oldPlayer.outerHTML = newPlayer.outerHTML;
        }
      } else if (!newPlayer && oldPlayer) {
        oldPlayer.remove();
        document.body.style.paddingTop = '0';
      }

      main.innerHTML = newMain.innerHTML;
      if (push) window.history.pushState({}, '', url);
      window.scrollTo(0, 0);
      
      // Update active nav links
      document.querySelectorAll('.nav-link').forEach(el => {
        const href = el.getAttribute('href');
        const isActive = href === '/' ? url.pathname === '/' : url.pathname.startsWith(href);
        el.classList.toggle('active', isActive);
      });
      updateNavSlider();
      
      // Re-trigger reveal animations
      initReveals();
      const reveals = document.querySelectorAll('.reveal');
      
      // Re-init vanilla tilt if exists
      if (window.VanillaTilt) {
        VanillaTilt.init(document.querySelectorAll("[data-tilt]"));
      }
      
      // Keep mobile menu closed
      const menu = document.getElementById('mobile-menu');
      if (menu) menu.classList.remove('open');
      
      // Init audio cover for PJAX loaded pages
      initAudioCover();
      initMarquees();
    } else {
      window.location = url;
    }
  } catch (err) {
    window.location = url;
  } finally {
    main.style.opacity = '1';
    main.style.pointerEvents = 'all';
  }
}

/* ===== Audio Cover Interaction ===== */
let autoRotateRAF = null;
function initAudioCover() {
  if (autoRotateRAF) cancelAnimationFrame(autoRotateRAF);
  
  const cover = document.querySelector('.audio-cover');
  const grooves = document.querySelector('.audio-cover-grooves');
  const audio = document.querySelector('audio');
  
  if (cover && grooves) {
    let isDragging = false;
    let startAngle = 0;
    let currentRotation = 0;
    let startRotation = 0;
    
    function getAngle(x, y) {
      const rect = cover.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      return Math.atan2(y - centerY, x - centerX) * 180 / Math.PI;
    }
    
    function startDrag(e) {
      if (e.target.closest('button') || e.target.closest('a') || e.target.closest('audio')) return;
      isDragging = true;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      startAngle = getAngle(clientX, clientY);
      startRotation = currentRotation;
    }
    
    function onDrag(e) {
      if (!isDragging) return;
      e.preventDefault();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const angle = getAngle(clientX, clientY);
      
      let delta = angle - startAngle;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      
      currentRotation = startRotation + delta;
      grooves.style.transform = 'rotate(' + currentRotation + 'deg)';
      
      if (audio) {
        let newTime = audio.currentTime + (delta / 360) * 15; // 15 seconds per rotation
        if (newTime < 0) newTime = 0;
        if (newTime > audio.duration) newTime = audio.duration;
        audio.currentTime = newTime;
      }
      
      startAngle = angle;
      startRotation = currentRotation;
    }
    
    function stopDrag() { isDragging = false; }
    
    cover.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', onDrag, {passive: false});
    document.addEventListener('mouseup', stopDrag);
    
    cover.addEventListener('touchstart', startDrag, {passive: true});
    document.addEventListener('touchmove', onDrag, {passive: false});
    document.addEventListener('touchend', stopDrag);
    
    let lastTime = 0;
    function autoRotate(time) {
      if (!isDragging) {
        if (lastTime > 0) {
          const delta = (time - lastTime) / 1000;
          currentRotation += delta * 18; // 20 seconds per auto rotation
          grooves.style.transform = 'rotate(' + currentRotation + 'deg)';
        }
      }
      lastTime = time;
      autoRotateRAF = requestAnimationFrame(autoRotate);
    }
    autoRotateRAF = requestAnimationFrame(autoRotate);
  }
}

/* ===== Scrolling Marquee ===== */
let marqueeRAF = null;
function initMarquees() {
  if (marqueeRAF) cancelAnimationFrame(marqueeRAF);
  
  const marquees = document.querySelectorAll('.js-marquee');
  let activeMarquees = [];
  
  marquees.forEach(wrap => {
    // Check direction
    const isRtl = wrap.getAttribute('dir') !== 'ltr' && document.documentElement.dir === 'rtl';
    const speed = 0.8; // Positive speed moves viewport right -> content slides left
    let isDown = false;
    let startX;
    let scrollLeftStart;

    // We assume there are multiple .js-marquee-content children for seamless bidirectional loop
    const contentNodes = wrap.querySelectorAll('.js-marquee-content');
    if (contentNodes.length < 3) return;
    
    // First node width represents one full set
    let contentWidth = contentNodes[0].offsetWidth;

    // Recalculate width on resize
    const resizeObserver = new ResizeObserver(() => {
      contentWidth = contentNodes[0].offsetWidth;
      const maxScroll = wrap.scrollWidth - wrap.clientWidth;
      // Start in the middle
      wrap.scrollLeft = isRtl ? -(maxScroll / 2) : (maxScroll / 2);
    });
    resizeObserver.observe(contentNodes[0]);

    wrap.addEventListener('mousedown', e => {
      isDown = true;
      startX = e.pageX - wrap.offsetLeft;
      scrollLeftStart = wrap.scrollLeft;
    });
    wrap.addEventListener('mouseleave', () => isDown = false);
    wrap.addEventListener('mouseup', () => isDown = false);
    wrap.addEventListener('mousemove', e => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - wrap.offsetLeft;
      const walk = (x - startX) * 1.5;
      wrap.scrollLeft = scrollLeftStart - walk;
    });
    
    wrap.addEventListener('touchstart', () => isDown = true, {passive: true});
    wrap.addEventListener('touchend', () => isDown = false, {passive: true});

    // Handle manual scroll wrapping (seamless infinite scroll in both directions)
    wrap.addEventListener('scroll', () => {
      const maxScroll = wrap.scrollWidth - wrap.clientWidth;
      if (maxScroll <= 0) return;
      
      const jump = contentWidth * Math.max(1, Math.floor((maxScroll / 3) / contentWidth));

      if (!isRtl) {
        if (wrap.scrollLeft <= contentWidth) {
          if (m.exactScroll) m.exactScroll += jump;
          wrap.scrollLeft += jump;
        } else if (wrap.scrollLeft >= maxScroll - contentWidth) {
          if (m.exactScroll) m.exactScroll -= jump;
          wrap.scrollLeft -= jump;
        }
      } else {
        if (wrap.scrollLeft >= -contentWidth) {
          if (m.exactScroll) m.exactScroll -= jump;
          wrap.scrollLeft -= jump;
        } else if (wrap.scrollLeft <= -(maxScroll - contentWidth)) {
          if (m.exactScroll) m.exactScroll += jump;
          wrap.scrollLeft += jump;
        }
      }
    }, {passive: true});
    
    const m = { wrap, speed, isDown: () => isDown, getContentWidth: () => contentWidth, isRtl, exactScroll: null };
    activeMarquees.push(m);
  });
  
  function step() {
    activeMarquees.forEach(m => {
      if (!m.isDown() && m.getContentWidth() > 0) {
        if (m.exactScroll === null) m.exactScroll = m.wrap.scrollLeft;
        
        // Sync if user scrolled manually
        if (Math.abs(m.wrap.scrollLeft - m.exactScroll) > 2) {
          m.exactScroll = m.wrap.scrollLeft;
        }
        
        m.exactScroll += m.speed;
        m.wrap.scrollLeft = m.exactScroll;
      }
    });
    marqueeRAF = requestAnimationFrame(step);
  }
  
  if (activeMarquees.length > 0) {
    marqueeRAF = requestAnimationFrame(step);
  }
}

/* ===== Font Size Zoom ===== */
window.changeFontSize = function(delta) {
  const body = document.getElementById('article-body');
  if (!body) return;
  
  if (delta === 0) {
    body.style.zoom = '1';
    return;
  }
  
  let currentZoom = parseFloat(body.style.zoom || 1);
  body.style.zoom = Math.max(0.5, currentZoom + (delta > 0 ? 0.1 : -0.1));
};
