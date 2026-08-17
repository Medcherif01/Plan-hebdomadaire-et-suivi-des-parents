# Configuration des Clés API - Système de Rotation Automatique

## 🔄 Vue d'ensemble

Le système utilise un mécanisme de **rotation automatique** des clés API pour garantir une disponibilité maximale du service de génération de plans de leçons IA.

## 📋 Ordre de priorité (Fallback en cascade)

```
1. GROQ_API_KEY (clé principale)
   ↓ Si quota épuisé (429)
2. GROQ_API_KEY_BACKUP (clé de secours)
   ↓ Si quota épuisé (429)
3. GEMINI_API_KEY (fallback final)
   ↓ Si quota épuisé
4. Message d'erreur : "Toutes les APIs ont atteint leur limite"
```

## ⚙️ Configuration des Variables d'Environnement

### Sur Vercel / Railway / Autres plateformes

Ajoutez ces variables d'environnement dans votre plateforme de déploiement :

```env
# Clé GROQ principale
GROQ_API_KEY=gsk_votre_cle_principale_ici

# Clé GROQ de secours (IMPORTANTE pour continuité du service)
GROQ_API_KEY_BACKUP=gsk_votre_cle_de_secours_ici

# Clé GEMINI (fallback final)
GEMINI_API_KEY=votre_cle_gemini_ici
```

### ⚠️ Important

- **GROQ_API_KEY_BACKUP** : Cette clé est automatiquement utilisée si la clé principale est épuisée
- Si vous n'avez qu'une seule clé GROQ, laissez `GROQ_API_KEY_BACKUP` vide, le système passera directement à GEMINI
- Le système essaie **toutes** les clés GROQ avant de passer à GEMINI

## 🎯 Avantages du Système

### ✅ Haute Disponibilité
- Pas d'interruption de service même si une clé atteint sa limite
- Rotation automatique transparente pour l'utilisateur

### ✅ Résilience
- Jusqu'à **3 niveaux de secours** (GROQ 1 → GROQ 2 → GEMINI)
- Continue de fonctionner tant qu'une clé est valide

### ✅ Logs Détaillés
Le système affiche dans les logs quelle clé/API a été utilisée :
```
✅ [AI Lesson Plan] Succès avec GROQ (clé 1)
⚠️ [AI Lesson Plan] Quota épuisé pour clé GROQ 1, essai clé suivante...
✅ [AI Lesson Plan] Succès avec GROQ (clé 2)
```

## 🔧 Comment obtenir des clés API supplémentaires ?

### GROQ API (Recommandé)
1. Créez un compte sur https://console.groq.com
2. Générez une nouvelle clé API
3. Ajoutez-la comme `GROQ_API_KEY_BACKUP`

**Quota gratuit GROQ :** ~14,400 requêtes/jour par clé

### GEMINI API
1. Accédez à https://makersuite.google.com/app/apikey
2. Créez une clé API
3. Ajoutez-la comme `GEMINI_API_KEY`

**Quota gratuit GEMINI :** ~60 requêtes/minute

## 📊 Surveillance

Le système log automatiquement :
- Quelle clé est utilisée pour chaque génération
- Quand une clé atteint son quota
- Quand le système passe à la clé suivante
- Les erreurs éventuelles

## 🚨 Que faire si toutes les clés sont épuisées ?

Les utilisateurs verront le message :
```
⚠️ Quota API épuisé ! La limite d'utilisation gratuite de l'IA a été atteinte aujourd'hui. 
Veuillez réessayer demain ou contacter l'administrateur.
```

**Solutions :**
1. Attendre le lendemain (les quotas se réinitialisent chaque jour)
2. Ajouter plus de clés GROQ de secours
3. Passer à un plan payant pour une des APIs

## 💡 Bonnes Pratiques

1. **Toujours configurer au moins 2 clés GROQ** pour une disponibilité maximale
2. **Monitorer les logs** pour anticiper les épuisements de quota
3. **Avoir GEMINI configuré** comme filet de sécurité final
4. **Rotation des comptes** : Créer plusieurs comptes GROQ gratuits pour multiplier les quotas

---

**Date de mise à jour :** 2026-02-12
**Version du système :** 2.0 (Rotation automatique)
