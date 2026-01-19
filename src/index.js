// Point d'entrée principal de l'API - VERSION SÉCURISÉE
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import dotenv from 'dotenv';

// Import des routes
import authRoutes from './routes/auth.js';
import propertiesRoutes from './routes/properties.js';
import searchRoutes from './routes/search.js';
import statsRoutes from './routes/stats.js';
import adminRoutes from './routes/admin.js';

// Import middleware
import { authMiddleware } from './middleware/auth.js';

// Import du scheduler
import { scheduler } from './services/scheduler.js';

// Charger les variables d'environnement
dotenv.config();

// Créer l'instance Fastify
const fastify = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    transport: process.env.NODE_ENV !== 'production' ? {
      target: 'pino-pretty',
      options: { colorize: true }
    } : undefined
  }
});

// 🔒 HELMET - Protection des headers HTTP
await fastify.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false,
});

// 🔒 CORS - Contrôle des origines
await fastify.register(cors, {
  origin: process.env.NODE_ENV === 'production' 
    ? (process.env.ALLOWED_ORIGINS || 'https://votre-domaine.com').split(',')
    : true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
});

// 🔒 RATE LIMITING global
await fastify.register(rateLimit, {
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  timeWindow: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
  keyGenerator: (request) => request.headers['x-api-key'] || request.ip,
  errorResponseBuilder: (request, context) => ({
    success: false,
    error: 'RATE_LIMIT_EXCEEDED',
    message: `Trop de requêtes. Limite: ${context.max} par minute.`,
    retryAfter: context.after
  }),
});

// Documentation Swagger
await fastify.register(swagger, {
  openapi: {
    info: {
      title: 'Immo Scraper API',
      description: 'API de scraping de données immobilières - Version Sécurisée 🔒',
      version: '1.1.0',
    },
    servers: [
      { url: 'http://localhost:3000', description: 'Développement' },
      { url: 'https://api.votre-domaine.com', description: 'Production' }
    ],
    components: {
      securitySchemes: {
        apiKey: {
          type: 'apiKey',
          name: 'X-API-Key',
          in: 'header',
          description: 'Clé API pour authentification'
        }
      }
    },
    security: [{ apiKey: [] }]
  }
});

await fastify.register(swaggerUi, {
  routePrefix: '/docs',
  uiConfig: {
    docExpansion: 'list',
    deepLinking: true
  }
});

// Décorateur pour l'authentification
fastify.decorate('authenticate', authMiddleware);

// 🔒 Headers de sécurité supplémentaires
fastify.addHook('onSend', async (request, reply) => {
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('X-XSS-Protection', '1; mode=block');
});

// Route de santé
fastify.get('/health', {
  schema: {
    tags: ['Santé'],
    summary: 'Vérifier le statut de l\'API',
  }
}, async () => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
  version: '1.1.0',
  secure: true
}));

// Route d'accueil
fastify.get('/', async () => ({
  name: 'Immo Scraper API',
  version: '1.1.0',
  secure: true,
  documentation: '/docs',
  endpoints: {
    health: '/health',
    auth: '/api/auth/*',
    properties: '/api/properties/*',
    search: '/api/search/*',
    stats: '/api/stats/*',
    admin: '/api/admin/*'
  }
}));

// Enregistrer les routes
await fastify.register(authRoutes, { prefix: '/api/auth' });
await fastify.register(propertiesRoutes, { prefix: '/api/properties' });
await fastify.register(searchRoutes, { prefix: '/api/search' });
await fastify.register(statsRoutes, { prefix: '/api/stats' });
await fastify.register(adminRoutes, { prefix: '/api/admin' });

// Gestionnaire d'erreurs
fastify.setErrorHandler((error, request, reply) => {
  fastify.log.error(error);

  if (error.validation) {
    return reply.status(400).send({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Données invalides'
    });
  }

  const statusCode = error.statusCode || 500;
  reply.status(statusCode).send({
    success: false,
    error: error.code || 'INTERNAL_ERROR',
    message: statusCode === 500 ? 'Erreur interne du serveur' : error.message
  });
});

// Démarrer le serveur
const start = async () => {
  try {
    const host = process.env.HOST || '0.0.0.0';
    const port = parseInt(process.env.PORT) || 3000;

    await fastify.listen({ port, host });

    console.log(`
    🏠 Immo Scraper API démarrée !
    🔒 VERSION SÉCURISÉE
    
    📍 URL locale:     http://localhost:${port}
    📚 Documentation:  http://localhost:${port}/docs
    💚 Health check:   http://localhost:${port}/health
    
    🛡️  Protections actives:
        ✅ Helmet (headers sécurisés)
        ✅ CORS restreint
        ✅ Rate limiting
        ✅ Clés API sécurisées
    
    Prêt à recevoir des requêtes !
    `);

    scheduler.start();

  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
