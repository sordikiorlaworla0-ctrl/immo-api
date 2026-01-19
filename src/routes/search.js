// Routes de recherche - Déclenchent le scraping
import { scraper } from '../services/scraper.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function searchRoutes(fastify) {

  // Recherche de propriétés (scraping actif)
  fastify.get('/', {
    schema: {
      tags: ['Recherche'],
      summary: 'Rechercher des propriétés',
      description: 'Lance une recherche active et retourne les résultats. Consomme plus de quota que /api/properties.',
      querystring: {
        type: 'object',
        properties: {
          city: { 
            type: 'string', 
            description: 'Ville (ex: Paris, Lyon, Marseille)' 
          },
          postalCode: { 
            type: 'string', 
            description: 'Code postal (ex: 75001, 69001)' 
          },
          department: { 
            type: 'string', 
            description: 'Numéro de département (ex: 75, 69)' 
          },
          propertyType: { 
            type: 'string', 
            enum: ['appartement', 'maison', 'studio', 'loft', 'terrain'],
            description: 'Type de bien' 
          },
          transactionType: { 
            type: 'string', 
            enum: ['vente', 'location'],
            default: 'vente',
            description: 'Vente ou location' 
          },
          minPrice: { 
            type: 'number', 
            minimum: 0,
            description: 'Prix minimum en euros' 
          },
          maxPrice: { 
            type: 'number',
            description: 'Prix maximum en euros' 
          },
          minSurface: { 
            type: 'number', 
            minimum: 0,
            description: 'Surface minimum en m²' 
          },
          maxSurface: { 
            type: 'number',
            description: 'Surface maximum en m²' 
          },
          minRooms: { 
            type: 'integer', 
            minimum: 1,
            description: 'Nombre minimum de pièces' 
          },
          maxRooms: { 
            type: 'integer',
            description: 'Nombre maximum de pièces' 
          },
          limit: { 
            type: 'integer', 
            default: 20, 
            minimum: 1, 
            maximum: 50,
            description: 'Nombre de résultats (max 50)' 
          }
        }
      },
      security: [{ apiKey: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            count: { type: 'integer' },
            data: { type: 'array' },
            meta: {
              type: 'object',
              properties: {
                searchParams: { type: 'object' },
                scrapedAt: { type: 'string' },
                source: { type: 'string' }
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
      const startTime = Date.now();
      
      // Lancer la recherche
      const results = await scraper.search(params);
      
      const duration = Date.now() - startTime;

      // Logger l'utilisation
      await prisma.usageLog.create({
        data: {
          userId: request.user.id,
          apiKeyId: request.apiKeyId,
          endpoint: '/api/search',
          method: 'GET',
          statusCode: 200,
          duration
        }
      });

      return {
        success: true,
        count: results.length,
        data: results,
        meta: {
          searchParams: params,
          scrapedAt: new Date().toISOString(),
          source: 'demo', // En production, indiquer la vraie source
          duration: `${duration}ms`
        }
      };

    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'SEARCH_ERROR',
        message: 'Erreur lors de la recherche. Veuillez réessayer.'
      });
    }
  });

  // Recherche par zone géographique
  fastify.post('/geo', {
    schema: {
      tags: ['Recherche'],
      summary: 'Recherche géographique',
      description: 'Rechercher des propriétés dans un rayon autour d\'un point GPS.',
      body: {
        type: 'object',
        required: ['latitude', 'longitude'],
        properties: {
          latitude: { 
            type: 'number', 
            minimum: -90, 
            maximum: 90,
            description: 'Latitude du centre de recherche' 
          },
          longitude: { 
            type: 'number', 
            minimum: -180, 
            maximum: 180,
            description: 'Longitude du centre de recherche' 
          },
          radiusKm: { 
            type: 'number', 
            default: 5, 
            minimum: 1, 
            maximum: 50,
            description: 'Rayon de recherche en km' 
          },
          propertyType: { type: 'string' },
          transactionType: { type: 'string', default: 'vente' },
          minPrice: { type: 'number' },
          maxPrice: { type: 'number' },
          limit: { type: 'integer', default: 20, maximum: 50 }
        }
      },
      security: [{ apiKey: [] }]
    },
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { latitude, longitude, radiusKm = 5, ...filters } = request.body;

    try {
      // Formule de Haversine simplifiée pour filtrer
      // En production, utiliser PostGIS ou une vraie solution géospatiale
      const latDelta = radiusKm / 111; // ~111km par degré de latitude
      const lonDelta = radiusKm / (111 * Math.cos(latitude * Math.PI / 180));

      const properties = await prisma.property.findMany({
        where: {
          latitude: {
            gte: latitude - latDelta,
            lte: latitude + latDelta
          },
          longitude: {
            gte: longitude - lonDelta,
            lte: longitude + lonDelta
          },
          ...(filters.propertyType && { propertyType: filters.propertyType }),
          ...(filters.transactionType && { transactionType: filters.transactionType }),
          ...(filters.minPrice && { price: { gte: filters.minPrice } }),
          ...(filters.maxPrice && { price: { lte: filters.maxPrice } })
        },
        take: filters.limit || 20
      });

      // Calculer la distance réelle et trier
      const withDistance = properties.map(p => {
        const dLat = (p.latitude - latitude) * Math.PI / 180;
        const dLon = (p.longitude - longitude) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(latitude * Math.PI / 180) * Math.cos(p.latitude * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const distance = 6371 * c; // Distance en km

        return {
          ...p,
          imageUrls: p.imageUrls ? JSON.parse(p.imageUrls) : [],
          distanceKm: Math.round(distance * 100) / 100
        };
      }).filter(p => p.distanceKm <= radiusKm)
        .sort((a, b) => a.distanceKm - b.distanceKm);

      return {
        success: true,
        count: withDistance.length,
        data: withDistance,
        meta: {
          center: { latitude, longitude },
          radiusKm,
          searchedAt: new Date().toISOString()
        }
      };

    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'GEO_SEARCH_ERROR',
        message: 'Erreur lors de la recherche géographique.'
      });
    }
  });

  // Suggestions de villes
  fastify.get('/autocomplete/cities', {
    schema: {
      tags: ['Recherche'],
      summary: 'Autocomplétion des villes',
      querystring: {
        type: 'object',
        required: ['q'],
        properties: {
          q: { type: 'string', minLength: 2, description: 'Terme de recherche' },
          limit: { type: 'integer', default: 10, maximum: 20 }
        }
      },
      security: [{ apiKey: [] }]
    },
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { q, limit = 10 } = request.query;

    try {
      // Récupérer les villes distinctes correspondantes
      const cities = await prisma.property.findMany({
        where: {
          city: { contains: q }
        },
        distinct: ['city'],
        select: {
          city: true,
          postalCode: true,
          department: true
        },
        take: limit
      });

      // Si pas de résultats en BDD, retourner des suggestions par défaut
      if (cities.length === 0) {
        const defaultCities = [
          { city: 'Paris', postalCode: '75000', department: '75' },
          { city: 'Lyon', postalCode: '69000', department: '69' },
          { city: 'Marseille', postalCode: '13000', department: '13' },
          { city: 'Bordeaux', postalCode: '33000', department: '33' },
          { city: 'Toulouse', postalCode: '31000', department: '31' }
        ].filter(c => c.city.toLowerCase().includes(q.toLowerCase()));

        return {
          success: true,
          data: defaultCities.slice(0, limit)
        };
      }

      return {
        success: true,
        data: cities
      };

    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'AUTOCOMPLETE_ERROR',
        message: 'Erreur lors de l\'autocomplétion.'
      });
    }
  });
}
