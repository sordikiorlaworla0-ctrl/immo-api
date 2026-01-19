// Service de scraping des données DVF (Demandes de Valeurs Foncières)
// Source: API officielle du gouvernement français - 100% légal et gratuit
// Documentation: https://api.gouv.fr/les-api/api-dvf

import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Configuration de l'API DVF
const DVF_API_BASE = 'https://api.cquest.org/dvf';

// Liste des départements à scraper
const DEPARTEMENTS = [
  '75', // Paris
  '92', // Hauts-de-Seine
  '93', // Seine-Saint-Denis
  '94', // Val-de-Marne
  '69', // Rhône (Lyon)
  '13', // Bouches-du-Rhône (Marseille)
  '33', // Gironde (Bordeaux)
  '31', // Haute-Garonne (Toulouse)
  '44', // Loire-Atlantique (Nantes)
  '06', // Alpes-Maritimes (Nice)
];

// Types de biens
const TYPE_LOCAL_MAP = {
  'Appartement': 'appartement',
  'Maison': 'maison',
  'Dépendance': 'dependance',
  'Local industriel. commercial ou assimilé': 'local_commercial',
};

/**
 * Scraper DVF - Données réelles des ventes immobilières
 */
export class DVFScraper {
  constructor() {
    this.httpClient = axios.create({
      timeout: 30000,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'ImmoScraperAPI/1.0'
      }
    });
  }

  /**
   * Scraper les mutations pour un département
   */
  async scrapeDepartement(codeDepartement, annee = 2023) {
    try {
      console.log(`📍 Scraping département ${codeDepartement} (${annee})...`);
      
      const url = `${DVF_API_BASE}?code_departement=${codeDepartement}&annee_mutation=${annee}&page=1&per_page=500`;
      
      const response = await this.httpClient.get(url);
      
      if (!response.data || !response.data.resultats) {
        console.log(`   Pas de données pour ${codeDepartement}`);
        return [];
      }

      const mutations = response.data.resultats;
      console.log(`   ✅ ${mutations.length} transactions trouvées`);
      
      return mutations;
    } catch (error) {
      console.error(`   ❌ Erreur département ${codeDepartement}:`, error.message);
      return [];
    }
  }

  /**
   * Convertir une mutation DVF en propriété
   */
  mutationToProperty(mutation) {
    // Filtrer les ventes sans prix ou surface
    if (!mutation.valeur_fonciere || !mutation.surface_reelle_bati) {
      return null;
    }

    const price = parseFloat(mutation.valeur_fonciere);
    const surface = parseFloat(mutation.surface_reelle_bati);
    
    // Ignorer les transactions trop petites ou trop grandes
    if (price < 10000 || price > 50000000 || surface < 9 || surface > 1000) {
      return null;
    }

    const propertyType = TYPE_LOCAL_MAP[mutation.type_local] || 'autre';
    const pricePerSqm = Math.round(price / surface);

    return {
      externalId: `DVF_${mutation.id_mutation || Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      source: 'dvf_gouv',
      title: `${mutation.type_local || 'Bien'} ${mutation.nombre_pieces_principales || ''} pièces - ${mutation.commune || 'France'}`.trim(),
      description: `Vente immobilière à ${mutation.commune || 'N/A'} (${mutation.code_postal || 'N/A'}). Surface: ${surface}m². ${mutation.nombre_pieces_principales || 'N/A'} pièces.`,
      price: price,
      pricePerSqm: pricePerSqm,
      surface: surface,
      rooms: mutation.nombre_pieces_principales ? parseInt(mutation.nombre_pieces_principales) : null,
      bedrooms: null,
      propertyType: propertyType,
      transactionType: 'vente',
      city: mutation.commune || null,
      postalCode: mutation.code_postal || null,
      department: mutation.code_departement || null,
      region: this.getRegionFromDepartement(mutation.code_departement),
      latitude: mutation.latitude ? parseFloat(mutation.latitude) : null,
      longitude: mutation.longitude ? parseFloat(mutation.longitude) : null,
      imageUrls: JSON.stringify([]),
      url: `https://app.dvf.etalab.gouv.fr/`,
      publishedAt: mutation.date_mutation ? new Date(mutation.date_mutation) : new Date(),
      scrapedAt: new Date()
    };
  }

  /**
   * Obtenir la région depuis le département
   */
  getRegionFromDepartement(dep) {
    const regions = {
      '75': 'Île-de-France', '92': 'Île-de-France', '93': 'Île-de-France', '94': 'Île-de-France',
      '91': 'Île-de-France', '77': 'Île-de-France', '78': 'Île-de-France', '95': 'Île-de-France',
      '69': 'Auvergne-Rhône-Alpes',
      '13': 'Provence-Alpes-Côte d\'Azur', '06': 'Provence-Alpes-Côte d\'Azur',
      '33': 'Nouvelle-Aquitaine',
      '31': 'Occitanie',
      '44': 'Pays de la Loire',
    };
    return regions[dep] || 'France';
  }

  /**
   * Sauvegarder les propriétés en base
   */
  async saveProperties(properties) {
    let saved = 0;
    let errors = 0;

    for (const prop of properties) {
      try {
        await prisma.property.upsert({
          where: { externalId: prop.externalId },
          update: {
            ...prop,
            updatedAt: new Date()
          },
          create: prop
        });
        saved++;
      } catch (error) {
        errors++;
      }
    }

    return { saved, errors };
  }

  /**
   * Lancer le scraping complet
   */
  async scrapeAll() {
    console.log('\n🚀 Démarrage du scraping DVF...');
    console.log(`📅 Date: ${new Date().toLocaleString('fr-FR')}`);
    console.log('─'.repeat(50));

    let totalProperties = [];
    const annees = [2023, 2022]; // Années à scraper

    for (const annee of annees) {
      console.log(`\n📆 Année ${annee}:`);
      
      for (const dep of DEPARTEMENTS) {
        const mutations = await this.scrapeDepartement(dep, annee);
        
        // Convertir en propriétés
        const properties = mutations
          .map(m => this.mutationToProperty(m))
          .filter(p => p !== null);
        
        totalProperties = totalProperties.concat(properties);
        
        // Pause pour ne pas surcharger l'API
        await this.delay(500);
      }
    }

    console.log('\n─'.repeat(50));
    console.log(`📊 Total: ${totalProperties.length} propriétés récupérées`);

    // Sauvegarder en base
    console.log('💾 Sauvegarde en base de données...');
    const result = await this.saveProperties(totalProperties);
    
    console.log(`✅ ${result.saved} propriétés sauvegardées`);
    if (result.errors > 0) {
      console.log(`⚠️ ${result.errors} erreurs`);
    }

    console.log('\n🎉 Scraping terminé !');
    console.log('─'.repeat(50));

    return {
      total: totalProperties.length,
      saved: result.saved,
      errors: result.errors,
      scrapedAt: new Date()
    };
  }

  /**
   * Délai async
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export de l'instance
export const dvfScraper = new DVFScraper();
