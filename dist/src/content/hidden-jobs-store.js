// Hide Promoted Jobs on LinkedIn - Hidden Jobs Store

(function() {
  'use strict';

  // Create global store
  window.hiddenJobsStore = {
    jobs: [],
    listeners: [],

    // Add a job to the store (avoids duplicates by URL)
    add(job) {
      if (!job || !job.title) return;

      // Check for duplicate by URL or title+company combo
      const isDuplicate = this.jobs.some(j =>
        (job.url && j.url === job.url) ||
        (j.title === job.title && j.company === job.company)
      );

      if (!isDuplicate) {
        this.jobs.push({
          title: job.title,
          company: job.company || 'Unknown Company',
          url: job.url || null,
          timestamp: Date.now()
        });
        this.notify();
      }
    },

    // Get all hidden jobs
    getAll() {
      return [...this.jobs];
    },

    // Get count of hidden jobs
    getCount() {
      return this.jobs.length;
    },

    // Clear all jobs (used when navigating away or refreshing)
    clear() {
      this.jobs = [];
      this.notify();
    },

    // Subscribe to changes
    subscribe(callback) {
      if (typeof callback === 'function') {
        this.listeners.push(callback);
      }
    },

    // Unsubscribe from changes
    unsubscribe(callback) {
      this.listeners = this.listeners.filter(fn => fn !== callback);
    },

    // Notify all listeners
    notify() {
      this.listeners.forEach(fn => {
        try {
          fn(this.jobs);
        } catch (e) {
          console.warn('[Hide Promoted Jobs] Store listener error:', e);
        }
      });
    }
  };
})();
