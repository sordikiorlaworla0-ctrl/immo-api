// Scheduler - Tâches planifiées pour le scraping automatique
import cron from 'node-cron';
import { dvfScraper } from './dvfScraper.js';

/**
 * Gestionnaire des tâches planifiées
 */
export class Scheduler {
  constructor() {
    this.jobs = [];
    this.isRunning = false;
    this.lastRun = null;
    this.lastResult = null;
  }

  /**
   * Démarrer toutes les tâches planifiées
   */
  start() {
    console.log('\n⏰ Démarrage du scheduler...');

    // Scraping toutes les 6 heures (à 00:00, 06:00, 12:00, 18:00)
    const scrapingJob = cron.schedule('0 */6 * * *', async () => {
      await this.runScraping();
    }, {
      scheduled: true,
      timezone: 'Europe/Paris'
    });

    this.jobs.push(scrapingJob);

    console.log('✅ Tâches planifiées:');
    console.log('   📍 Scraping DVF: toutes les 6 heures');
    console.log('');

    // Lancer un premier scraping au démarrage (en différé)
    setTimeout(async () => {
      console.log('🔄 Premier scraping initial dans 30 secondes...');
    }, 5000);
  }

  /**
   * Exécuter le scraping manuellement
   */
  async runScraping() {
    if (this.isRunning) {
      console.log('⚠️ Scraping déjà en cours, ignoré.');
      return null;
    }

    this.isRunning = true;
    console.log('\n🤖 Lancement automatique du scraping...');

    try {
      const result = await dvfScraper.scrapeAll();
      this.lastRun = new Date();
      this.lastResult = result;
      return result;
    } catch (error) {
      console.error('❌ Erreur lors du scraping:', error.message);
      return null;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Obtenir le statut du scheduler
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastRun: this.lastRun,
      lastResult: this.lastResult,
      nextRun: this.getNextRun(),
      jobs: this.jobs.length
    };
  }

  /**
   * Calculer la prochaine exécution
   */
  getNextRun() {
    const now = new Date();
    const hours = now.getHours();
    const nextHour = Math.ceil((hours + 1) / 6) * 6;
    const next = new Date(now);
    
    if (nextHour >= 24) {
      next.setDate(next.getDate() + 1);
      next.setHours(0, 0, 0, 0);
    } else {
      next.setHours(nextHour, 0, 0, 0);
    }
    
    return next;
  }

  /**
   * Arrêter toutes les tâches
   */
  stop() {
    console.log('🛑 Arrêt du scheduler...');
    this.jobs.forEach(job => job.stop());
    this.jobs = [];
  }
}

// Export de l'instance singleton
export const scheduler = new Scheduler();
