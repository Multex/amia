// Fetch config from server and initialize
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const response = await fetch('/api/config');
    const config = await response.json();
    initializeApp(config);
  } catch (error) {
    console.error('Failed to load config:', error);
    // Fallback to English defaults
    initializeApp({
      language: 'en',
      translations: {
        pageTitle: 'Amia - Video downloader',
        pageSubtitle: 'Video downloader',
        urlLabel: 'Video URL',
        urlPlaceholder: 'https://... (YouTube, TikTok, Twitter, Instagram, etc.)',
        formatLabel: 'Format',
        qualityLabel: 'Quality',
        playlistLabel: 'Download entire playlist',
        downloadButton: 'Download',
        formatMp4: 'MP4 (video)',
        formatWebm: 'WEBM (video)',
        formatMp3: 'MP3 (audio)',
        qualityBest: 'Best available',
        quality1080p: '1080p',
        quality720p: '720p',
        quality480p: '480p',
        qualityAudio: 'Audio (best quality)',
        statusInitiating: 'Starting download...',
        statusDownloading: 'Downloading...',
        statusReady: 'File ready!',
        downloadLinkText: 'Download file',
        downloadZip: 'Download All (ZIP)',
        playlistContent: 'Playlist Content',
        errorGeneric: 'An error occurred while downloading.',
        errorStateUnavailable: 'Status unavailable',
        errorCouldNotStart: 'Could not start download.',
        platformsTitle: 'Supported platforms',
        platformsMore: '+1000 more',
        noteRateLimit: 'Limit: 5 downloads per 60 minutes.',
        noteCleanup: 'Each file is automatically deleted after download or 15 minutes.',
        noteMaxSize: 'Max size allowed: 500 MB.',
        notePrivacy: 'Download link is private and no history is saved.',
        timeHour: 'hour',
        timeHours: 'hours',
        timeMinute: 'minute',
        timeMinutes: 'minutes'
      }
    });
  }
});

