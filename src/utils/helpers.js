// Utilitaires divers

/**
 * Formater un prix en euros
 */
export function formatPrice(price, locale = 'fr-FR') {
  if (price === null || price === undefined) return 'N/A';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0
  }).format(price);
}

/**
 * Formater une surface
 */
export function formatSurface(surface) {
  if (surface === null || surface === undefined) return 'N/A';
  return `${surface} m²`;
}

/**
 * Nettoyer et normaliser une chaîne
 */
export function normalizeString(str) {
  if (!str) return '';
  return str
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // Supprimer les accents
}

/**
 * Calculer le prix au m²
 */
export function calculatePricePerSqm(price, surface) {
  if (!price || !surface || surface === 0) return null;
  return Math.round(price / surface);
}

/**
 * Valider un code postal français
 */
export function isValidPostalCode(code) {
  return /^[0-9]{5}$/.test(code);
}

/**
 * Extraire le département d'un code postal
 */
export function getDepartmentFromPostalCode(postalCode) {
  if (!isValidPostalCode(postalCode)) return null;
  
  // Cas spéciaux pour la Corse et les DOM-TOM
  const prefix = postalCode.substring(0, 2);
  if (prefix === '97' || prefix === '98') {
    return postalCode.substring(0, 3);
  }
  if (prefix === '20') {
    // Corse: 20000-20190 = 2A, 20200+ = 2B
    const num = parseInt(postalCode, 10);
    return num < 20200 ? '2A' : '2B';
  }
  return prefix;
}

/**
 * Slugifier une chaîne
 */
export function slugify(str) {
  return normalizeString(str)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Générer un ID unique
 */
export function generateId(prefix = '') {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return prefix ? `${prefix}_${timestamp}${random}` : `${timestamp}${random}`;
}

/**
 * Délai async
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry une fonction avec backoff exponentiel
 */
export async function retry(fn, maxRetries = 3, baseDelay = 1000) {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, i);
        await sleep(delay);
      }
    }
  }
  
  throw lastError;
}

/**
 * Tronquer un texte
 */
export function truncate(str, maxLength = 100) {
  if (!str || str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}
