// Middleware d'authentification par clé API - VERSION SÉCURISÉE
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

// Cache pour éviter trop de requêtes BDD
const keyCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Nettoyer le cache périodiquement
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of keyCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      keyCache.delete(key);
    }
  }
}, 60000);

/**
 * 🔒 Comparaison timing-safe pour éviter les timing attacks
 */
function secureCompare(a, b) {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * 🔒 Middleware d'authentification principal
 */
export async function authMiddleware(request, reply) {
  const apiKey = request.headers['x-api-key'];

  if (!apiKey) {
    return reply.status(401).send({
      success: false,
      error: 'MISSING_API_KEY',
      message: 'Clé API manquante. Ajoutez le header X-API-Key.'
    });
  }

  // 🔒 Vérifier le format de la clé
  if (!apiKey.startsWith('immo_') || apiKey.length < 20) {
    return reply.status(401).send({
      success: false,
      error: 'INVALID_API_KEY_FORMAT',
      message: 'Format de clé API invalide.'
    });
  }

  try {
    // Vérifier le cache
    if (keyCache.has(apiKey)) {
      const cached = keyCache.get(apiKey);
      if (Date.now() - cached.timestamp < CACHE_TTL) {
        request.user = cached.user;
        request.apiKeyId = cached.keyId;
        request.plan = cached.plan;
        return;
      }
      keyCache.delete(apiKey);
    }

    // Rechercher la clé dans la BDD
    const key = await prisma.apiKey.findUnique({
      where: { key: apiKey },
      include: {
        user: {
          include: {
            subscription: {
              include: { plan: true }
            }
          }
        }
      }
    });

    if (!key) {
      // 🔒 Logger les tentatives invalides
      request.log.warn({
        msg: '🚨 Clé API invalide',
        ip: request.ip,
        keyPrefix: apiKey.substring(0, 10) + '...'
      });

      return reply.status(401).send({
        success: false,
        error: 'INVALID_API_KEY',
        message: 'Clé API invalide.'
      });
    }

    if (!key.isActive) {
      return reply.status(403).send({
        success: false,
        error: 'API_KEY_DISABLED',
        message: 'Cette clé API a été désactivée.'
      });
    }

    // Vérifier les quotas
    const subscription = key.user.subscription;
    if (subscription) {
      if (new Date() > subscription.periodEnd) {
        return reply.status(403).send({
          success: false,
          error: 'SUBSCRIPTION_EXPIRED',
          message: 'Votre abonnement a expiré.'
        });
      }

      if (subscription.requestsUsed >= subscription.plan.requestsLimit) {
        return reply.status(429).send({
          success: false,
          error: 'QUOTA_EXCEEDED',
          message: `Quota mensuel atteint (${subscription.plan.requestsLimit} requêtes).`,
          resetDate: subscription.periodEnd
        });
      }

      // Incrémenter le compteur (async)
      prisma.subscription.update({
        where: { id: subscription.id },
        data: { requestsUsed: { increment: 1 } }
      }).catch(err => request.log.error(err));
    }

    // Mettre à jour lastUsed (async)
    prisma.apiKey.update({
      where: { id: key.id },
      data: { lastUsed: new Date() }
    }).catch(err => request.log.error(err));

    // Mettre en cache
    const cacheData = {
      user: key.user,
      keyId: key.id,
      plan: subscription?.plan || { name: 'free', requestsLimit: 100, rateLimit: 10 },
      timestamp: Date.now()
    };
    keyCache.set(apiKey, cacheData);

    request.user = key.user;
    request.apiKeyId = key.id;
    request.plan = cacheData.plan;

  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      error: 'AUTH_ERROR',
      message: 'Erreur d\'authentification.'
    });
  }
}

/**
 * 🔒 Invalider le cache pour une clé
 */
export function invalidateKeyCache(apiKey) {
  keyCache.delete(apiKey);
}

/**
 * 🔒 Vider tout le cache
 */
export function clearKeyCache() {
  keyCache.clear();
}
