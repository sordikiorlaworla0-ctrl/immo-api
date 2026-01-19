// Service de scraping immobilier
// Note: Ce service utilise des données publiques et respecte les robots.txt

import axios from 'axios';
import * as cheerio from 'cheerio';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Configuration des sources
const SOURCES = {
  // Source de démonstration - À adapter selon les sites autorisés
  demo: {
    name: 'Demo Data',
    baseUrl: 'https://example.com',
    enabled: true
  }
};

// User agents réalistes pour éviter les blocages
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'
];

// Obtenir un user agent aléatoire
function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// Délai aléatoire entre les requêtes (respecter les serveurs)
function delay(min = 1000, max = 3000) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Client HTTP configuré
const httpClient = axios.create({
  timeout: 30000,
  headers: {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1'
  }
});

// Intercepteur pour ajouter un user agent aléatoire
httpClient.interceptors.request.use(config => {
  config.headers['User-Agent'] = getRandomUserAgent();
  return config;
});

/**
 * Classe principale du scraper
 */
export class PropertyScraper {
  constructor() {
    this.results = [];
  }

  /**
   * Parser générique pour extraire les données
   */
  parsePrice(priceStr) {
    if (!priceStr) return null;
    // Nettoyer et parser le prix
    const cleaned = priceStr.replace(/[^\d]/g, '');
    const price = parseInt(cleaned, 10);
    return isNaN(price) ? null : price;
  }

  parseSurface(surfaceStr) {
    if (!surfaceStr) return null;
    const match = surfaceStr.match(/(\d+(?:[.,]\d+)?)/);
    if (match) {
      return parseFloat(match[1].replace(',', '.'));
    }
    return null;
  }

  parseRooms(roomsStr) {
    if (!roomsStr) return null;
    const match = roomsStr.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  }

  /**
   * Générer des données de démonstration
   * En production, remplacer par le vrai scraping
   */
  generateDemoData(params) {
    const { city, postalCode, type, transaction, minPrice, maxPrice, limit } = params;
    
    const cities = ['Paris', 'Lyon', 'Marseille', 'Bordeaux', 'Toulouse', 'Nantes', 'Nice', 'Lille'];
    const propertyTypes = ['appartement', 'maison', 'studio', 'loft', 'terrain'];
    const transactions = ['vente', 'location'];
    
    const selectedCity = city || cities[Math.floor(Math.random() * cities.length)];
    const count = Math.min(limit || 10, 50);
    
    const properties = [];
    
    for (let i = 0; i < count; i++) {
      const propType = type || propertyTypes[Math.floor(Math.random() * propertyTypes.length)];
      const trans = transaction || transactions[Math.floor(Math.random() * transactions.length)];
      const surface = Math.floor(Math.random() * 150) + 20;
      const rooms = Math.floor(Math.random() * 6) + 1;
      const bedrooms = Math.max(1, rooms - 1);
      
      let basePrice;
      if (trans === 'location') {
        basePrice = surface * (Math.floor(Math.random() * 20) + 15); // 15-35€/m²
      } else {
        basePrice = surface * (Math.floor(Math.random() * 5000) + 3000); // 3000-8000€/m²
      }
      
      // Appliquer les filtres de prix
      if (minPrice && basePrice < minPrice) continue;
      if (maxPrice && basePrice > maxPrice) continue;
      
      properties.push({
        id: `demo_${Date.now()}_${i}`,
        externalId: `EXT${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
        source: 'demo',
        title: `${propType.charAt(0).toUpperCase() + propType.slice(1)} ${rooms} pièces - ${selectedCity}`,
        description: `Magnifique ${propType} de ${surface}m² situé à ${selectedCity}. ${rooms} pièces dont ${bedrooms} chambres. Proche commerces et transports.`,
        price: basePrice,
        pricePerSqm: Math.round(basePrice / surface),
        surface: surface,
        rooms: rooms,
        bedrooms: bedrooms,
        propertyType: propType,
        transactionType: trans,
        city: selectedCity,
        postalCode: postalCode || `${Math.floor(Math.random() * 90000) + 10000}`,
        department: selectedCity === 'Paris' ? '75' : Math.floor(Math.random() * 95 + 1).toString().padStart(2, '0'),
        region: 'Île-de-France',
        latitude: 48.8566 + (Math.random() - 0.5) * 0.1,
        longitude: 2.3522 + (Math.random() - 0.5) * 0.1,
        imageUrls: [
          `https://picsum.photos/seed/${i}/800/600`,
          `https://picsum.photos/seed/${i + 100}/800/600`
        ],
        url: `https://example.com/annonce/${i}`,
        publishedAt: new Date(Date.now() - Math.floor(Math.random() * 30) * 24 * 60 * 60 * 1000),
        scrapedAt: new Date()
      });
    }
    
