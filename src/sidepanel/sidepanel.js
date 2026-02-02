// Side Panel JavaScript

document.addEventListener('DOMContentLoaded', () => {
  const enabledToggle = document.getElementById('enabledToggle');
  const toggleLabel = document.getElementById('toggleLabel');
  const jobsList = document.getElementById('jobsList');
  const emptyState = document.getElementById('emptyState');
  const jobCount = document.getElementById('jobCount');

  // Load initial state
  loadEnabledState();
  loadHiddenJobs();

  // Poll for updates from content script
  setInterval(loadHiddenJobs, 2000);

  // Toggle handler
  enabledToggle.addEventListener('change', () => {
    const enabled = enabledToggle.checked;
    chrome.storage.sync.set({ enabled }, () => {
      updateToggleLabel(enabled);
    });
  });

  // Load enabled state from storage
  function loadEnabledState() {
    chrome.storage.sync.get(['enabled'], (result) => {
      const enabled = result.enabled !== false;
      enabledToggle.checked = enabled;
      updateToggleLabel(enabled);
    });
  }

  // Update toggle label
  function updateToggleLabel(enabled) {
    toggleLabel.textContent = enabled ? 'Enabled' : 'Disabled';
    toggleLabel.classList.toggle('toggle__label--enabled', enabled);
  }

  // Load hidden jobs from the active LinkedIn tab
  async function loadHiddenJobs() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const activeTab = tabs[0];

      if (!activeTab || !activeTab.url || !activeTab.url.includes('linkedin.com')) {
        renderJobs([]);
        return;
      }

      // Send message to content script to get hidden jobs
      chrome.tabs.sendMessage(activeTab.id, { type: 'getHiddenJobs' }, (response) => {
        if (chrome.runtime.lastError) {
          // Content script not ready or not injected
          renderJobs([]);
          return;
        }

        if (response && response.jobs) {
          renderJobs(response.jobs);
        } else {
          renderJobs([]);
        }
      });
    } catch (err) {
      renderJobs([]);
    }
  }

  // Render jobs list
  function renderJobs(jobs) {
    jobCount.textContent = `(${jobs.length})`;

    if (jobs.length === 0) {
      jobsList.innerHTML = '';
      jobsList.style.display = 'none';
      emptyState.style.display = 'flex';
    } else {
      emptyState.style.display = 'none';
      jobsList.style.display = 'flex';
      jobsList.innerHTML = jobs.map(job => renderJobCard(job)).join('');
    }
  }

  // Render a single job card
  function renderJobCard(job) {
    const title = escapeHtml(job.title);
    const company = escapeHtml(job.company);

    if (job.url) {
      return `
        <a href="${escapeHtml(job.url)}" target="_blank" class="job-card">
          <div class="job-card__title">${title}</div>
          <div class="job-card__company">${company}</div>
        </a>
      `;
    }

    return `
      <div class="job-card">
        <div class="job-card__title">${title}</div>
        <div class="job-card__company">${company}</div>
      </div>
    `;
  }

  // Escape HTML to prevent XSS
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
});
