// Hide Promoted Jobs on LinkedIn - Content Script

(function() {
  'use strict';

  // Text patterns to detect promotional content (English only)
  // Only include patterns that appear INSIDE individual cards, not section headers
  const PROMOTIONAL_PATTERNS = [
    'Promoted',
    'Sponsored'
  ];

  // Extract job information from a card element for the hidden jobs panel
  function extractJobInfo(cardElement) {
    if (!cardElement) return null;

    // Try multiple selectors for job title (LinkedIn uses different structures)
    const titleSelectors = [
      '.job-card-list__title',
      '.artdeco-entity-lockup__title',
      '[class*="job-card-container__link"]',
      'a[href*="/jobs/view/"] strong',
      'a[href*="/jobs/view/"]',
      '.base-search-card__title',
      '[data-view-name="job-card"] a'
    ];

    let title = null;
    for (const selector of titleSelectors) {
      const el = cardElement.querySelector(selector);
      if (el) {
        title = el.textContent?.trim();
        if (title && title.length > 0 && title.length < 200) break;
      }
    }

    // Try multiple selectors for company name
    const companySelectors = [
      '.job-card-container__primary-description',
      '.artdeco-entity-lockup__subtitle',
      '.base-search-card__subtitle',
      '[class*="company-name"]',
      '.job-card-container__company-name'
    ];

    let company = null;
    for (const selector of companySelectors) {
      const el = cardElement.querySelector(selector);
      if (el) {
        company = el.textContent?.trim();
        if (company && company.length > 0 && company.length < 100) break;
      }
    }

    // Get job URL
    const linkEl = cardElement.querySelector('a[href*="/jobs/view/"]');
    const url = linkEl?.href || null;

    // Only return if we found at least a title
    if (title) {
      return {
        title: title,
        company: company || 'Unknown Company',
        url: url
      };
    }

    return null;
  }

  // CSS class prefix to avoid conflicts
  const CLASS_PREFIX = 'lph';
  const MARKER_CLASS = `${CLASS_PREFIX}-promotional-content`;
  const HIDDEN_CLASS = `${CLASS_PREFIX}-hidden`;

  // State
  let enabled = true;
  let observer = null;
  let urlObserver = null;
  let debounceTimer = null;
  let lastUrl = location.href;
  const processedElements = new WeakSet();

  // Initialize the extension
  function init() {
    // Load enabled state from storage
    chrome.storage.sync.get(['enabled'], (result) => {
      enabled = result.enabled !== false; // Default to true
      if (enabled) {
        processExistingContent();
        // Process multiple times to catch late-loading "Promoted" text
        // LinkedIn renders content progressively, so we need multiple passes
        setTimeout(() => processExistingContent(), 300);
        setTimeout(() => processExistingContent(), 700);
        setTimeout(() => processExistingContent(), 1500);
        setTimeout(() => processExistingContent(), 3000);
      }
      setupObserver();
      setupUrlObserver();
    });

    // Listen for storage changes (toggle)
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'sync' && changes.enabled !== undefined) {
        enabled = changes.enabled.newValue;
        toggleAllContent();
      }
    });

    // Listen for messages from side panel
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'getHiddenJobs') {
        const jobs = window.hiddenJobsStore ? window.hiddenJobsStore.getAll() : [];
        sendResponse({ jobs: jobs });
      }
      return true; // Keep channel open for async response
    });
  }

  // Elements that should NEVER be hidden (page-level containers)
  const PROTECTED_SELECTORS = [
    'main',
    '[role="main"]',
    '.scaffold-layout',
    '.scaffold-layout__main',
    '.scaffold-layout__content',
    '.jobs-home-container',
    '.jobs-search-results-list',
    '.feed-shared-update-v2__content'
  ];

  function isProtectedElement(element) {
    if (!element) return false;
    const tagName = element.tagName?.toLowerCase();
    if (tagName === 'main' || tagName === 'body' || tagName === 'html') return true;

    for (const selector of PROTECTED_SELECTORS) {
      try {
        if (element.matches(selector)) return true;
      } catch (e) {}
    }
    return false;
  }

  // Find the containing card/section for a promotional element
  function findContainingCard(element) {
    let current = element;
    let depth = 0;
    const maxDepth = 15;
    let foundLi = null; // Track if we pass an <li> element

    while (current && current !== document.body && depth < maxDepth) {
      // Stop if we hit a protected element
      if (isProtectedElement(current)) {
        // If we found an <li> before hitting protected element, return it
        return foundLi;
      }

      const tagName = current.tagName?.toLowerCase();
      const classList = Array.from(current.classList || []);

      // Jobs homepage - cards have data-view-name="job-card"
      if (current.getAttribute('data-view-name') === 'job-card') {
        return current;
      }

      // Job search results - <li> elements with data-occludable-job-id (PRIMARY CHECK)
      if (tagName === 'li' && current.hasAttribute('data-occludable-job-id')) {
        return current;
      }

      // Job search pages - check for data-job-id attribute or job-card-container class
      if (current.hasAttribute('data-job-id') || classList.includes('job-card-container')) {
        // Find the closest <li> ancestor with data-occludable-job-id
        let ancestor = current.parentElement;
        for (let i = 0; i < 5 && ancestor && ancestor !== document.body; i++) {
          if (isProtectedElement(ancestor)) break;
          if (ancestor.tagName?.toLowerCase() === 'li' && ancestor.hasAttribute('data-occludable-job-id')) {
            return ancestor;
          }
          if (ancestor.tagName?.toLowerCase() === 'li') {
            return ancestor;
          }
          ancestor = ancestor.parentElement;
        }
        return current;
      }

      // Track <li> elements - these are likely job list items
      if (tagName === 'li') {
        foundLi = current;
      }

      // Job list items - <li> elements that contain job cards
      if (tagName === 'li' && current.querySelector('[data-job-id], .job-card-container, [data-view-name="job-card"], [data-occludable-job-id]')) {
        return current;
      }

      // Feed posts - only if it's actually a feed post
      if (classList.some(c => c.startsWith('feed-shared-update') || c.startsWith('occludable-update'))) {
        return current;
      }

      // Sidebar items and ad banners only
      if (classList.includes('ad-banner-container')) {
        return current;
      }

      current = current.parentElement;
      depth++;
    }

    // If we found an <li> during traversal, return it (it's likely the job card container)
    return foundLi;
  }

  // Check if an element contains promotional text
  function isPromotionalElement(element) {
    if (!element || processedElements.has(element)) return false;

    // Get text content, but be careful about performance
    const text = element.textContent || '';

    // Quick check - if text is too long, it's likely not just a label
    if (text.length > 1000) return false;

    // Check for exact matches in small text elements (spans, small divs)
    if (element.tagName?.toLowerCase() === 'span') {
      const trimmedText = text.trim();
      if (PROMOTIONAL_PATTERNS.includes(trimmedText)) {
        return true;
      }
    }

    // For larger elements, check if promotional pattern is present
    return PROMOTIONAL_PATTERNS.some(pattern => text.includes(pattern));
  }

  // Process a single element and its descendants
  function processElement(element) {
    if (!element || !element.querySelectorAll) return;

    // Check all text elements for promotional text
    // LinkedIn uses different elements on different pages
    const textElements = element.querySelectorAll('span, p, div, li');
    textElements.forEach(el => {
      if (processedElements.has(el)) return;

      // Only check leaf-ish elements (not huge containers)
      const text = el.textContent?.trim();
      if (!text || text.length > 100) return;

      if (PROMOTIONAL_PATTERNS.includes(text)) {
        const card = findContainingCard(el);
        if (card && !processedElements.has(card)) {
          hideElement(card);
          processedElements.add(card);
        }
        processedElements.add(el);
      }
    });

    // Also directly check all <li> elements in job lists for "Promoted" text
    // Look for li elements with data-occludable-job-id (job search results)
    const jobListItems = element.querySelectorAll('li[data-occludable-job-id], .scaffold-layout__list li, ul li');
    jobListItems.forEach(li => {
      if (processedElements.has(li)) return;

      // Check if this li contains "Promoted" text
      const allSpans = li.querySelectorAll('span, p');
      for (const span of allSpans) {
        const text = span.textContent?.trim();
        if (text && PROMOTIONAL_PATTERNS.includes(text)) {
          // For job search results, the li with data-occludable-job-id is what we want to hide
          if (li.hasAttribute('data-occludable-job-id')) {
            hideElement(li);
            processedElements.add(li);
          } else {
            // Try to find the parent li with data-occludable-job-id
            let parent = li.closest('li[data-occludable-job-id]');
            if (parent && !processedElements.has(parent)) {
              hideElement(parent);
              processedElements.add(parent);
            } else {
              hideElement(li);
              processedElements.add(li);
            }
          }
          processedElements.add(span);
          break;
        }
      }
    });

    // Also check for specific class-based patterns
    const promotedSelectors = [
      '.premium-upsell-link',
      '.global-nav__spotlight-upsell',
      '[data-ad-banner]',
      '.ad-banner-container'
    ];

    promotedSelectors.forEach(selector => {
      try {
        const elements = element.querySelectorAll(selector);
        elements.forEach(el => {
          if (!processedElements.has(el)) {
            const card = findContainingCard(el) || el;
            hideElement(card);
            processedElements.add(card);
            processedElements.add(el);
          }
        });
      } catch (e) {
        // Selector might be invalid, ignore
      }
    });
  }

  // Hide an element with collapse animation
  function hideElement(element) {
    if (!element || element.classList.contains(MARKER_CLASS)) return;

    // Mark as promotional content
    element.classList.add(MARKER_CLASS);

    // Extract job info and add to store (for the hidden jobs panel)
    const jobInfo = extractJobInfo(element);
    if (jobInfo && window.hiddenJobsStore) {
      window.hiddenJobsStore.add(jobInfo);
    }

    // Apply hidden class if enabled
    if (enabled) {
      // Set initial max-height for animation
      const height = element.offsetHeight;
      element.style.maxHeight = height + 'px';

      // Force reflow
      element.offsetHeight;

      // Add hidden class to trigger animation
      element.classList.add(HIDDEN_CLASS);
    }
  }

  // Toggle visibility of all marked content
  function toggleAllContent() {
    const elements = document.querySelectorAll(`.${MARKER_CLASS}`);
    elements.forEach(element => {
      if (enabled) {
        // Hide with animation
        const height = element.offsetHeight || element.scrollHeight;
        element.style.maxHeight = height + 'px';
        element.offsetHeight; // Force reflow
        element.classList.add(HIDDEN_CLASS);
      } else {
        // Show by removing hidden class
        element.classList.remove(HIDDEN_CLASS);
        element.style.maxHeight = '';
      }
    });

    // If re-enabling, also process any new content that might have appeared
    if (enabled) {
      processExistingContent();
    }
  }

  // Process all existing content on the page
  function processExistingContent() {
    if (!enabled) return;
    processElement(document.body);
  }

  // Set up MutationObserver for dynamic content
  function setupObserver() {
    if (observer) {
      observer.disconnect();
    }

    observer = new MutationObserver((mutations) => {
      if (!enabled) return;

      // Debounce processing
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        mutations.forEach(mutation => {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              processElement(node);
            }
          });
        });
      }, 100);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Set up URL observer for SPA navigation
  function setupUrlObserver() {
    // Check URL periodically (handles pagination and SPA navigation)
    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        // Re-process after navigation with delay for content to load
        if (enabled) {
          // Process multiple times to catch late-loading "Promoted" text
          // Use more aggressive timing for search navigation
          setTimeout(() => processExistingContent(), 200);
          setTimeout(() => processExistingContent(), 500);
          setTimeout(() => processExistingContent(), 1000);
          setTimeout(() => processExistingContent(), 2000);
          setTimeout(() => processExistingContent(), 3000);
        }
      }
    }, 150);

    // Handle scroll events - LinkedIn lazy-loads content as user scrolls
    let scrollTimer = null;
    window.addEventListener('scroll', () => {
      if (!enabled) return;
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        processExistingContent();
      }, 200);
    }, { passive: true });

    // Also listen for popstate (back/forward navigation)
    window.addEventListener('popstate', () => {
      if (enabled) {
        setTimeout(() => processExistingContent(), 500);
      }
    });

    // Listen for clicks on pagination buttons
    document.addEventListener('click', (e) => {
      const target = e.target;
      // Check if clicked element is a pagination button or link
      if (target.closest('[aria-label*="Page"]') ||
          target.closest('.artdeco-pagination') ||
          target.closest('button[aria-label*="page"]')) {
        if (enabled) {
          // Process after pagination content loads
          setTimeout(() => processExistingContent(), 500);
          setTimeout(() => processExistingContent(), 1000);
          setTimeout(() => processExistingContent(), 2000);
        }
      }
    });
  }

  // Start the extension
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
