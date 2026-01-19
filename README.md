# 🏠 Immo Scraper API

API de scraping de données immobilières publiques en France. Monétisable avec système d'authentification, quotas et plans tarifaires.

## 🚀 Fonctionnalités

- ✅ Recherche de propriétés (vente/location)
- ✅ Filtres avancés (ville, prix, surface, type...)
- ✅ Recherche géographique (par coordonnées GPS)
- ✅ Statistiques du marché (prix moyens, tendances)
- ✅ Authentification par clé API
- ✅ Rate limiting et quotas par plan
- ✅ Documentation Swagger interactive
- ✅ Cache des données en base

---

## 📋 Prérequis

- Node.js 18+ 
- npm ou yarn
- (Optionnel) PostgreSQL pour la production

---

## 🛠️ Installation locale

### Étape 1 : Cloner et installer

```bash
# Créer le dossier et copier les fichiers
cd immo-api

# Installer les dépendances
npm install
```

### Étape 2 : Configuration

```bash
# Copier le fichier de configuration
cp .env.example .env

# Éditer le fichier .env si nécessaire
nano .env
```

### Étape 3 : Initialiser la base de données

```bash
# Générer le client Prisma
npx prisma generate

# Créer la base de données et les tables
npx prisma db push

# (Optionnel) Voir la base de données
npx prisma studio
```

### Étape 4 : Lancer l'API

```bash
# Mode développement (avec rechargement automatique)
npm run dev

# Mode production
npm start
```

L'API sera accessible sur : http://localhost:3000

---

## 📚 Documentation API

Une fois l'API lancée, accédez à la documentation interactive :

👉 **http://localhost:3000/docs**

---

## 🔑 Utilisation

### 1. Créer un compte et obtenir une clé API

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "votre@email.com", "name": "Votre Nom"}'
```

Réponse :
```json
{
  "success": true,
  "data": {
    "userId": "...",
    "email": "votre@email.com",
    "apiKey": "immo_xxxxxxxxxxxxxxxxxxxxxxxx",
    "plan": "free",
    "quotas": {
      "requestsPerMonth": 100,
      "ratePerMinute": 10
    }
  }
}
```

### 2. Rechercher des propriétés

```bash
curl -X GET "http://localhost:3000/api/search?city=Paris&transactionType=vente&limit=10" \
  -H "X-API-Key: immo_votre_cle_api"
```

### 3. Obtenir des statistiques

```bash
curl -X GET "http://localhost:3000/api/stats/market?city=Paris&transactionType=vente" \
  -H "X-API-Key: immo_votre_cle_api"
```

### 4. Vérifier son usage

```bash
curl -X GET "http://localhost:3000/api/auth/me" \
  -H "X-API-Key: immo_votre_cle_api"
```

---

## 🌐 Déploiement en production

### Option 1 : Railway (Recommandé pour débuter)

1. Créer un compte sur [railway.app](https://railway.app)
2. Connecter votre repo GitHub
3. Ajouter les variables d'environnement :
   ```
   DATABASE_URL=postgresql://...
   NODE_ENV=production
   PORT=3000
   ```
4. Déployer !

**Coût** : ~5€/mois pour commencer

### Option 2 : Render

1. Créer un compte sur [render.com](https://render.com)
2. Créer un "Web Service"
3. Connecter votre repo
4. Configurer :
   - Build Command: `npm install && npx prisma generate && npx prisma db push`
   - Start Command: `npm start`
5. Ajouter une base PostgreSQL

**Coût** : Gratuit pour commencer, puis ~7€/mois

### Option 3 : VPS (Hetzner, DigitalOcean)

```bash
# Sur le serveur
git clone votre-repo
cd immo-api
npm install
cp .env.example .env
# Configurer .env avec PostgreSQL

# Installer PM2 pour garder l'app en vie
npm install -g pm2
pm2 start npm --name "immo-api" -- start
pm2 save
pm2 startup
```

**Coût** : ~4€/mois (Hetzner CX11)

### Configuration PostgreSQL pour production

Modifier `.env` :
```
DATABASE_URL="postgresql://user:password@host:5432/immo_api?schema=public"
```

Modifier `prisma/schema.prisma` :
```prisma
datasource db {
  provider = "postgresql"  // Changer de "sqlite" à "postgresql"
  url      = env("DATABASE_URL")
}
```

Puis :
```bash
npx prisma generate
npx prisma db push
```

---

## 💰 Monétisation

### Intégrer Stripe

1. Créer un compte [Stripe](https://stripe.com)
2. Installer le SDK : `npm install stripe`
3. Créer les produits et prix dans le dashboard Stripe
4. Implémenter les webhooks pour gérer les abonnements

### Plans suggérés

| Plan | Prix | Requêtes/mois | Rate limit |
|------|------|---------------|------------|
| Free | 0€ | 100 | 10/min |
| Starter | 9€ | 5 000 | 30/min |
| Pro | 49€ | 50 000 | 100/min |
| Business | 199€ | 500 000 | 300/min |

### Page de tarification

Créer une landing page avec :
- Présentation de l'API
- Documentation
- Tarifs
- Inscription

Outils recommandés : Next.js, Astro, ou simple HTML/Tailwind

---

## 🔧 Personnalisation

### Ajouter de vraies sources de scraping

Modifier `src/services/scraper.js` pour ajouter de vrais scrapers. **Important** :

1. Vérifier les conditions d'utilisation des sites
2. Respecter le fichier `robots.txt`
3. Ajouter des délais entre les requêtes
4. Utiliser des proxies si nécessaire

### Exemple de scraper réel (structure)

```javascript
async scrapeRealSource(params) {
  // 1. Construire l'URL de recherche
  const url = buildSearchUrl(params);
  
  // 2. Récupérer la page
  const response = await httpClient.get(url);
  
  // 3. Parser le HTML
  const $ = cheerio.load(response.data);
  
  // 4. Extraire les données
  const properties = [];
  $('.listing-item').each((i, el) => {
    properties.push({
      title: $(el).find('.title').text(),
      price: this.parsePrice($(el).find('.price').text()),
      // ...
    });
  });
  
  // 5. Retourner les résultats
  return properties;
}
```

---

## 📁 Structure du projet

```
immo-api/
├── prisma/
│   └── schema.prisma      # Schéma de base de données
├── src/
│   ├── index.js           # Point d'entrée
│   ├── middleware/
│   │   └── auth.js        # Authentification
│   ├── routes/
│   │   ├── auth.js        # Routes d'authentification
│   │   ├── properties.js  # Routes des propriétés
│   │   ├── search.js      # Routes de recherche
│   │   └── stats.js       # Routes de statistiques
│   ├── services/
│   │   └── scraper.js     # Service de scraping
│   └── utils/
│       └── helpers.js     # Utilitaires
├── .env.example           # Exemple de configuration
├── package.json
└── README.md
```

---

## 🐛 Dépannage

### Erreur "Cannot find module '@prisma/client'"
```bash
npx prisma generate
```

### Erreur de base de données
```bash
npx prisma db push --force-reset
```

### Port déjà utilisé
```bash
PORT=3001 npm run dev
```

---

## 📞 Support

- Documentation : `/docs`
- Issues : GitHub Issues
- Email : support@votre-domaine.com

---

## 📄 Licence

MIT - Libre d'utilisation commerciale

---

**Bonne chance avec ton API ! 🚀**
