# 🚂 Guide de Déploiement Railway - Plan Hebdomadaire Garçons

## ✅ Problèmes Résolus

### 1️⃣ **Erreur: `SyntaxError: Identifier 'PORT' has already been declared`**
**Cause:** Railway redémarre l'application plusieurs fois, Node.js gardait l'ancien module en cache.

**Solution:**
```javascript
// Protection contre les chargements multiples
if (global.appInstance) {
  console.log('⚠️ Module déjà chargé, réutilisation');
  module.exports = global.appInstance;
  return;
}
```

### 2️⃣ **Logs de Diagnostic Améliorés**
Au démarrage, le serveur affiche maintenant :
```
✅ Server is running and listening on 0.0.0.0:8080
🚀 Environment: production
🔑 IA Provider: GROQ (llama-3.3-70b)
📊 MongoDB: ✅ Configured
📄 Templates: ✅ Configured
```

---

## 🔧 Configuration Railway Requise

### Variables d'Environnement Obligatoires

#### 1. **GROQ_API_KEY** (Recommandé - Quota Élevé)
```bash
GROQ_API_KEY=gsk_votre_cle_ici
```
- **Obtenir la clé:** https://console.groq.com/
- **Avantages:** 
  - Quota gratuit généreux (~14,400 requêtes/jour)
  - Modèle: `llama-3.3-70b-versatile`
  - Plus rapide que GEMINI

#### 2. **GEMINI_API_KEY** (Fallback Automatique)
```bash
GEMINI_API_KEY=votre_cle_gemini
```
- Utilisé automatiquement si GROQ indisponible
- Quota limité: ~20 requêtes/jour (gratuit)

#### 3. **MONGO_URL** (Base de données)
```bash
MONGO_URL=mongodb+srv://username:password@cluster.mongodb.net/planhebdo?retryWrites=true&w=majority
```

#### 4. **Templates Word**
```bash
LESSON_TEMPLATE_URL=https://votre-url-template-lecon.docx
WORD_TEMPLATE_URL=https://votre-url-template-rapport.docx
```

#### 5. **Web Push (Notifications - Optionnel)**
```bash
VAPID_PUBLIC_KEY=votre_cle_publique
VAPID_PRIVATE_KEY=votre_cle_privee
VAPID_SUBJECT=mailto:admin@plan-hebdomadaire.com
```

#### 6. **Autres Variables**
```bash
NODE_ENV=production
PORT=8080  # Auto-configuré par Railway, pas besoin de le définir
```

---

## 🚀 Étapes de Déploiement

### Étape 1: Créer un Projet Railway
1. Aller sur https://railway.app/
2. Connecter votre compte GitHub
3. Cliquer sur **"New Project"**
4. Sélectionner **"Deploy from GitHub repo"**
5. Choisir: `medch24/Plan-hebdomadaire-2026-Garcons`

### Étape 2: Configurer les Variables
1. Dans le projet Railway, aller dans **"Variables"**
2. Ajouter toutes les variables ci-dessus
3. Sauvegarder

### Étape 3: Vérifier le Déploiement
1. Aller dans **"Deployments"**
2. Attendre que le build soit vert ✅
3. Cliquer sur **"View Logs"**
4. Vérifier les logs de démarrage :
```
✅ Server is running and listening on 0.0.0.0:8080
🚀 Environment: production
🔑 IA Provider: GROQ (llama-3.3-70b)
📊 MongoDB: ✅ Configured
📄 Templates: ✅ Configured
```

### Étape 4: Obtenir l'URL de Production
1. Dans **"Settings" → "Domains"**
2. Railway génère automatiquement une URL :
   ```
   https://plan-hebdomadaire-2026-garcons-production.up.railway.app
   ```
3. Copier cette URL

### Étape 5: Tester l'Application
1. Ouvrir l'URL de production
2. Tester la connexion
3. Tester la génération de plans de leçon :
   - **Bouton disquette (💾)** : génération simple (1 plan)
   - **Bouton violet global** : génération multiple (ZIP)

---

## 🐛 Diagnostic et Résolution de Problèmes

### Problème 1: Serveur ne démarre pas
**Symptômes:**
```
Error: Cannot find module 'express'
```

**Solution:**
```bash
# Railway devrait installer automatiquement via package.json
# Si nécessaire, vérifier package.json contient toutes les dépendances
```

### Problème 2: Erreur MongoDB
**Symptômes:**
```
❌ MongoDB: ❌ Missing
MongoServerError: Authentication failed
```

**Solution:**
1. Vérifier `MONGO_URL` dans les variables Railway
2. S'assurer que l'IP de Railway est autorisée dans MongoDB Atlas :
   - MongoDB Atlas → Network Access → Add IP Address
   - Ajouter: `0.0.0.0/0` (tous les IPs) ou l'IP spécifique de Railway

### Problème 3: Rate Limit 429
**Symptômes:**
```
❌ Erreur: API GROQ error 429: Rate limit reached
```

**Solution:**
- Le système de **retry automatique** est activé (3 tentatives avec délais)
- Si persistant, vérifier votre quota GROQ sur https://console.groq.com/
- Passer à un plan payant si nécessaire (~$0.10-0.30 par million de tokens)

### Problème 4: Templates Word introuvables
**Symptômes:**
```
❌ 503: L'URL du modèle de leçon Word n'est pas configurée
```

