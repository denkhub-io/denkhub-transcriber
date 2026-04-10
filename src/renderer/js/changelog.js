// Changelog modal (first launch after update) + settings accordion
document.addEventListener('DOMContentLoaded', () => {
  const changelogs = window.CHANGELOGS || [];

  // --- Render changelog HTML for a single version entry ---
  function renderVersionContent(entry) {
    let html = '';
    for (const group of entry.changes) {
      html += `<div class="changelog-category">${group.category}</div>`;
      html += '<ul class="changelog-list">';
      for (const item of group.items) {
        html += `<li>${item}</li>`;
      }
      html += '</ul>';
    }
    return html;
  }

  // --- Modal: show on first launch after update ---
  async function checkShowModal() {
    try {
      const shouldShow = await window.api.shouldShowChangelog();
      if (!shouldShow || changelogs.length === 0) return;

      const modal = document.getElementById('changelogModal');
      const body = document.getElementById('changelogModalBody');
      const latest = changelogs[0];

      body.innerHTML = `
        <div style="margin-bottom: var(--space-sm);">
          <span class="changelog-version-badge">v${latest.version}</span>
          <span class="changelog-date">${latest.date}</span>
        </div>
        <div style="font-size: 0.9rem; font-weight: 500; margin-bottom: var(--space-sm);">${latest.title}</div>
        ${renderVersionContent(latest)}
      `;

      modal.style.display = '';

      // Dismiss handlers
      const dismiss = () => {
        modal.style.display = 'none';
        window.api.changelogSeen();
      };
      document.getElementById('changelogModalClose').addEventListener('click', dismiss);
      document.getElementById('changelogModalDismiss').addEventListener('click', dismiss);
      modal.addEventListener('click', (e) => {
        if (e.target === modal) dismiss();
      });
    } catch (err) {
      console.warn('[changelog] modal check failed:', err);
    }
  }

  // --- Accordion: populate in settings ---
  function buildAccordion() {
    const container = document.getElementById('changelogAccordion');
    if (!container || changelogs.length === 0) return;

    container.innerHTML = '';

    changelogs.forEach((entry, idx) => {
      const item = document.createElement('div');
      item.className = 'changelog-accordion-item';

      item.innerHTML = `
        <button class="changelog-accordion-header">
          <span class="changelog-version-badge">v${entry.version}</span>
          <span>${entry.title}</span>
          <span class="changelog-date">${entry.date}</span>
          <svg class="changelog-accordion-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
        <div class="changelog-accordion-body">
          ${renderVersionContent(entry)}
        </div>
      `;

      // First item open by default
      if (idx === 0) item.classList.add('open');

      item.querySelector('.changelog-accordion-header').addEventListener('click', () => {
        item.classList.toggle('open');
      });

      container.appendChild(item);
    });
  }

  // Init
  checkShowModal();
  buildAccordion();
});
