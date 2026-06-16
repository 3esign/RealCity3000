// Tooltip manager for RealCity3000

export function initTooltips() {
  let tooltip = document.getElementById('tooltip-bubble');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'tooltip-bubble';
    tooltip.className = 'tooltip-bubble';
    tooltip.style.display = 'none';
    document.body.appendChild(tooltip);
  }

  document.addEventListener('mouseover', (e) => {
    const target = e.target.closest('[data-tooltip]');
    if (target) {
      const text = target.getAttribute('data-tooltip');
      if (text) {
        tooltip.innerHTML = text;
        tooltip.style.display = 'block';
        // Force reflow
        tooltip.offsetHeight;
        tooltip.classList.add('visible');
      }
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (tooltip.style.display === 'none') return;

    const tooltipWidth = tooltip.offsetWidth;
    const tooltipHeight = tooltip.offsetHeight;
    
    let x = e.clientX + 15;
    let y = e.clientY + 15;

    // Check bounds
    if (x + tooltipWidth > window.innerWidth - 10) {
      x = e.clientX - tooltipWidth - 15;
    }
    if (y + tooltipHeight > window.innerHeight - 10) {
      y = e.clientY - tooltipHeight - 15;
    }

    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
  });

  document.addEventListener('mouseout', (e) => {
    const target = e.target.closest('[data-tooltip]');
    if (target) {
      const related = e.relatedTarget;
      if (!related || !target.contains(related)) {
        tooltip.classList.remove('visible');
        setTimeout(() => {
          if (!tooltip.classList.contains('visible')) {
            tooltip.style.display = 'none';
          }
        }, 150);
      }
    }
  });
}