**Solution:**
1. Uploader vos templates Word sur un hébergement (Dropbox, Google Drive public, etc.)
2. Copier les URLs directes
3. Ajouter `LESSON_TEMPLATE_URL` et `WORD_TEMPLATE_URL` dans Railway

---

## 📊 Monitoring et Logs

### Voir les Logs en Temps Réel
```bash
# Via Railway Dashboard
Deployments → Dernier déploiement → View Logs
```

### Logs à Surveiller

#### ✅ Démarrage Réussi
```
✅ Server is running and listening on 0.0.0.0:8080
🚀 Environment: production
🔑 IA Provider: GROQ (llama-3.3-70b)
📊 MongoDB: ✅ Configured
📄 Templates: ✅ Configured
```

#### ⚠️ Avertissements
```
⚠️ Web Push VAPID non configuré, notifications désactivées
```

#### ❌ Erreurs
```
❌ [Multiple AI] Erreur ligne 5: API GROQ error 429
❌ MongoDB: ❌ Missing
❌ 503: L'URL du modèle de leçon Word n'est pas configurée
```

---

## 🎯 Fonctionnalités Disponibles

### 1. Génération Simple (Bouton Disquette 💾)
- **Route:** `/api/generate-ai-lesson-plan`
- **Input:** `{ week, rowData }`
- **Output:** Fichier `.docx` (plan de leçon)
- **Durée:** ~5 secondes par plan

### 2. Génération Multiple (Bouton Violet)
- **Route:** `/api/generate-multiple-ai-lesson-plans`
- **Input:** `{ week, rowsData[] }`
- **Output:** Fichier `.zip` contenant :
  - Plans `.docx` générés
  - `00_LIGNES_IGNOREES.txt` (leçons vides filtrées)
  - `ERREUR_XX.txt` (détails des échecs)
  - `99_RECAPITULATIF.txt` (statistiques finales)
- **Durée:** ~3-5 secondes × nombre de plans + délais anti-rate-limit

### 3. Système de Retry Automatique
- **3 tentatives** en cas d'erreur 429 (rate limit)
- Délais progressifs : **5s → 10s → 20s**
- Génère un fichier d'erreur détaillé si échec persistant

### 4. Délais Adaptatifs
- **1-10 plans** : 3 secondes entre chaque
- **11-20 plans** : 5 secondes entre chaque
- **21+ plans** : 8 secondes entre chaque

---

## 🔐 Sécurité

### Bonnes Pratiques
1. **Ne jamais commiter les clés API** dans Git
2. Utiliser les variables d'environnement Railway
3. Limiter l'accès MongoDB avec IP whitelisting
4. Activer HTTPS (automatique sur Railway)

### Rotation des Clés
Si une clé API est compromise :
1. Révoquer l'ancienne clé sur GROQ/GEMINI console
2. Générer une nouvelle clé
3. Mettre à jour dans Railway Variables
4. Redéployer automatiquement

---

## 📈 Performance et Optimisation

### Temps de Génération Attendus

| Plans | Durée Estimée | Détails |
|-------|--------------|---------|
| 1 plan | ~5 secondes | Génération simple |
| 5 plans | ~30 secondes | 5s × 5 + délais 3s |
| 10 plans | ~1 minute | 5s × 10 + délais 3s |
| 26 plans | ~3-4 minutes | 5s × 26 + délais 3-8s |

### Optimisations Actives
✅ Filtrage des leçons vides AVANT génération  
✅ Téléchargement du template Word UNE SEULE FOIS  
✅ Compression ZIP niveau 9 pour réduire la taille  
✅ Retry automatique pour maximiser le taux de réussite  

---

## 🆘 Support

### Problème Persiste ?
1. **Vérifier les logs Railway** en temps réel
2. **Consulter le fichier `99_RECAPITULATIF.txt`** dans le ZIP généré
3. **Lire les fichiers `ERREUR_XX.txt`** pour détails des échecs
4. **Attendre 10 minutes** après une erreur 429 et réessayer
5. **Vérifier votre quota GROQ** : https://console.groq.com/

### Contacts Utiles
- **Railway Documentation:** https://docs.railway.app/
- **GROQ Console:** https://console.groq.com/
- **MongoDB Atlas:** https://cloud.mongodb.com/

---

## 📦 Commits Récents

**Commit `0d43d6e`:**
```
fix(railway): Protection module + logs détaillés démarrage

✅ Protection contre rechargements Node.js multiples
✅ Logs de diagnostic complets au démarrage
✅ Vérification statut MongoDB et templates
✅ Affichage provider IA configuré (GROQ/GEMINI)
```

**Commits Précédents:**
- `daf3672`: Application complète améliorations Plans de Leçon IA
- `3fc254c`: Guide des modifications appliquées

---

## ✅ Checklist Finale

- [x] Code déployé sur GitHub
- [x] Protection contre rechargements multiples
- [x] Logs de diagnostic au démarrage
- [ ] **À FAIRE:** Configurer GROQ_API_KEY sur Railway
- [ ] **À FAIRE:** Vérifier MongoDB accessible depuis Railway
- [ ] **À FAIRE:** Tester génération simple (5 plans)
- [ ] **À FAIRE:** Tester génération multiple (26 plans)

---

🎉 **Le code est prêt et déployé !**  
Il ne reste plus qu'à configurer les variables d'environnement sur Railway et tester l'application.