function initializeApp(config) {
  const t = config.translations;
  const lang = config.language;

  // Update document language
  document.documentElement.lang = lang;
  document.title = t.pageTitle;

  // Update static text content
  document.getElementById('page-subtitle').textContent = t.pageSubtitle;
  document.getElementById('url-label').textContent = t.urlLabel;
  document.getElementById('url').placeholder = t.urlPlaceholder;
  document.getElementById('format-label').textContent = t.formatLabel;
  document.getElementById('quality-label-text').textContent = t.qualityLabel;
  document.getElementById('playlist-label-text').textContent = t.playlistLabel;
  document.getElementById('download-button-text').textContent = t.downloadButton;

  // Update format options
  const formatSelect = document.getElementById('format-select');
  formatSelect.innerHTML = `
    <option value="mp4">${t.formatMp4}</option>
    <option value="webm">${t.formatWebm}</option>
    <option value="mp3">${t.formatMp3}</option>
  `;

  // Update quality options
  const qualitySelect = document.getElementById('quality-select');
  const qualityPresets = [
    { value: 'best', label: t.qualityBest },
    { value: '1080p', label: t.quality1080p },
    { value: '720p', label: t.quality720p },
    { value: '480p', label: t.quality480p }
  ];

  function setVideoQualityOptions() {
    qualitySelect.innerHTML = '';
    for (const option of qualityPresets) {
      const node = document.createElement('option');
      node.value = option.value;
      node.textContent = option.label;
      qualitySelect.appendChild(node);
    }
  }

  function setAudioQualityOption() {
    qualitySelect.innerHTML = '';
    const node = document.createElement('option');
    node.value = 'audio';
    node.textContent = t.qualityAudio;
    qualitySelect.appendChild(node);
  }

  function updateQualityOptions() {
    if (formatSelect.value === 'mp3') {
      setAudioQualityOption();
    } else {
      setVideoQualityOptions();
    }
  }

  // Initialize quality options
  updateQualityOptions();

  // Event listener for format change
  formatSelect.addEventListener('change', updateQualityOptions);

  // Update other static elements
  document.getElementById('download-link-text').textContent = t.downloadLinkText;
  document.getElementById('playlist-content-text').textContent = t.playlistContent;
  document.getElementById('platforms-title').textContent = t.platformsTitle;
  document.getElementById('platforms-more').textContent = t.platformsMore;

  // Update note text
  document.getElementById('note-text').textContent = 
    `${t.noteRateLimit} • ${t.noteCleanup} • ${t.noteMaxSize}`;

  // Form handling
  const form = document.getElementById('download-form');
  const statusCard = document.getElementById('status-card');
  const statusMessage = document.getElementById('status-message');
  const progressBar = document.getElementById('progress-bar');
  const progressText = document.getElementById('progress-text');
  const downloadLink = document.getElementById('download-link');
  const submitBtn = form.querySelector('button');

  let pollTimer = null;
  let activeToken = null;

  function showStatusCard() {
    statusCard.classList.add('active');
  }

  function resetStatus() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    activeToken = null;
    statusMessage.textContent = '';
    statusMessage.className = '';
    progressBar.value = 0;
    progressText.textContent = '';
    downloadLink.hidden = true;
    downloadLink.removeAttribute('href');
    document.getElementById('playlist-container')?.classList.remove('active');
  }

  async function pollStatus(token) {
    try {
      const response = await fetch(`/api/status/${token}`);
      if (!response.ok) {
        throw new Error(t.errorStateUnavailable);
      }
      const data = await response.json();
      progressBar.value = data.progress ?? 0;
      progressText.textContent = `${data.progress ?? 0}%`;

      if (data.status === 'completed') {
        statusMessage.textContent = t.statusReady;
        statusMessage.className = 'success';
        
        if (data.isPlaylist) {
          downloadLink.href = `/api/download/${token}?mode=zip`;
          downloadLink.innerHTML = `
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
            </svg>
            ${t.downloadZip}
          `;
          
          const playlistContainer = document.getElementById('playlist-container');
          const playlistFiles = document.getElementById('playlist-files');
          
          if (playlistContainer && playlistFiles && data.files) {
            playlistFiles.innerHTML = '';
            data.files.forEach((file) => {
              const li = document.createElement('li');
              li.className = 'file-item view-only';
              
              const sizeStr = file.size 
                ? (file.size / 1024 / 1024).toFixed(1) + ' MB' 
                : '';
                
              li.innerHTML = `
                <span class="file-name" title="${file.name}">${file.name}</span>
                <span class="file-size">${sizeStr || ''}</span>
              `;
              playlistFiles.appendChild(li);
            });
            playlistContainer.classList.add('active');
          }
        } else {
          downloadLink.href = `/api/download/${token}`;
          downloadLink.innerHTML = `
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
            </svg>
            ${t.downloadLinkText}
          `;
        }
        
        downloadLink.hidden = false;
        submitBtn.removeAttribute('disabled');
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
      } else if (data.status === 'error') {
        statusMessage.textContent = data.error ?? t.errorGeneric;
        statusMessage.className = 'error';
        downloadLink.hidden = true;
        document.getElementById('playlist-container')?.classList.remove('active');
        progressBar.value = 0;
        submitBtn.removeAttribute('disabled');
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
      }
    } catch (error) {
      statusMessage.textContent =
        error instanceof Error ? error.message : t.errorStateUnavailable;
      statusMessage.className = 'error';
      submitBtn.removeAttribute('disabled');
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    resetStatus();
    showStatusCard();
    statusMessage.textContent = t.statusInitiating;
    submitBtn.setAttribute('disabled', 'true');

    const formData = new FormData(form);
    const payload = {
      url: formData.get('url'),
      format: formData.get('format'),
      quality: formData.get('quality'),
      playlist: formData.get('playlist') === 'true'
    };

    try {
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error ?? t.errorCouldNotStart);
      }

      activeToken = data.token;
      statusMessage.textContent = t.statusDownloading;
      statusMessage.className = '';
      progressText.textContent = '0%';
      pollStatus(activeToken);
      pollTimer = setInterval(() => pollStatus(activeToken), 3000);
    } catch (error) {
      statusMessage.textContent =
        error instanceof Error ? error.message : t.errorCouldNotStart;
      statusMessage.className = 'error';
      submitBtn.removeAttribute('disabled');
    }
  });
}
