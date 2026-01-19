// Routes pour les propriétés immobilières
import { PrismaClient } from '@prisma/client';
import { scraper } from '../services/scraper.js';

const prisma = new PrismaClient();

export default async function propertiesRoutes(fastify) {

  // Lister les propriétés (depuis le cache)
  fastify.get('/', {
    schema: {
      tags: ['Propriétés'],
      summary: 'Lister les propriétés en cache',
      description: 'Récupère les propriétés depuis le cache local. Pour des données fraîches, utilisez /api/search.',
      querystring: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'Filtrer par ville' },
          postalCode: { type: 'string', description: 'Filtrer par code postal' },
          department: { type: 'string', description: 'Filtrer par département' },
          propertyType: { 
            type: 'string', 
            enum: ['appartement', 'maison', 'studio', 'loft', 'terrain'],
            description: 'Type de bien'
          },
          transactionType: { 
            type: 'string', 
            enum: ['vente', 'location'],
            description: 'Type de transaction'
          },
          minPrice: { type: 'number', description: 'Prix minimum' },
          maxPrice: { type: 'number', description: 'Prix maximum' },
          minSurface: { type: 'number', description: 'Surface minimum (m²)' },
          maxSurface: { type: 'number', description: 'Surface maximum (m²)' },
          rooms: { type: 'integer', description: 'Nombre de pièces' },
          page: { type: 'integer', default: 1, minimum: 1 },
          limit: { type: 'integer', default: 20, minimum: 1, maximum: 100 },
          sortBy: { 
            type: 'string', 
            enum: ['price', 'surface', 'createdAt', 'pricePerSqm'],
            default: 'createdAt'
          },
          sortOrder: { type: 'string', enum: ['asc', 'desc'], default: 'desc' }
        }
      },
      security: [{ apiKey: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  title: { type: 'string' },
                  price: { type: 'number' },
                  surface: { type: 'number' },
                  rooms: { type: 'integer' },
                  city: { type: 'string' },
                  propertyType: { type: 'string' },
                  transactionType: { type: 'string' }
                }
              }
            },
            pagination: {
              type: 'object',
              properties: {
                page: { type: 'integer' },
                limit: { type: 'integer' },
                total: { type: 'integer' },
                totalPages: { type: 'integer' }
              }
            }
          }
        }
      }
    },
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const {
      city, postalCode, department, propertyType, transactionType,
      minPrice, maxPrice, minSurface, maxSurface, rooms,
      page = 1, limit = 20, sortBy = 'scrapedAt', sortOrder = 'desc'
    } = request.query;

    try {
      // Construire les filtres
      const where = {};
      
      if (city) where.city = { contains: city };
      if (postalCode) where.postalCode = postalCode;
      if (department) where.department = department;
      if (propertyType) where.propertyType = propertyType;
      if (transactionType) where.transactionType = transactionType;
      if (rooms) where.rooms = rooms;
      
      if (minPrice || maxPrice) {
        where.price = {};
        if (minPrice) where.price.gte = minPrice;
        if (maxPrice) where.price.lte = maxPrice;
      }
      
      if (minSurface || maxSurface) {
        where.surface = {};
        if (minSurface) where.surface.gte = minSurface;
        if (maxSurface) where.surface.lte = maxSurface;
      }

      // Compter le total
      const total = await prisma.property.count({ where });

      // Récupérer les propriétés
      const properties = await prisma.property.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          externalId: true,
          source: true,
          title: true,
          price: true,
          pricePerSqm: true,
          surface: true,
          rooms: true,
          bedrooms: true,
          propertyType: true,
          transactionType: true,
          city: true,
          postalCode: true,
          department: true,
          url: true,
          publishedAt: true,
          scrapedAt: true
        }
      });

      return {
        success: true,
        data: properties,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };

    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'FETCH_ERROR',
        message: 'Erreur lors de la récupération des propriétés.'
      });
    }
  });

  // Obtenir une propriété par ID
  fastify.get('/:id', {
    schema: {
      tags: ['Propriétés'],
      summary: 'Obtenir les détails d\'une propriété',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'ID de la propriété' }
        }
      },
      security: [{ apiKey: [] }]
    },
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { id } = request.params;

    try {
      const property = await scraper.getDetails(id);

      if (!property) {
        return reply.status(404).send({
          success: false,
          error: 'NOT_FOUND',
          message: 'Propriété non trouvée.'
        });
      }

      return {
        success: true,
        data: property
      };

    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'FETCH_ERROR',
        message: 'Erreur lors de la récupération de la propriété.'
      });
    }
  });

  // Supprimer une propriété du cache (admin)
  fastify.delete('/:id', {
    schema: {
      tags: ['Propriétés'],
      summary: 'Supprimer une propriété du cache',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' }
        }
      },
      security: [{ apiKey: [] }]
    },
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { id } = request.params;

    try {
      await prisma.property.delete({
        where: { id }
      });

      return {
        success: true,
        message: 'Propriété supprimée du cache.'
      };

    } catch (error) {
      if (error.code === 'P2025') {
        return reply.status(404).send({
          success: false,
          error: 'NOT_FOUND',
          message: 'Propriété non trouvée.'
        });
      }

      request.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'DELETE_ERROR',
        message: 'Erreur lors de la suppression.'
      });
    }
  });
}
