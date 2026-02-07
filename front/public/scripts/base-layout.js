const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
const navLinks = document.querySelector('.nav-links');

if (mobileMenuBtn && navLinks) {
  mobileMenuBtn.addEventListener('click', () => {
    const isOpen = navLinks.classList.toggle('nav-links-open');
    mobileMenuBtn.setAttribute('aria-expanded', isOpen.toString());
  });

  // Close menu when clicking outside
  document.addEventListener('click', (e) => {
    if (!navLinks.contains(e.target) && !mobileMenuBtn.contains(e.target)) {
      navLinks.classList.remove('nav-links-open');
      mobileMenuBtn.setAttribute('aria-expanded', 'false');
    }
  });

  // Close menu when clicking a link
  navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      navLinks.classList.remove('nav-links-open');
      mobileMenuBtn.setAttribute('aria-expanded', 'false');
    });
  });

  // Close menu on escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      navLinks.classList.remove('nav-links-open');
      mobileMenuBtn.setAttribute('aria-expanded', 'false');
    }
  });
}
