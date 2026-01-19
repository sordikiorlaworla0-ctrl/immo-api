// Routes d'administration pour gérer le scraping
import { scheduler } from '../services/scheduler.js';
import { dvfScraper } from '../services/dvfScraper.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function adminRoutes(fastify) {

  // Statut du scraper
  fastify.get('/status', {
    schema: {
      tags: ['Admin'],
      summary: 'Statut du système de scraping',
      description: 'Voir le statut du scheduler et les dernières exécutions.',
      security: [{ apiKey: [] }]
    },
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      // Compter les propriétés en base
      const totalProperties = await prisma.property.count();
      const propertiesBySource = await prisma.property.groupBy({
        by: ['source'],
        _count: { id: true }
      });

      const schedulerStatus = scheduler.getStatus();

      return {
        success: true,
        data: {
          scheduler: schedulerStatus,
          database: {
            totalProperties,
            bySource: propertiesBySource.reduce((acc, item) => {
              acc[item.source] = item._count.id;
              return acc;
            }, {})
          },
          server: {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            nodeVersion: process.version
          }
        }
      };
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'STATUS_ERROR',
        message: 'Erreur lors de la récupération du statut.'
      });
    }
  });

  // Lancer le scraping manuellement
  fastify.post('/scrape', {
    schema: {
      tags: ['Admin'],
      summary: 'Lancer le scraping manuellement',
      description: 'Déclenche immédiatement un scraping des données DVF.',
      security: [{ apiKey: [] }]
    },
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      // Vérifier si un scraping est déjà en cours
      const status = scheduler.getStatus();
      if (status.isRunning) {
        return reply.status(409).send({
          success: false,
          error: 'SCRAPING_IN_PROGRESS',
          message: 'Un scraping est déjà en cours. Veuillez patienter.'
        });
      }

      // Lancer le scraping en arrière-plan
      reply.status(202).send({
        success: true,
        message: 'Scraping démarré en arrière-plan. Vérifiez /api/admin/status pour suivre la progression.'
      });

      // Exécuter le scraping (non bloquant)
      scheduler.runScraping().catch(err => {
        console.error('Erreur scraping:', err);
      });

    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'SCRAPE_ERROR',
        message: 'Erreur lors du lancement du scraping.'
      });
    }
  });

  // Statistiques des données
  fastify.get('/stats', {
    schema: {
      tags: ['Admin'],
      summary: 'Statistiques des données scrapées',
      security: [{ apiKey: [] }]
    },
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      const totalProperties = await prisma.property.count();
      
      const byType = await prisma.property.groupBy({
        by: ['propertyType'],
        _count: { id: true },
        _avg: { price: true, pricePerSqm: true }
      });

      const byCity = await prisma.property.groupBy({
        by: ['city'],
        _count: { id: true },
        _avg: { pricePerSqm: true },
        orderBy: { _count: { id: 'desc' } },
        take: 20
      });

      const byDepartment = await prisma.property.groupBy({
        by: ['department'],
        _count: { id: true },
        _avg: { pricePerSqm: true },
        orderBy: { _count: { id: 'desc' } }
      });

      const recentProperties = await prisma.property.findMany({
        orderBy: { scrapedAt: 'desc' },
        take: 10,
        select: {
          id: true,
          title: true,
          city: true,
          price: true,
          surface: true,
          scrapedAt: true
        }
      });

      return {
        success: true,
        data: {
          total: totalProperties,
          byType: byType.map(t => ({
            type: t.propertyType,
            count: t._count.id,
            avgPrice: Math.round(t._avg.price || 0),
            avgPricePerSqm: Math.round(t._avg.pricePerSqm || 0)
          })),
          topCities: byCity.map(c => ({
            city: c.city,
            count: c._count.id,
            avgPricePerSqm: Math.round(c._avg.pricePerSqm || 0)
          })),
          byDepartment: byDepartment.map(d => ({
            department: d.department,
            count: d._count.id,
            avgPricePerSqm: Math.round(d._avg.pricePerSqm || 0)
          })),
          recentlyScraped: recentProperties
        }
      };
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'STATS_ERROR',
        message: 'Erreur lors du calcul des statistiques.'
      });
    }
  });

  // Nettoyer les anciennes données
  fastify.delete('/cleanup', {
    schema: {
      tags: ['Admin'],
      summary: 'Nettoyer les anciennes données',
      description: 'Supprime les propriétés scrapées il y a plus de X jours.',
      querystring: {
        type: 'object',
        properties: {
          days: { type: 'integer', default: 90, description: 'Supprimer les données de plus de X jours' }
        }
      },
      security: [{ apiKey: [] }]
    },
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { days = 90 } = request.query;

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const deleted = await prisma.property.deleteMany({
        where: {
          scrapedAt: { lt: cutoffDate }
        }
      });

      return {
        success: true,
        message: `${deleted.count} propriétés supprimées (plus de ${days} jours).`
      };
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'CLEANUP_ERROR',
        message: 'Erreur lors du nettoyage.'
      });
    }
  });
}
