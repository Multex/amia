interface Translations {
  // Page metadata
  pageTitle: string;
  pageSubtitle: string;

  // Form labels
  urlLabel: string;
  urlPlaceholder: string;
  formatLabel: string;
  qualityLabel: string;
  playlistLabel: string;
  downloadButton: string;

  // Format options
  formatMp4: string;
  formatWebm: string;
  formatMp3: string;

  // Quality options
  qualityBest: string;
  quality1080p: string;
  quality720p: string;
  quality480p: string;
  qualityAudio: string;

  // Status messages
  statusInitiating: string;
  statusDownloading: string;
  statusReady: string;
  statusProgress: string;
  downloadLinkText: string;
  downloadZip: string;
  playlistContent: string;

  // Error messages
  errorGeneric: string;
  errorStateUnavailable: string;
  errorCouldNotStart: string;

  // Platform section
  platformsTitle: string;
  platformsMore: string;

  // Notes
  noteRateLimit: (maxRequests: number, window: string) => string;
  noteCleanup: (ttl: string) => string;
  noteMaxSize: (size: number) => string;
  notePrivacy: string;

  // Time formatting
  timeHour: string;
  timeHours: string;
  timeMinute: string;
  timeMinutes: string;

  // API error messages
  apiInvalidData: string;
  apiInvalidDataDetails: string;
  apiInvalidUrl: string;
  apiRateLimitExceeded: (maxRequests: number, window: string) => string;
  apiCouldNotStart: string;
  apiMethodNotAllowed: string;
  apiNotFound: string;
  apiFileNotReady: string;
  apiInternalError: string;
}

const translations: Record<'en' | 'es', Translations> = {
  en: {
    // Page metadata
    pageTitle: 'Amia - Video downloader',
    pageSubtitle: 'Video downloader',

    // Form labels
    urlLabel: 'Video URL',
    urlPlaceholder: 'https://... (YouTube, TikTok, Twitter, Instagram, etc.)',
    formatLabel: 'Format',
    qualityLabel: 'Quality',
    playlistLabel: 'Download entire playlist',
    downloadButton: 'Download',

    // Format options
    formatMp4: 'MP4 (video)',
    formatWebm: 'WEBM (video)',
    formatMp3: 'MP3 (audio)',

    // Quality options
    qualityBest: 'Best available',
    quality1080p: '1080p',
    quality720p: '720p',
    quality480p: '480p',
    qualityAudio: 'Audio (best quality)',

    // Status messages
    statusInitiating: 'Starting download...',
    statusDownloading: 'Downloading...',
    statusReady: 'File ready!',
    statusProgress: 'Progress',
    downloadLinkText: 'Download file',
    downloadZip: 'Download All (ZIP)',
    playlistContent: 'Playlist Content',

    // Error messages
    errorGeneric: 'An error occurred while downloading.',
    errorStateUnavailable: 'Status unavailable',
    errorCouldNotStart: 'Could not start download.',

    // Platform section
    platformsTitle: 'Supported platforms',
    platformsMore: '+1000 more',

    // Notes
    noteRateLimit: (maxRequests, window) => `Limit: ${maxRequests} downloads per ${window}.`,
    noteCleanup: (ttl) => `Each file is automatically deleted after download or ${ttl}.`,
    noteMaxSize: (size) => `Max size allowed: ${size} MB.`,
    notePrivacy: 'Download link is private and no history is saved.',

    // Time formatting
    timeHour: 'hour',
    timeHours: 'hours',
    timeMinute: 'minute',
    timeMinutes: 'minutes',

    // API error messages
    apiInvalidData: 'Invalid data',
    apiInvalidDataDetails: 'Could not read request body.',
    apiInvalidUrl: 'Invalid URL. Must be a valid URL (http or https).',
    apiRateLimitExceeded: (maxRequests, window) => `You have reached the limit of ${maxRequests} downloads per ${window}. Try again later.`,
    apiCouldNotStart: 'Could not start download.',
    apiMethodNotAllowed: 'Method not allowed',
    apiNotFound: 'Download not found or expired.',
    apiFileNotReady: 'File not ready yet.',
    apiInternalError: 'Internal server error.'
  },
  es: {
    // Page metadata
    pageTitle: 'Amia - Descargador de videos',
    pageSubtitle: 'Descargador de videos',

    // Form labels
    urlLabel: 'URL del video',
    urlPlaceholder: 'https://... (YouTube, TikTok, Twitter, Instagram, etc.)',
    formatLabel: 'Formato',
    qualityLabel: 'Calidad',
    playlistLabel: 'Descargar playlist completa',
    downloadButton: 'Descargar',

    // Format options
    formatMp4: 'MP4 (video)',
    formatWebm: 'WEBM (video)',
    formatMp3: 'MP3 (audio)',

    // Quality options
    qualityBest: 'Mejor disponible',
    quality1080p: '1080p',
    quality720p: '720p',
    quality480p: '480p',
    qualityAudio: 'Audio (máxima calidad)',

    // Status messages
    statusInitiating: 'Iniciando descarga...',
    statusDownloading: 'Descargando...',
    statusReady: '¡Archivo listo!',
    statusProgress: 'Progreso',
    downloadLinkText: 'Descargar archivo',
    downloadZip: 'Descargar Todo (ZIP)',
    playlistContent: 'Contenido de la Playlist',

    // Error messages
    errorGeneric: 'Hubo un error al descargar.',
    errorStateUnavailable: 'Estado no disponible',
    errorCouldNotStart: 'No se pudo iniciar la descarga.',

    // Platform section
    platformsTitle: 'Plataformas soportadas',
    platformsMore: '+1000 más',

    // Notes
    noteRateLimit: (maxRequests, window) => `Límite: ${maxRequests} descargas por ${window}.`,
    noteCleanup: (ttl) => `Cada archivo se elimina automáticamente tras la descarga o ${ttl}.`,
    noteMaxSize: (size) => `Tamaño máximo permitido: ${size} MB.`,
    notePrivacy: 'El enlace de descarga es privado y no se guarda historial.',

    // Time formatting
    timeHour: 'hora',
    timeHours: 'horas',
    timeMinute: 'minuto',
    timeMinutes: 'minutos',

    // API error messages
    apiInvalidData: 'Datos inválidos',
    apiInvalidDataDetails: 'No se pudo leer el cuerpo de la petición.',
    apiInvalidUrl: 'URL inválida. Debe ser una URL válida (http o https).',
    apiRateLimitExceeded: (maxRequests, window) => `Has alcanzado el límite de ${maxRequests} descargas por ${window}. Inténtalo más tarde.`,
    apiCouldNotStart: 'No se pudo iniciar la descarga.',
    apiMethodNotAllowed: 'Método no permitido',
    apiNotFound: 'Descarga no encontrada o expirada.',
    apiFileNotReady: 'El archivo aún no está listo.',
    apiInternalError: 'Error interno del servidor.'
  }
};

export function getTranslations(lang: 'en' | 'es' = 'en'): Translations {
  return translations[lang] || translations.en;
}

export const supportedLanguages = ['en', 'es'] as const;
