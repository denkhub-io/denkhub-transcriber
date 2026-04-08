// Sidebar navigation — switches between views
document.addEventListener('DOMContentLoaded', () => {
  const sidebarItems = document.querySelectorAll('.sidebar-item');
  const views = document.querySelectorAll('.view');

  sidebarItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetView = item.dataset.view + 'View';

      // Update sidebar active state
      sidebarItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      // Show target view, hide others
      views.forEach(v => {
        v.style.display = v.id === targetView ? '' : 'none';
      });

      // Clicking "Trascrivi" always resets to a fresh upload state
      if (item.dataset.view === 'transcribe') {
        window.dispatchEvent(new CustomEvent('reset-transcribe'));
      }
    });
  });
});

// Navigate to a specific view programmatically
function navigateToView(viewName) {
  const item = document.querySelector(`.sidebar-item[data-view="${viewName}"]`);
  if (item) item.click();
}
