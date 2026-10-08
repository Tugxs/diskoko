const stage = document.querySelector('#previewStage');
if (stage) {
  let frame;
  const particles = Array.from({length: 34}, (_, index) => {
    const star = document.createElement('span');
    star.className = 'field-particle';
    star.style.left = `${(index * 47 + 13) % 100}%`;
    star.style.top = `${(index * 29 + 17) % 100}%`;
    star.style.setProperty('--star-size', `${1 + index % 3}px`);
    star.style.setProperty('--twinkle-delay', `${(index % 7) * -0.6}s`);
    star.dataset.starX = String(((index * 47 + 13) % 100) / 100);
    star.dataset.starY = String(((index * 29 + 17) % 100) / 100);
    stage.appendChild(star);
    return star;
  });
  const moveField = (event) => {
    const rect = stage.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const nx = x / rect.width;
    const ny = y / rect.height;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      stage.style.setProperty('--field-x', `${x}px`);
      stage.style.setProperty('--field-y', `${y}px`);
      particles.forEach((star) => {
        const distance = Math.hypot(Number(star.dataset.starX) - nx, Number(star.dataset.starY) - ny);
        star.style.opacity = distance < 0.13 ? '0' : '.55';
      });
    });
  };
  const resetField = () => {
    particles.forEach((star) => { star.style.opacity = '.38'; });
  };
  stage.addEventListener('pointermove', moveField, {passive:true});
  stage.addEventListener('pointerleave', resetField);
  resetField();
}

// Shared brand background response; one scheduled paint per pointer frame.
if (document.body.classList.contains('dk-dashboard-theme')) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let glowFrame;
  const resetGlow = () => {
    document.documentElement.style.removeProperty('--dk-pointer-x');
    document.documentElement.style.removeProperty('--dk-pointer-y');
    document.documentElement.style.removeProperty('--dk-tilt-x');
    document.documentElement.style.removeProperty('--dk-tilt-y');
  };
  document.addEventListener('pointermove', event => {
    if (reduced.matches || event.pointerType === 'touch') return;
    cancelAnimationFrame(glowFrame);
    glowFrame = requestAnimationFrame(() => {
      document.documentElement.style.setProperty('--dk-tilt-x', ((event.clientX / innerWidth - .5) * 8) + 'deg');
      document.documentElement.style.setProperty('--dk-tilt-y', ((.5 - event.clientY / innerHeight) * 6) + 'deg');
      document.documentElement.style.setProperty('--dk-pointer-x', (event.clientX / innerWidth * 100) + '%');
      document.documentElement.style.setProperty('--dk-pointer-y', (event.clientY / innerHeight * 100) + '%');
    });
  }, {passive:true});
  document.documentElement.addEventListener('pointerleave', resetGlow);
  window.addEventListener('blur', resetGlow);
  reduced.addEventListener('change', resetGlow);
}
