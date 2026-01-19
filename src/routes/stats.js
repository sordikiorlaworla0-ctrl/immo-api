// Routes de statistiques du marché immobilier
import { scraper } from '../services/scraper.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function statsRoutes(fastify) {

  // Statistiques générales du marché
  fastify.get('/market', {
    schema: {
      tags: ['Statistiques'],
      summary: 'Statistiques du marché immobilier',
      description: 'Obtenir des statistiques agrégées sur les prix, surfaces, etc.',
      querystring: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'Filtrer par ville' },
          postalCode: { type: 'string', description: 'Filtrer par code postal' },
          department: { type: 'string', description: 'Filtrer par département' },
          propertyType: { 
            type: 'string', 
            enum: ['appartement', 'maison', 'studio', 'loft', 'terrain']
          },
          transactionType: { 
            type: 'string', 
            enum: ['vente', 'location'],
            default: 'vente'
          }
        }
      },
      security: [{ apiKey: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                count: { type: 'integer' },
                price: {
                  type: 'object',
                  properties: {
                    min: { type: 'number' },
                    max: { type: 'number' },
                    avg: { type: 'number' },
                    median: { type: 'number' }
                  }
                },
                pricePerSqm: {
                  type: 'object',
                  properties: {
                    min: { type: 'number' },
                    max: { type: 'number' },
                    avg: { type: 'number' },
                    median: { type: 'number' }
                  }
                }
              }
            }
          }
        }
      }
    },
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const params = request.query;

    try {
      const stats = await scraper.getMarketStats(params);

      return {
        success: true,
        data: stats,
        meta: {
          filters: params,
          generatedAt: new Date().toISOString()
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

  // Prix moyen par ville
  fastify.get('/prices-by-city', {
    schema: {
      tags: ['Statistiques'],
      summary: 'Prix moyens par ville',
      description: 'Classement des villes par prix moyen au m².',
      querystring: {
        type: 'object',
        properties: {
          transactionType: { 
            type: 'string', 
            enum: ['vente', 'location'],
            default: 'vente'
          },
          propertyType: { type: 'string' },
          limit: { type: 'integer', default: 20, maximum: 100 },
          order: { type: 'string', enum: ['asc', 'desc'], default: 'desc' }
        }
      },
      security: [{ apiKey: [] }]
    },
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { transactionType = 'vente', propertyType, limit = 20, order = 'desc' } = request.query;

    try {
      const where = { transactionType };
      if (propertyType) where.propertyType = propertyType;

      // Grouper par ville et calculer les moyennes
      const cities = await prisma.property.groupBy({
        by: ['city'],
        where,
        _avg: {
          price: true,
          pricePerSqm: true,
          surface: true
        },
        _count: {
          id: true
        },
        having: {
          id: {
            _count: {
              gte: 1
            }
          }
        },
        orderBy: {
          _avg: {
            pricePerSqm: order
          }
        },
        take: limit
      });

      const result = cities.map(c => ({
        city: c.city,
        avgPrice: Math.round(c._avg.price || 0),
        avgPricePerSqm: Math.round(c._avg.pricePerSqm || 0),
        avgSurface: Math.round(c._avg.surface || 0),
        listingsCount: c._count.id
      }));

      return {
        success: true,
        count: result.length,
        data: result,
        meta: {
          transactionType,
          propertyType: propertyType || 'all',
          order,
          generatedAt: new Date().toISOString()
        }
      };

    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'STATS_ERROR',
        message: 'Erreur lors du calcul des statistiques par ville.'
      });
    }
  });

  // Distribution des prix
  fastify.get('/price-distribution', {
    schema: {
      tags: ['Statistiques'],
      summary: 'Distribution des prix',
      description: 'Histogramme de distribution des prix.',
      querystring: {
        type: 'object',
        properties: {
          city: { type: 'string' },
          department: { type: 'string' },
          transactionType: { type: 'string', enum: ['vente', 'location'], default: 'vente' },
          propertyType: { type: 'string' },
          buckets: { type: 'integer', default: 10, minimum: 5, maximum: 20 }
        }
      },
      security: [{ apiKey: [] }]
    },
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { city, department, transactionType = 'vente', propertyType, buckets = 10 } = request.query;

    try {
      const where = { transactionType, price: { not: null } };
      if (city) where.city = city;
      if (department) where.department = department;
      if (propertyType) where.propertyType = propertyType;

      const properties = await prisma.property.findMany({
        where,
        select: { price: true }
      });

      if (properties.length === 0) {
        return {
          success: true,
          data: [],
          message: 'Pas de données pour ces critères.'
        };
      }

      const prices = properties.map(p => p.price).sort((a, b) => a - b);
      const min = prices[0];
      const max = prices[prices.length - 1];
      const bucketSize = (max - min) / buckets;

      // Créer les buckets
      const distribution = [];
      for (let i = 0; i < buckets; i++) {
        const bucketMin = min + (i * bucketSize);
        const bucketMax = min + ((i + 1) * bucketSize);
        const count = prices.filter(p => p >= bucketMin && (i === buckets - 1 ? p <= bucketMax : p < bucketMax)).length;
        
        distribution.push({
          range: {
            min: Math.round(bucketMin),
            max: Math.round(bucketMax)
          },
          count,
          percentage: Math.round((count / prices.length) * 100 * 10) / 10
        });
      }

      return {
        success: true,
        data: distribution,
        meta: {
          totalListings: prices.length,
          priceRange: { min, max },
          filters: { city, department, transactionType, propertyType },
          generatedAt: new Date().toISOString()
        }
      };

    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'DISTRIBUTION_ERROR',
        message: 'Erreur lors du calcul de la distribution.'
      });
    }
  });

  // Tendances (évolution dans le temps)
  fastify.get('/trends', {
    schema: {
      tags: ['Statistiques'],
      summary: 'Tendances du marché',
      description: 'Évolution des prix moyens dans le temps.',
      querystring: {
        type: 'object',
        properties: {
          city: { type: 'string' },
          department: { type: 'string' },
          transactionType: { type: 'string', enum: ['vente', 'location'], default: 'vente' },
          propertyType: { type: 'string' },
          period: { type: 'string', enum: ['week', 'month', 'quarter'], default: 'month' }
        }
      },
      security: [{ apiKey: [] }]
    },
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { city, department, transactionType = 'vente', propertyType, period = 'month' } = request.query;

    try {
      const where = { transactionType };
      if (city) where.city = city;
      if (department) where.department = department;
      if (propertyType) where.propertyType = propertyType;

      const properties = await prisma.property.findMany({
        where,
        select: {
          price: true,
          pricePerSqm: true,
          scrapedAt: true
        },
        orderBy: { scrapedAt: 'asc' }
      });

      if (properties.length === 0) {
        return {
          success: true,
          data: [],
          message: 'Pas de données pour ces critères.'
        };
      }

      // Grouper par période
      const groupedData = {};
      properties.forEach(p => {
        let periodKey;
        const date = new Date(p.scrapedAt);
        
        if (period === 'week') {
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          periodKey = weekStart.toISOString().split('T')[0];
        } else if (period === 'month') {
          periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        } else {
          const quarter = Math.floor(date.getMonth() / 3) + 1;
          periodKey = `${date.getFullYear()}-Q${quarter}`;
        }

        if (!groupedData[periodKey]) {
          groupedData[periodKey] = { prices: [], pricesPerSqm: [] };
        }
        if (p.price) groupedData[periodKey].prices.push(p.price);
        if (p.pricePerSqm) groupedData[periodKey].pricesPerSqm.push(p.pricePerSqm);
      });

      // Calculer les moyennes par période
      const trends = Object.entries(groupedData).map(([period, data]) => ({
        period,
        avgPrice: Math.round(data.prices.reduce((a, b) => a + b, 0) / data.prices.length || 0),
        avgPricePerSqm: Math.round(data.pricesPerSqm.reduce((a, b) => a + b, 0) / data.pricesPerSqm.length || 0),
        listingsCount: data.prices.length
      }));

      return {
        success: true,
        data: trends,
        meta: {
          filters: { city, department, transactionType, propertyType },
          period,
          generatedAt: new Date().toISOString()
        }
      };

    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'TRENDS_ERROR',
        message: 'Erreur lors du calcul des tendances.'
      });
    }
  });
}
