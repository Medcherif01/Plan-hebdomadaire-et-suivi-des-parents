# 🔑 Instructions pour configurer la clé API de secours

## ✅ Votre clé de secours

**Important :** La clé API de secours vous a été fournie par message privé. Ne la partagez jamais publiquement.

Format de la clé : `gsk_XXXXXXXXXXXXXXXXXXXXX` (commence par `gsk_`)

## 📝 Étapes de configuration

### Option 1 : Configuration sur Vercel (Recommandé si vous utilisez Vercel)

1. Connectez-vous à votre projet Vercel : https://vercel.com/dashboard
2. Sélectionnez votre projet `Plan-hebdomadaire-2026-Garcons`
3. Allez dans **Settings** → **Environment Variables**
4. Ajoutez une nouvelle variable :
   - **Name:** `GROQ_API_KEY_BACKUP`
   - **Value:** `[Votre clé de secours fournie]`
   - **Environments:** Cochez Production, Preview et Development
5. Cliquez sur **Save**
6. **Redéployez** votre application (Settings → Deployments → Redeploy)

### Option 2 : Configuration sur Railway (Si vous utilisez Railway)

1. Connectez-vous à Railway : https://railway.app/dashboard
2. Sélectionnez votre projet
3. Cliquez sur **Variables**
4. Cliquez sur **+ New Variable**
5. Ajoutez :
   - **Key:** `GROQ_API_KEY_BACKUP`
   - **Value:** `[Votre clé de secours fournie]`
6. Cliquez sur **Add**
7. Railway redéploiera automatiquement

### Option 3 : Configuration locale (Pour tester en développement)

1. À la racine du projet, créez un fichier `.env` (s'il n'existe pas déjà)
2. Ajoutez cette ligne :
   ```env
   GROQ_API_KEY_BACKUP=[Votre_clé_de_secours_fournie]
   ```
3. Sauvegardez le fichier
4. Redémarrez votre serveur Node.js

## 🔄 Comment fonctionne la rotation automatique ?

Le système essaie les clés dans cet ordre :

```
1️⃣ GROQ_API_KEY (votre clé principale)
   ↓ Si quota épuisé (erreur 429)
   
2️⃣ GROQ_API_KEY_BACKUP (clé de secours)
   ↓ Si quota épuisé (erreur 429)
   
3️⃣ GEMINI_API_KEY (fallback final)
   ↓ Si quota épuisé
   
❌ Message : "Quota API épuisé, réessayez demain"
```

## ✅ Vérification

Après configuration :

1. Générez un plan de leçon
2. Consultez les logs du serveur
3. Vous devriez voir :
   ```
   🤖 [AI Lesson Plan] Tentative 1/2 avec GROQ (llama-3.3-70b)
   ✅ [AI Lesson Plan] Succès avec GROQ (clé 1)
   ```

Si la clé principale est épuisée :
```
⚠️ [AI Lesson Plan] Quota épuisé pour clé GROQ 1, essai clé suivante...
🤖 [AI Lesson Plan] Tentative 2/2 avec GROQ (llama-3.3-70b)
✅ [AI Lesson Plan] Succès avec GROQ (clé 2)
```

## 🎯 Résumé

✅ **Système déjà implémenté** dans le code (commit 7490660)
✅ **Clé de secours fournie** par message privé
⏳ **Action requise** : Ajouter la variable d'environnement sur votre plateforme de déploiement

## 📚 Documentation complète

Consultez `CONFIGURATION_API_KEYS.md` pour plus de détails sur le système de rotation.

---

**Note importante :** Ne commitez JAMAIS le fichier `.env` dans Git. Il est déjà dans `.gitignore`.

**Date :** 2026-02-12
