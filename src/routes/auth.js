// Routes d'authentification - VERSION SÉCURISÉE
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { invalidateKeyCache } from '../middleware/auth.js';

const prisma = new PrismaClient();

/**
 * 🔒 Générer une clé API sécurisée avec crypto
 */
function generateSecureApiKey() {
  const randomBytes = crypto.randomBytes(24);
  return `immo_${randomBytes.toString('base64url')}`;
}

/**
 * 🔒 Valider un email
 */
function isValidEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email) && email.length <= 255;
}

/**
 * 🔒 Nettoyer une chaîne (anti-XSS)
 */
function sanitize(str) {
  if (!str) return null;
  return str.replace(/[<>'"&]/g, '').substring(0, 100).trim();
}

export default async function authRoutes(fastify) {

  // 🔒 Créer un compte
  fastify.post('/register', {
    schema: {
      tags: ['Authentification'],
      summary: 'Créer un compte et obtenir une clé API',
      body: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email' },
          name: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { email, name } = request.body;

    if (!isValidEmail(email)) {
      return reply.status(400).send({
        success: false,
        error: 'INVALID_EMAIL',
        message: 'Email invalide.'
      });
    }

    try {
      const existingUser = await prisma.user.findUnique({
        where: { email: email.toLowerCase().trim() }
      });

      if (existingUser) {
        return reply.status(400).send({
          success: false,
          error: 'EMAIL_EXISTS',
          message: 'Un compte existe déjà avec cet email.'
        });
      }

      // Récupérer ou créer le plan gratuit
      let freePlan = await prisma.plan.findUnique({ where: { name: 'free' } });
      
      if (!freePlan) {
        freePlan = await prisma.plan.create({
          data: {
            name: 'free',
            displayName: 'Gratuit',
            price: 0,
            requestsLimit: 100,
            rateLimit: 10,
            features: JSON.stringify(['100 requêtes/mois', 'Support email'])
          }
        });
      }

      // Créer l'utilisateur
      const user = await prisma.user.create({
        data: {
          email: email.toLowerCase().trim(),
          name: sanitize(name)
        }
      });

      // 🔒 Générer une clé API sécurisée
      const apiKey = generateSecureApiKey();
      
      await prisma.apiKey.create({
        data: {
          key: apiKey,
          name: 'Default',
          userId: user.id
        }
      });

      // Créer l'abonnement
      const periodEnd = new Date();
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      await prisma.subscription.create({
        data: {
          userId: user.id,
          planId: freePlan.id,
          periodEnd
        }
      });

      request.log.info({ msg: '✅ Nouveau compte créé', userId: user.id });

      return reply.status(201).send({
        success: true,
        message: 'Compte créé avec succès !',
        data: {
          userId: user.id,
          email: user.email,
          apiKey: apiKey,
          plan: 'free',
          quotas: {
            requestsPerMonth: freePlan.requestsLimit,
            ratePerMinute: freePlan.rateLimit
          }
        }
      });

    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'REGISTRATION_ERROR',
        message: 'Erreur lors de la création du compte.'
      });
    }
  });

  // 🔒 Générer une nouvelle clé API
  fastify.post('/keys', {
    schema: {
      tags: ['Authentification'],
      summary: 'Générer une nouvelle clé API',
      body: {
        type: 'object',
        properties: {
          keyName: { type: 'string', default: 'New Key' }
        }
      },
      security: [{ apiKey: [] }]
    },
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { keyName } = request.body || {};

    try {
      // 🔒 Limiter à 5 clés par utilisateur
      const keyCount = await prisma.apiKey.count({
        where: { userId: request.user.id, isActive: true }
      });

      if (keyCount >= 5) {
        return reply.status(400).send({
          success: false,
          error: 'MAX_KEYS_REACHED',
          message: 'Maximum 5 clés API autorisées.'
        });
      }

      const apiKey = generateSecureApiKey();
      
      const newKey = await prisma.apiKey.create({
        data: {
          key: apiKey,
          name: sanitize(keyName) || 'New Key',
          userId: request.user.id
        }
      });

      return reply.status(201).send({
        success: true,
        message: 'Nouvelle clé API créée',
        data: {
          keyId: newKey.id,
          apiKey: apiKey,
          name: newKey.name,
          createdAt: newKey.createdAt
        }
      });

    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'KEY_GENERATION_ERROR',
        message: 'Erreur lors de la génération.'
      });
    }
  });

  // Lister ses clés API
  fastify.get('/keys', {
    schema: {
      tags: ['Authentification'],
      summary: 'Lister vos clés API',
      security: [{ apiKey: [] }]
    },
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      const keys = await prisma.apiKey.findMany({
        where: { userId: request.user.id },
        select: {
          id: true,
          name: true,
          key: true,
          isActive: true,
          createdAt: true,
          lastUsed: true
        }
      });

      // 🔒 Masquer les clés
      const maskedKeys = keys.map(k => ({
        ...k,
        key: k.key.substring(0, 10) + '****' + k.key.slice(-4)
      }));

      return { success: true, data: maskedKeys };

    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'FETCH_ERROR',
        message: 'Erreur lors de la récupération.'
      });
    }
  });

  // 🔒 Désactiver une clé API
  fastify.delete('/keys/:keyId', {
    schema: {
      tags: ['Authentification'],
      summary: 'Désactiver une clé API',
      params: {
        type: 'object',
        properties: {
          keyId: { type: 'string' }
        }
      },
      security: [{ apiKey: [] }]
    },
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { keyId } = request.params;

    try {
      const key = await prisma.apiKey.findFirst({
        where: { id: keyId, userId: request.user.id }
      });

      if (!key) {
        return reply.status(404).send({
          success: false,
          error: 'KEY_NOT_FOUND',
          message: 'Clé non trouvée.'
        });
      }

      await prisma.apiKey.update({
        where: { id: keyId },
        data: { isActive: false }
      });

      // 🔒 Invalider le cache
      invalidateKeyCache(key.key);

      return { success: true, message: 'Clé désactivée.' };

    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'DELETE_ERROR',
        message: 'Erreur lors de la désactivation.'
      });
    }
  });

  // Voir son profil
  fastify.get('/me', {
    schema: {
      tags: ['Authentification'],
      summary: 'Voir son profil et son usage',
      security: [{ apiKey: [] }]
    },
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: request.user.id },
        include: {
          subscription: { include: { plan: true } },
          _count: { select: { apiKeys: true } }
        }
      });

      const sub = user.subscription;

      return {
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            createdAt: user.createdAt
          },
          plan: sub ? {
            name: sub.plan.name,
            displayName: sub.plan.displayName,
            price: sub.plan.price
          } : null,
          usage: sub ? {
            requestsUsed: sub.requestsUsed,
            requestsLimit: sub.plan.requestsLimit,
            percentUsed: Math.round((sub.requestsUsed / sub.plan.requestsLimit) * 100),
            periodEnd: sub.periodEnd
          } : null,
          apiKeysCount: user._count.apiKeys
        }
      };

    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'FETCH_ERROR',
        message: 'Erreur lors de la récupération.'
      });
    }
  });
}
