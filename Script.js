// Interactions légères pour la landing page de Théo Bettollo
(function () {
  const nav = document.querySelector('.nav');
  const toggleButton = document.querySelector('.nav__toggle');
  const navLinks = document.querySelectorAll('.nav__links a');

  if (nav && toggleButton) {
    toggleButton.addEventListener('click', () => {
      const isExpanded = toggleButton.getAttribute('aria-expanded') === 'true';
      toggleButton.setAttribute('aria-expanded', String(!isExpanded));
      nav.classList.toggle('nav--open', !isExpanded);
    });

    navLinks.forEach((link) => {
      link.addEventListener('click', () => {
        toggleButton.setAttribute('aria-expanded', 'false');
        nav.classList.remove('nav--open');
      });
    });
  }

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!prefersReducedMotion) {
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
      anchor.addEventListener('click', (event) => {
        const targetId = anchor.getAttribute('href');
        if (targetId.length > 1) {
          const target = document.querySelector(targetId);
          if (target) {
            event.preventDefault();
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }
      });
    });
  }
})();
