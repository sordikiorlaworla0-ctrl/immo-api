// Script pour initialiser la base de données avec les plans et données de test
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Initialisation de la base de données...\n');

  // Créer les plans tarifaires
  console.log('📋 Création des plans tarifaires...');
  
  const plans = [
    {
      name: 'free',
      displayName: 'Gratuit',
      price: 0,
      requestsLimit: 100,
      rateLimit: 10,
      features: JSON.stringify([
        '100 requêtes/mois',
        'Données de base',
        'Support email'
      ])
    },
    {
      name: 'starter',
      displayName: 'Starter',
      price: 9,
      requestsLimit: 5000,
      rateLimit: 30,
      features: JSON.stringify([
        '5 000 requêtes/mois',
        'Toutes les données',
        'Support prioritaire',
        'Statistiques basiques'
      ])
    },
    {
      name: 'pro',
      displayName: 'Pro',
      price: 49,
      requestsLimit: 50000,
      rateLimit: 100,
      features: JSON.stringify([
        '50 000 requêtes/mois',
        'Toutes les données',
        'Support prioritaire 24/7',
        'Statistiques avancées',
        'API de recherche géo',
        'Webhooks'
      ])
    },
    {
      name: 'business',
      displayName: 'Business',
      price: 199,
      requestsLimit: 500000,
      rateLimit: 300,
      features: JSON.stringify([
        '500 000 requêtes/mois',
        'Toutes les fonctionnalités',
        'Support dédié',
        'SLA garanti',
        'Données en temps réel',
        'IP dédiée',
        'Intégration sur mesure'
      ])
    }
  ];

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { name: plan.name },
      update: plan,
      create: plan
    });
    console.log(`  ✅ Plan "${plan.displayName}" créé`);
  }

  // Créer quelques propriétés de démonstration
  console.log('\n🏠 Création de propriétés de démonstration...');

  const demoProperties = [
    {
      externalId: 'DEMO001',
      source: 'demo',
      title: 'Appartement 3 pièces - Paris 11ème',
      description: 'Bel appartement lumineux de 65m² au 3ème étage avec ascenseur. 2 chambres, cuisine équipée, parquet ancien.',
      price: 520000,
      pricePerSqm: 8000,
      surface: 65,
      rooms: 3,
      bedrooms: 2,
      propertyType: 'appartement',
      transactionType: 'vente',
      city: 'Paris',
      postalCode: '75011',
      department: '75',
      region: 'Île-de-France',
      latitude: 48.8589,
      longitude: 2.3803,
      imageUrls: JSON.stringify(['https://picsum.photos/seed/demo1/800/600']),
      url: 'https://example.com/demo/1',
      publishedAt: new Date()
    },
    {
      externalId: 'DEMO002',
      source: 'demo',
      title: 'Maison 5 pièces avec jardin - Lyon',
      description: 'Maison familiale de 120m² avec jardin de 200m². 4 chambres, garage, proche écoles et commerces.',
      price: 450000,
      pricePerSqm: 3750,
      surface: 120,
      rooms: 5,
      bedrooms: 4,
      propertyType: 'maison',
      transactionType: 'vente',
      city: 'Lyon',
      postalCode: '69003',
      department: '69',
      region: 'Auvergne-Rhône-Alpes',
      latitude: 45.7578,
      longitude: 4.8422,
      imageUrls: JSON.stringify(['https://picsum.photos/seed/demo2/800/600']),
      url: 'https://example.com/demo/2',
      publishedAt: new Date()
    },
    {
      externalId: 'DEMO003',
      source: 'demo',
      title: 'Studio meublé - Bordeaux centre',
      description: 'Studio de 25m² entièrement meublé et équipé. Idéal étudiant ou investissement locatif.',
      price: 650,
      pricePerSqm: 26,
      surface: 25,
      rooms: 1,
      bedrooms: 0,
      propertyType: 'studio',
      transactionType: 'location',
      city: 'Bordeaux',
      postalCode: '33000',
      department: '33',
      region: 'Nouvelle-Aquitaine',
      latitude: 44.8378,
      longitude: -0.5792,
      imageUrls: JSON.stringify(['https://picsum.photos/seed/demo3/800/600']),
      url: 'https://example.com/demo/3',
      publishedAt: new Date()
    },
    {
      externalId: 'DEMO004',
      source: 'demo',
      title: 'Appartement T4 vue mer - Nice',
      description: 'Superbe T4 de 90m² avec terrasse et vue mer. Standing, piscine résidence, parking.',
      price: 750000,
      pricePerSqm: 8333,
      surface: 90,
      rooms: 4,
      bedrooms: 3,
      propertyType: 'appartement',
      transactionType: 'vente',
      city: 'Nice',
      postalCode: '06000',
      department: '06',
      region: 'Provence-Alpes-Côte d\'Azur',
      latitude: 43.7102,
      longitude: 7.2620,
      imageUrls: JSON.stringify(['https://picsum.photos/seed/demo4/800/600']),
      url: 'https://example.com/demo/4',
      publishedAt: new Date()
    },
    {
      externalId: 'DEMO005',
      source: 'demo',
      title: 'Loft industriel - Marseille',
      description: 'Loft atypique de 150m² dans ancienne usine réhabilitée. Volumes exceptionnels, verrière.',
      price: 380000,
      pricePerSqm: 2533,
      surface: 150,
      rooms: 4,
      bedrooms: 2,
      propertyType: 'loft',
      transactionType: 'vente',
      city: 'Marseille',
      postalCode: '13002',
      department: '13',
      region: 'Provence-Alpes-Côte d\'Azur',
      latitude: 43.2965,
      longitude: 5.3698,
      imageUrls: JSON.stringify(['https://picsum.photos/seed/demo5/800/600']),
      url: 'https://example.com/demo/5',
      publishedAt: new Date()
    }
  ];

  for (const property of demoProperties) {
    await prisma.property.upsert({
      where: { externalId: property.externalId },
      update: property,
      create: property
    });
  }
  console.log(`  ✅ ${demoProperties.length} propriétés de démonstration créées`);

  console.log('\n✨ Base de données initialisée avec succès !');
  console.log('\n📝 Prochaines étapes :');
  console.log('   1. Lancer l\'API : npm run dev');
  console.log('   2. Créer un compte : POST /api/auth/register');
  console.log('   3. Tester l\'API : GET /api/search?city=Paris');
  console.log('   4. Voir la doc : http://localhost:3000/docs\n');
}

main()
  .catch((e) => {
    console.error('❌ Erreur:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