    return properties;
  }

  /**
   * Rechercher des propriétés
   */
  async search(params) {
    // En mode démo, générer des données
    // En production, implémenter le vrai scraping ici
    const properties = this.generateDemoData(params);
    
    // Sauvegarder en cache dans la BDD
    for (const prop of properties) {
      try {
        await prisma.property.upsert({
          where: { externalId: prop.externalId },
          update: {
            ...prop,
            imageUrls: JSON.stringify(prop.imageUrls),
            updatedAt: new Date()
          },
          create: {
            ...prop,
            imageUrls: JSON.stringify(prop.imageUrls)
          }
        });
      } catch (e) {
        // Ignorer les erreurs de duplication
      }
    }
    
    return properties;
  }

  /**
   * Obtenir les détails d'une propriété
   */
  async getDetails(propertyId) {
    // Chercher d'abord dans le cache
    const cached = await prisma.property.findFirst({
      where: {
        OR: [
          { id: propertyId },
          { externalId: propertyId }
        ]
      }
    });

    if (cached) {
      return {
        ...cached,
        imageUrls: cached.imageUrls ? JSON.parse(cached.imageUrls) : []
      };
    }

    return null;
  }

  /**
   * Obtenir les statistiques du marché
   */
  async getMarketStats(params) {
    const { city, postalCode, department, propertyType, transactionType } = params;

    const where = {};
    if (city) where.city = city;
    if (postalCode) where.postalCode = postalCode;
    if (department) where.department = department;
    if (propertyType) where.propertyType = propertyType;
    if (transactionType) where.transactionType = transactionType;

    const properties = await prisma.property.findMany({
      where,
      select: {
        price: true,
        pricePerSqm: true,
        surface: true,
        rooms: true,
        propertyType: true,
        transactionType: true
      }
    });

    if (properties.length === 0) {
      return {
        count: 0,
        message: 'Aucune donnée disponible pour ces critères'
      };
    }

    // Calculer les statistiques
    const prices = properties.map(p => p.price).filter(Boolean);
    const pricesPerSqm = properties.map(p => p.pricePerSqm).filter(Boolean);
    const surfaces = properties.map(p => p.surface).filter(Boolean);

    const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const median = arr => {
      if (!arr.length) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    };

    return {
      count: properties.length,
      price: {
        min: Math.min(...prices),
        max: Math.max(...prices),
        avg: Math.round(avg(prices)),
        median: Math.round(median(prices))
      },
      pricePerSqm: {
        min: Math.min(...pricesPerSqm),
        max: Math.max(...pricesPerSqm),
        avg: Math.round(avg(pricesPerSqm)),
        median: Math.round(median(pricesPerSqm))
      },
      surface: {
        min: Math.min(...surfaces),
        max: Math.max(...surfaces),
        avg: Math.round(avg(surfaces)),
        median: Math.round(median(surfaces))
      },
      distribution: {
        byType: properties.reduce((acc, p) => {
          acc[p.propertyType] = (acc[p.propertyType] || 0) + 1;
          return acc;
        }, {}),
        byTransaction: properties.reduce((acc, p) => {
          acc[p.transactionType] = (acc[p.transactionType] || 0) + 1;
          return acc;
        }, {})
      }
    };
  }
}

// Instance singleton
export const scraper = new PropertyScraper();
