// api/index.js — v1, sélection dynamique du modèle, sortie JSON via prompt (sans generationConfig)

// Protection contre les chargements multiples du module (Railway/Serverless)
if (global.appInstance) {
  console.log('⚠️ Module api/index.js déjà chargé, réutilisation de l\'instance existante');
  module.exports = global.appInstance;
  return;
}

const express = require('express');
const cors = require('cors');
const fileUpload = require('express-fileupload');
const XLSX = require('xlsx');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const fetch = require('node-fetch');
const { MongoClient } = require('mongodb');
const archiver = require('archiver');
const webpush = require('web-push');
const path = require('path');
const moment = require('moment');
const crypto = require('crypto');
// ========================================================================
// ====================== AIDES POUR GÉNÉRATION WORD ======================
// ========================================================================

const xmlEscape = (str) => {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
};

const containsArabic = (text) => {
  if (typeof text !== 'string') return false;
  const arabicRegex = /[\u0600-\u06FF]/;
  return arabicRegex.test(text);
};

const formatTextForWord = (text, options = {}) => {
  if (!text || typeof text !== 'string' || text.trim() === '') {
    return '<w:p/>';
  }
  
  // Nettoyer le texte : supprimer les espaces/sauts de ligne avant et après
  const cleanedText = text.trim();
  
  const { color, italic } = options;
  const runPropertiesParts = [];
  runPropertiesParts.push('<w:sz w:val="22"/><w:szCs w:val="22"/>');
  if (color) runPropertiesParts.push(`<w:color w:val="${color}"/>`);
  if (italic) runPropertiesParts.push('<w:i/><w:iCs w:val="true"/>');

  let paragraphProperties = '';
  if (containsArabic(cleanedText)) {
    // Pour le texte arabe : RTL + centré
    paragraphProperties = '<w:pPr><w:bidi/><w:jc w:val="center"/></w:pPr>';
    runPropertiesParts.push('<w:rtl/>');
  }

  const runProperties = `<w:rPr>${runPropertiesParts.join('')}</w:rPr>`;
  
  // Conserver uniquement les sauts de ligne intentionnels de l'enseignant
  const lines = cleanedText.split(/\r\n|\n|\r/);
  const content = lines
    .map(line => `<w:t xml:space="preserve">${xmlEscape(line)}</w:t>`)
    .join('<w:br/>');
  return `<w:p>${paragraphProperties}<w:r>${runProperties}${content}</w:r></w:p>`;
};

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(fileUpload());
// --- CONFIGURATION POUR LE FRONTEND ---
// On définit le chemin vers le dossier public (qui est un dossier parent à 'api')
const publicPath = path.join(__dirname, '..', 'public');

// 1. On dit à Express de rendre accessibles les fichiers statiques (CSS, JS, Images)
app.use(express.static(publicPath));

// 2. Route pour la page d'accueil (Health Check de Railway)
app.get('/', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

// 3. Route de secours pour le diagnostic (optionnel)
app.get('/diagnostic', (req, res) => {
  res.sendFile(path.join(publicPath, 'diagnostic.html'));
});
// --------------------------------------
const MONGO_URL = process.env.MONGO_URL;
const WORD_TEMPLATE_URL = process.env.WORD_TEMPLATE_URL;
const LESSON_TEMPLATE_URL = process.env.LESSON_TEMPLATE_URL;

// ========================================================================
// GENERATEURS DE SYSTEME DE SECOURS POUR TEMPLATES WORD (DOCX)
// ========================================================================
function createDefaultLessonTemplateZip() {
  const zip = new PizZip();
  
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);

  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`);

  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t>PLAN DE LEÇON - {Matiere}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Enseignant : {NomEnseignant} | Classe : {Classe} | Semaine : {Semaine} | Jour : {Jour} ({Date})</w:t></w:r></w:p>
    <w:p><w:r><w:t>Titre du cours / Leçon : {Lecon}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Unité : {TitreUnite}</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Objectifs d'apprentissage :</w:t></w:r></w:p>
    <w:p><w:r><w:t>{Objectifs}</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Méthodes &amp; Outils :</w:t></w:r></w:p>
    <w:p><w:r><w:t>Méthodes : {Methodes} | Outils : {Outils}</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Déroulement de la séance :</w:t></w:r></w:p>
    <w:p><w:r><w:t>{Contenu}</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Ressources :</w:t></w:r></w:p>
    <w:p><w:r><w:t>{Ressources}</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Devoirs à la maison :</w:t></w:r></w:p>
    <w:p><w:r><w:t>{Devoirs}</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Différenciation :</w:t></w:r></w:p>
    <w:p><w:r><w:t>Soutien : {DiffLents} | Enrichissement : {DiffTresPerf} | Classe : {DiffTous}</w:t></w:r></w:p>
  </w:body>
</w:document>`);

  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function createDefaultWordTemplateZip() {
  const zip = new PizZip();
  
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);

  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`);

  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t>PLAN HEBDOMADAIRE - CLASSE {classe}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Semaine {semaine} ({plageSemaine})</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Remarques générales / Notes :</w:t></w:r></w:p>
    <w:p><w:r><w:t>{notes}</w:t></w:r></w:p>
    {#jours}
    <w:p><w:r><w:rPr><w:b/><w:color w:val="2563EB"/></w:rPr><w:t>Jour : {jourDateComplete}</w:t></w:r></w:p>
    {#matieres}
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Matière : {matiere}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Leçon : {Lecon}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Travail de classe : {travailDeClasse}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Support : {Support}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Devoirs : {devoirs}</w:t></w:r></w:p>
    {/matieres}
    {/jours}
  </w:body>
</w:document>`);

  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

async function getLessonTemplateBuffer() {
  const url = process.env.LESSON_TEMPLATE_URL || LESSON_TEMPLATE_URL;
  if (url && typeof url === 'string' && url.trim().startsWith('http')) {
    try {
      console.log(`📡 Téléchargement modèle leçon depuis: ${url}`);
      const resp = await fetch(url);
      if (resp.ok) {
        const buf = Buffer.from(await resp.arrayBuffer());
        if (buf && buf.length > 100) return buf;
      }
      console.warn(`⚠️ Téléchargement modèle leçon échoué (HTTP ${resp.status}), utilisation du modèle intégré de secours.`);
    } catch (err) {
      console.warn(`⚠️ Exception téléchargement modèle leçon: ${err.message}, utilisation du modèle intégré.`);
    }
  }
  return createDefaultLessonTemplateZip();
}

async function getWordTemplateBuffer() {
  const url = process.env.WORD_TEMPLATE_URL || WORD_TEMPLATE_URL;
  if (url && typeof url === 'string' && url.trim().startsWith('http')) {
    try {
      console.log(`📡 Téléchargement modèle hebdo depuis: ${url}`);
      const resp = await fetch(url);
      if (resp.ok) {
        const buf = Buffer.from(await resp.arrayBuffer());
        if (buf && buf.length > 100) return buf;
      }
      console.warn(`⚠️ Téléchargement modèle hebdo échoué (HTTP ${resp.status}), utilisation du modèle intégré de secours.`);
    } catch (err) {
      console.warn(`⚠️ Exception téléchargement modèle hebdo: ${err.message}, utilisation du modèle intégré.`);
    }
  }
  return createDefaultWordTemplateZip();
}

// Configuration IA Providers (GROQ et GEMINI)
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const USE_GROQ = GROQ_API_KEY ? true : false;
const AI_API_KEY = USE_GROQ ? GROQ_API_KEY : GEMINI_API_KEY;

// Configuration Web Push (VAPID)
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BDuAoL4lagqZmYl4BPdCFYBwRhoqGMrcWUFAbF1pMBWq2e0JOV6fL_WitURlXXhXTROGB2vYpnvgSDZfAoZq0Jo';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'TVK1zF6o5s-SK3OQnGCMgu4KZCNxg3py4YA4sMqtItg';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@plan-hebdomadaire.com';

// Configuration de web-push avec les clés VAPID
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    VAPID_SUBJECT,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
  console.log('✅ Web Push VAPID configuré');
} else {
  console.warn('⚠️ Clés VAPID manquantes - notifications push désactivées');
}

const arabicTeachers = ['Majed', 'Jaber', 'Imad', 'Saeed'];
const englishTeachers = ['Kamel'];

const maleTeachers = [
  'Mohamed', 'Abas', 'Jaber', 'Imad', 'Kamel', 'Majed', 'Mohamed Ali', 'Morched', 
  'Saeed', 'Sami', 'Sylvano', 'Tonga', 'Oumarou', 'Zine', 'Youssouf'
];

const femaleTeachers = [
  'Amina', 'Fatima', 'Khadija', 'Mariam', 'Salma', 'Zainab', 'Nour', 'Houda', 
  'Leila', 'Sarah', 'Zohra'
];

const defaultWeeksConfig = {
  1: { title: "Semaine 1", titleAr: "الأسبوع 1", start: "2026-08-30", end: "2026-09-03" },
  2: { title: "Semaine 2", titleAr: "الأسبوع 2", start: "2026-09-06", end: "2026-09-10" },
  3: { title: "Semaine 3", titleAr: "الأسبوع 3", start: "2026-09-13", end: "2026-09-17" },
  4: { title: "Semaine 4", titleAr: "الأسبوع 4", start: "2026-09-20", end: "2026-09-24" },
  5: { title: "Semaine 5", titleAr: "الأسبوع 5", start: "2026-09-27", end: "2026-10-01" },
  6: { title: "Semaine 6", titleAr: "الأسبوع 6", start: "2026-10-04", end: "2026-10-08" },
  7: { title: "Semaine 7", titleAr: "الأسبوع 7", start: "2026-10-11", end: "2026-10-15" },
  8: { title: "Semaine 8", titleAr: "الأسبوع 8", start: "2026-10-18", end: "2026-10-22" },
  9: { title: "Semaine 9", titleAr: "الأسبوع 9", start: "2026-10-25", end: "2026-10-29" },
  10: { title: "Semaine 10", titleAr: "الأسبوع 10", start: "2026-11-01", end: "2026-11-05" },
  11: { title: "Semaine 11", titleAr: "الأسبوع 11", start: "2026-11-08", end: "2026-11-12" },
  12: { title: "Semaine 12", titleAr: "الأسبوع 12", start: "2026-11-15", end: "2026-11-19" },
  13: { title: "Semaine 13", titleAr: "الأسبوع 13", start: "2026-11-29", end: "2026-12-03" },
  14: { title: "Semaine 14", titleAr: "الأسبوع 14", start: "2026-12-06", end: "2026-12-10" },
  15: { title: "Semaine 15", titleAr: "الأسبوع 15", start: "2026-12-13", end: "2026-12-17" },
  16: { title: "Semaine 16", titleAr: "الأسبوع 16", start: "2026-12-20", end: "2026-12-24" },
  17: { title: "Semaine 17", titleAr: "الأسبوع 17", start: "2026-12-27", end: "2026-12-31" },
  18: { title: "Semaine 18", titleAr: "الأسبوع 18", start: "2027-01-03", end: "2027-01-07" },
  19: { title: "Semaine 19", titleAr: "الأسبوع 19", start: "2027-01-17", end: "2027-01-21" },
  20: { title: "Semaine 20", titleAr: "الأسبوع 20", start: "2027-01-24", end: "2027-01-28" },
  21: { title: "Semaine 21", titleAr: "الأسبوع 21", start: "2027-01-31", end: "2027-02-04" },
  22: { title: "Semaine 22", titleAr: "الأسبوع 22", start: "2027-02-07", end: "2027-02-11" },
  23: { title: "Semaine 23", titleAr: "الأسبوع 23", start: "2027-02-14", end: "2027-02-18" },
  24: { title: "Semaine 24", titleAr: "الأسبوع 24", start: "2027-02-21", end: "2027-02-25" },
  25: { title: "Semaine 25", titleAr: "الأسبوع 25", start: "2027-03-14", end: "2027-03-18" },
  26: { title: "Semaine 26", titleAr: "الأسبوع 26", start: "2027-03-21", end: "2027-03-25" },
  27: { title: "Semaine 27", titleAr: "الأسبوع 27", start: "2027-03-28", end: "2027-04-01" },
  28: { title: "Semaine 28", titleAr: "الأسبوع 28", start: "2027-04-04", end: "2027-04-08" },
  29: { title: "Semaine 29", titleAr: "الأسبوع 29", start: "2027-04-11", end: "2027-04-15" },
  30: { title: "Semaine 30", titleAr: "الأسبوع 30", start: "2027-04-18", end: "2027-04-22" },
  31: { title: "Semaine 31", titleAr: "الأسبوع 31", start: "2027-04-25", end: "2027-04-29" },
  32: { title: "Semaine 32", titleAr: "الأسبوع 32", start: "2027-05-02", end: "2027-05-06" },
  33: { title: "Semaine 33", titleAr: "الأسبوع 33", start: "2027-05-23", end: "2027-05-27" },
  34: { title: "Semaine 34", titleAr: "الأسبوع 34", start: "2027-05-30", end: "2027-06-03" },
  35: { title: "Semaine 35", titleAr: "الأسبوع 35", start: "2027-06-06", end: "2027-06-10" },
  36: { title: "Semaine 36", titleAr: "الأسبوع 36", start: "2027-06-13", end: "2027-06-17" },
  37: { title: "Semaine 37", titleAr: "الأسبوع 37", start: "2027-06-20", end: "2027-06-24" },
  38: { title: "Semaine 38", titleAr: "الأسبوع 38", start: "2027-06-27", end: "2027-06-30" }
};

const specificWeekDateRangesNode = {};
for (const [wNum, wData] of Object.entries(defaultWeeksConfig)) {
  specificWeekDateRangesNode[wNum] = { start: wData.start, end: wData.end };
}

const validUsers = {
  // Garçons
  "Mohamed": "Mohamed", "Abas": "Abas", "Jaber": "Jaber", "Imad": "Imad", "Kamel": "Kamel",
  "Majed": "Majed", "Mohamed Ali": "Mohamed Ali", "Morched": "Morched",
  "Saeed": "Saeed", "Sami": "Sami", "Sylvano": "Sylvano", "Tonga": "Tonga", "Oumarou": "Oumarou", "Zine": "Zine", "Youssouf": "Youssouf",
  // Filles
  "Amina": "Amina", "Fatima": "Fatima", "Khadija": "Khadija", "Mariam": "Mariam",
  "Salma": "Salma", "Zainab": "Zainab", "Nour": "Nour", "Houda": "Houda",
  "Leila": "Leila", "Sarah": "Sarah", "Zohra": "Zohra"
};

let cachedDb = null;

class InMemoryCollection {
  constructor(name) {
    this.name = name;
    this.items = [];
  }

  async findOne(query) {
    return this.items.find(item => this._matches(item, query)) || null;
  }

  find(query = {}, options = {}) {
    let result = this.items.filter(item => this._matches(item, query));
    const cursor = {
      sort: (sortObj) => cursor,
      projection: (projObj) => cursor,
      toArray: async () => result,
    };
    return cursor;
  }

  async insertOne(doc) {
    const newItem = { _id: doc._id || String(Date.now()) + Math.random().toString(36).substr(2, 5), ...doc };
    this.items.push(newItem);
    return { acknowledged: true, insertedId: newItem._id };
  }

  async insertMany(docs) {
    const insertedIds = {};
    docs.forEach((doc, idx) => {
      const newItem = { _id: doc._id || String(Date.now()) + idx, ...doc };
      this.items.push(newItem);
      insertedIds[idx] = newItem._id;
    });
    return { acknowledged: true, insertedIds };
  }

  async updateOne(filter, update, options = {}) {
    let index = this.items.findIndex(item => this._matches(item, filter));
    if (index >= 0) {
      if (update.$set) {
        Object.assign(this.items[index], update.$set);
      }
      return { modifiedCount: 1, matchedCount: 1 };
    } else if (options.upsert) {
      const newItem = { _id: filter._id || filter.endpoint || filter.week || String(Date.now()) };
      if (update.$set) Object.assign(newItem, update.$set);
      if (update.$setOnInsert) Object.assign(newItem, update.$setOnInsert);
      this.items.push(newItem);
      return { modifiedCount: 0, matchedCount: 0, upsertedCount: 1 };
    }
    return { modifiedCount: 0, matchedCount: 0 };
  }

  async updateMany(filter, update) {
    let count = 0;
    this.items.forEach(item => {
      if (this._matches(item, filter)) {
        if (update.$set) Object.assign(item, update.$set);
        count++;
      }
    });
    return { modifiedCount: count, matchedCount: count };
  }

  async deleteOne(filter) {
    const index = this.items.findIndex(item => this._matches(item, filter));
    if (index >= 0) {
      this.items.splice(index, 1);
      return { deletedCount: 1 };
    }
    return { deletedCount: 0 };
  }

  async deleteMany(filter) {
    const initialLen = this.items.length;
    this.items = this.items.filter(item => !this._matches(item, filter));
    return { deletedCount: initialLen - this.items.length };
  }

  async countDocuments(query = {}) {
    return this.items.filter(item => this._matches(item, query)).length;
  }

  async distinct(field, query = {}) {
    const matched = this.items.filter(item => this._matches(item, query));
    const set = new Set();
    matched.forEach(item => {
      const parts = field.split('.');
      let val = item;
      for (const p of parts) {
        if (Array.isArray(val)) {
          val.forEach(v => { if (v && v[p]) set.add(v[p]); });
          return;
        } else if (val && typeof val === 'object') {
          val = val[p];
        } else {
          val = undefined;
          break;
        }
      }
      if (val !== undefined && val !== null && val !== "") {
        set.add(val);
      }
    });
    return Array.from(set);
  }

  _matches(item, query) {
    if (!query || Object.keys(query).length === 0) return true;
    for (const key of Object.keys(query)) {
      const qVal = query[key];
      const iVal = item[key];
      if (typeof qVal === 'object' && qVal !== null) {
        if (qVal.$in && Array.isArray(qVal.$in)) {
          if (!qVal.$in.includes(iVal)) return false;
        } else if (qVal.$ne !== undefined) {
          if (iVal === qVal.$ne) return false;
        }
      } else {
        if (iVal !== qVal) return false;
      }
    }
    return true;
  }
}

class InMemoryDb {
  constructor() {
    this.collections = new Map();
  }

  collection(name) {
    if (!this.collections.has(name)) {
      this.collections.set(name, new InMemoryCollection(name));
    }
    return this.collections.get(name);
  }
}

async function connectToDatabase() {
  if (cachedDb) return cachedDb;
  const mongoUrl = (process.env.MONGO_URL || MONGO_URL || '').trim();
  if (!mongoUrl || (!mongoUrl.startsWith('mongodb://') && !mongoUrl.startsWith('mongodb+srv://'))) {
    cachedDb = new InMemoryDb();
    return cachedDb;
  }
  try {
    const client = new MongoClient(mongoUrl, { connectTimeoutMS: 5000, serverSelectionTimeoutMS: 5000 });
    await client.connect();
    const db = client.db();
    cachedDb = db;
    return db;
  } catch (err) {
    cachedDb = new InMemoryDb();
    return cachedDb;
  }
}

function formatDateFrenchNode(date) {
  if (!date || isNaN(date.getTime())) return "Date invalide";
  const days = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
  const months = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
  const dayName = days[date.getUTCDay()];
  const dayNum = String(date.getUTCDate()).padStart(2, '0');
  const monthName = months[date.getUTCMonth()];
  const yearNum = date.getUTCFullYear();
  return `${dayName} ${dayNum} ${monthName} ${yearNum}`;
}
function extractDayNameFromString(dayString) {
  if (!dayString || typeof dayString !== 'string') return null;
  const trimmed = dayString.trim();
  const dayNames = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi"];
  
  // Check if it's already just a day name
  if (dayNames.includes(trimmed)) {
    return trimmed;
  }
  
  // Extract day name from formatted date (e.g., "Dimanche 07 Décembre 2025")
  for (const dayName of dayNames) {
    if (trimmed.startsWith(dayName)) {
      return dayName;
    }
  }
  
  return null;
}

function getDateForDayNameNode(weekStartDate, dayName) {
  if (!weekStartDate || isNaN(weekStartDate.getTime())) return null;
  const dayOrder = { "Dimanche": 0, "Lundi": 1, "Mardi": 2, "Mercredi": 3, "Jeudi": 4 };
  const offset = dayOrder[dayName];
  if (offset === undefined) return null;
  const specificDate = new Date(Date.UTC(
    weekStartDate.getUTCFullYear(),
    weekStartDate.getUTCMonth(),
    weekStartDate.getUTCDate()
  ));
  specificDate.setUTCDate(specificDate.getUTCDate() + offset);
  return specificDate;
}
const findKey = (obj, target) => obj ? Object.keys(obj).find(k => k.trim().toLowerCase() === target.toLowerCase()) : undefined;

// ======================= Fonction utilitaire pour les noms de fichiers ==
const sanitizeForFilename = (str) => {
  if (typeof str !== 'string') str = String(str);
  const normalized = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return normalized
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '_')
    .replace(/__+/g, '_');
};

// ======================= Sélection dynamique du modèle ==================

/**
 * Liste les modèles disponibles via l'API v1 et retourne le premier modèle
 * correspondant à la liste de préférence ET supportant generateContent.
 *
 * On gère les changements de noms (EoL des 1.5, arrivée des 2.5, etc.).
 */
async function resolveGeminiModel(apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Impossible de lister les modèles (HTTP ${resp.status}) ${body}`);
  }
  const json = await resp.json();
  const models = Array.isArray(json.models) ? json.models : [];

  // Préférence (ordre décroissant) – ajuste si besoin selon tes coûts/perf
  const preferredNames = [
    // Généraux actuels
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-2.5-flash-lite",
    // Anciennes séries (si encore exposées pour ta clé)
    "gemini-1.5-flash-001",
    "gemini-1.5-pro-002",
    "gemini-1.5-flash"
  ];

  const nameSet = new Map(models.map(m => [m.name, m]));
  // Cherche d'abord dans les préférés
  for (const short of preferredNames) {
    const full = `models/${short}`;
    const m = nameSet.get(full);
    if (m && Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent")) {
      return short;
    }
  }
  // Sinon, prends le premier qui supporte generateContent
  const any = models.find(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent"));
  if (any) return any.name.replace(/^models\//, "");

  throw new Error("Aucun modèle compatible v1 trouvé pour votre clé (generateContent). Vérifiez l'accès de la clé et l'API activée.");
}

// ------------------------- Web Push Subscriptions -------------------------

app.post('/api/subscribe', async (req, res) => {
  try {
    const subscription = req.body.subscription;
    const username = req.body.username;
    if (!subscription || !username) {
      return res.status(400).json({ message: 'Subscription et username requis.' });
    }

    const db = await connectToDatabase();
    // Utiliser l'endpoint comme _id pour garantir l'unicité de l'abonnement
    await db.collection('subscriptions').updateOne(
      { _id: subscription.endpoint },
      { $set: { subscription: subscription, username: username, createdAt: new Date() } },
      { upsert: true }
    );

    res.status(201).json({ message: 'Abonnement enregistré.' });
  } catch (error) {
    console.error('Erreur MongoDB /subscribe:', error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

app.post('/api/unsubscribe', async (req, res) => {
  try {
    const endpoint = req.body.endpoint;
    if (!endpoint) {
      return res.status(400).json({ message: 'Endpoint requis.' });
    }

    const db = await connectToDatabase();
    await db.collection('subscriptions').deleteOne({ _id: endpoint });

    res.status(200).json({ message: 'Abonnement supprimé.' });
  } catch (error) {
    console.error('Erreur MongoDB /unsubscribe:', error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// ------------------------- Rappels Automatiques (Cron) -------------------------

// Fonction utilitaire pour déterminer la semaine actuelle
function getCurrentWeekNumber() {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0); // Utiliser UTC pour la comparaison avec les dates stockées

  for (const week in specificWeekDateRangesNode) {
    const dates = specificWeekDateRangesNode[week];
    const startDate = new Date(dates.start + 'T00:00:00Z');
    const endDate = new Date(dates.end + 'T00:00:00Z');

    // Ajouter un jour à la date de fin pour inclure le dernier jour
    endDate.setUTCDate(endDate.getUTCDate() + 1);

    if (today >= startDate && today <= endDate) {
      return parseInt(week, 10);
    }
  }
  return null; // Semaine non trouvée
}

app.get('/api/send-reminders', async (req, res) => {
  try {
    const weekNumber = getCurrentWeekNumber();
    if (!weekNumber) {
      console.log('⚠️ Semaine actuelle non définie dans la configuration.');
      return res.status(200).json({ message: 'Semaine actuelle non définie.' });
    }

    const db = await connectToDatabase();
    const planDocument = await db.collection('plans').findOne({ week: weekNumber });

    if (!planDocument || !planDocument.data || planDocument.data.length === 0) {
      console.log(`⚠️ Aucun plan trouvé pour la semaine ${weekNumber}.`);
      return res.status(200).json({ message: `Aucun plan trouvé pour la semaine ${weekNumber}.` });
    }

    // 1. Identifier les enseignants avec au moins une leçon vide
    const teachersToRemind = new Set();
    const leconKey = findKey(planDocument.data[0] || {}, 'Leçon');

    if (leconKey) {
      planDocument.data.forEach(row => {
        const enseignantKey = findKey(row, 'Enseignant');
        const enseignant = enseignantKey ? row[enseignantKey] : null;
        const lecon = row[leconKey];

        // Si l'enseignant est valide et la leçon est vide ou non définie
        if (enseignant && (!lecon || lecon.trim() === '')) {
          teachersToRemind.add(enseignant);
        }
      });
    }

    if (teachersToRemind.size === 0) {
      console.log(`✅ Tous les plans de la semaine ${weekNumber} semblent complets.`);
      return res.status(200).json({ message: 'Tous les plans sont complets. Aucun rappel envoyé.' });
    }

    console.log(`🔔 Enseignants à rappeler pour S${weekNumber}:`, Array.from(teachersToRemind));

    // 2. Récupérer les abonnements pour ces enseignants
    const subscriptions = await db.collection('subscriptions').find({
      username: { $in: Array.from(teachersToRemind) }
    }).toArray();

    if (subscriptions.length === 0) {
      console.log('⚠️ Aucun abonnement push trouvé pour les enseignants à rappeler.');
      return res.status(200).json({ message: 'Aucun abonnement push trouvé.' });
    }

    // 3. Envoyer les notifications
    const notificationPayload = JSON.stringify({
      title: 'Rappel Plan Hebdomadaire',
      body: `Veuillez compléter votre plan de leçon pour la semaine ${weekNumber}.`,
      icon: '/icons/icon-192x192.png', // Assurez-vous que cette icône existe
      data: {
        url: '/', // URL à ouvrir lors du clic sur la notification
        week: weekNumber
      }
    });

    const sendPromises = subscriptions.map(sub => {
      return webpush.sendNotification(sub.subscription, notificationPayload)
        .then(() => console.log(`Notification envoyée à ${sub.username}`))
        .catch(async (error) => {
          console.error(`Échec envoi notification à ${sub.username}:`, error);
          // Supprimer l'abonnement si l'erreur est 410 Gone (abonnement expiré)
          if (error.statusCode === 410) {
            await db.collection('subscriptions').deleteOne({ _id: sub.subscription.endpoint });
            console.log(`Abonnement expiré pour ${sub.username} supprimé.`);
          }
        });
    });

    await Promise.allSettled(sendPromises);

    res.status(200).json({ 
      message: `${sendPromises.length} rappels tentés.`,
      teachersReminded: Array.from(teachersToRemind)
    });

  } catch (error) {
    console.error('❌ Erreur serveur /send-reminders:', error);
    res.status(500).json({ message: 'Erreur interne /send-reminders.' });
  }
});

// ------------------------- Auth & CRUD simples -------------------------

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    mongoConfigured: !!MONGO_URL,
    geminiConfigured: !!GEMINI_API_KEY
  });
});

app.post('/api/login', async (req, res) => {
  try {
    console.log('[LOGIN] Requête reçue de:', req.headers['x-forwarded-for'] || req.connection.remoteAddress);
    const { username, password, section = 'garcons' } = req.body;
    console.log('[LOGIN] Tentative pour utilisateur:', username, 'dans la section:', section);
    
    if (!username || !password) {
      console.log('[LOGIN] Username ou password manquant');
      return res.status(400).json({ success: false, message: 'Nom d\'utilisateur et mot de passe requis' });
    }

    const trimmedUsername = username.trim();
    const db = await connectToDatabase();

    // Compte Administrateur Principal (Med01 avec mot de passe Med120786)
    if (trimmedUsername === 'Med01' && password === 'Med120786') {
      console.log('[LOGIN] Authentification Administrateur Med01 réussie');
      return res.status(200).json({ success: true, username: 'Med01', role: 'admin', section, language: 'fr' });
    }

    const userId = `${section}_${trimmedUsername}`;

    // 1. Vérifier si l'utilisateur a été supprimé par l'administrateur
    const isDeleted = await db.collection('deleted_users').findOne({ _id: userId });
    if (isDeleted) {
      return res.status(401).json({ success: false, message: 'Ce compte a été supprimé par l\'administrateur.' });
    }

    // 2. Contrôle de section strict (enseignantes / enseignants)
    if (section === 'garcons' && femaleTeachers.includes(trimmedUsername)) {
      return res.status(403).json({ success: false, message: `Accès refusé : L'enseignante '${trimmedUsername}' appartient à la Section Filles et ne peut pas se connecter à la Section Garçons.` });
    }
    if (section === 'filles' && maleTeachers.includes(trimmedUsername)) {
      return res.status(403).json({ success: false, message: `Accès refusé : L'enseignant '${trimmedUsername}' appartient à la Section Garçons et ne peut pas se connecter à la Section Filles.` });
    }

    // 3. Recherche stricte de l'utilisateur dans la base de données (seuls les comptes configurés par l'admin sont acceptés)
    const userDoc = await db.collection('users').findOne({ 
      username: trimmedUsername, 
      section: section 
    });

    if (userDoc && userDoc.password) {
      if (userDoc.password === password) {
        console.log('[LOGIN] Authentification réussie pour (DB):', trimmedUsername);
        let userLang = userDoc.language;
        if (!userLang) {
          userLang = arabicTeachers.includes(trimmedUsername) ? 'ar' : (englishTeachers.includes(trimmedUsername) ? 'en' : 'fr');
        }
        return res.status(200).json({ 
          success: true, 
          username: userDoc.username, 
          role: userDoc.role || 'teacher', 
          section, 
          language: userLang 
        });
      } else {
        console.log('[LOGIN] Mot de passe incorrect pour:', trimmedUsername);
        return res.status(401).json({ success: false, message: 'Mot de passe incorrect.' });
      }
    }

    console.log('[LOGIN] Compte non configuré pour:', trimmedUsername);
    res.status(401).json({ success: false, message: 'Compte ou mot de passe non configuré par l\'administrateur.' });
  } catch (error) {
    console.error('[LOGIN] CRASH in /api/login:', error);
    res.status(500).json({ success: false, message: 'Erreur interne du serveur.' });
  }
});

// --- API GESTION DES ENSEIGNANTS / COMPTES (ADMIN) ---

app.get('/api/admin/users', async (req, res) => {
  try {
    const section = req.query.section || 'garcons';
    const db = await connectToDatabase();
    
    const deletedUserDocs = await db.collection('deleted_users').find({ section }).toArray();
    const deletedUserIds = new Set(deletedUserDocs.map(d => d._id));

    let users = await db.collection('users').find({ section: section }).toArray();

    // Assurer que la liste par défaut des enseignants est visible dans le panel pour configuration facile
    const defaultList = section === 'filles' ? femaleTeachers : maleTeachers;
    const existingUserMap = new Map();
    users.forEach(u => existingUserMap.set(u.username, u));

    const completeList = [];
    for (const teacherName of defaultList) {
      const uId = `${section}_${teacherName}`;
      if (deletedUserIds.has(uId)) continue;
      
      if (existingUserMap.has(teacherName)) {
        completeList.push(existingUserMap.get(teacherName));
      } else {
        let defLang = 'fr';
        if (arabicTeachers.includes(teacherName)) defLang = 'ar';
        if (englishTeachers.includes(teacherName)) defLang = 'en';
        
        completeList.push({
          _id: uId,
          username: teacherName,
          password: '',
          section: section,
          role: 'teacher',
          language: defLang,
          isConfigured: false
        });
      }
    }

    // Ajouter les utilisateurs personnalisés ajoutés par l'admin qui ne sont pas dans defaultList
    for (const u of users) {
      if (!deletedUserIds.has(u._id) && !defaultList.includes(u.username)) {
        completeList.push(u);
      }
    }

    res.status(200).json(completeList);
  } catch (error) {
    console.error('Erreur GET /api/admin/users:', error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

app.post('/api/admin/users', async (req, res) => {
  try {
    const { username, password, section = 'garcons', role = 'teacher', language = 'fr' } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'Nom d\'utilisateur et mot de passe requis.' });
    }
    const trimmedUser = username.trim();
    const db = await connectToDatabase();

    const userId = `${section}_${trimmedUser}`;
    
    // Si l'utilisateur avait été précédemment supprimé, annuler sa suppression
    await db.collection('deleted_users').deleteOne({ _id: userId });

    await db.collection('users').updateOne(
      { _id: userId },
      { 
        $set: { 
          username: trimmedUser, 
          password: password, 
          section: section, 
          role: role, 
          language: language || 'fr',
          updatedAt: new Date() 
        } 
      },
      { upsert: true }
    );

    res.status(200).json({ message: `Compte '${trimmedUser}' enregistré (Langue: ${language}) pour la section ${section}.` });
  } catch (error) {
    console.error('Erreur POST /api/admin/users:', error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

app.delete('/api/admin/users', async (req, res) => {
  try {
    const { username, section = 'garcons' } = req.body;
    if (!username) {
      return res.status(400).json({ message: 'Nom d\'utilisateur requis.' });
    }
    const trimmedUser = username.trim();
    const db = await connectToDatabase();

    const userId = `${section}_${trimmedUser}`;
    await db.collection('users').deleteOne({ _id: userId });
    await db.collection('deleted_users').updateOne(
      { _id: userId },
      { $set: { _id: userId, username: trimmedUser, section, deletedAt: new Date() } },
      { upsert: true }
    );

    res.status(200).json({ message: `Compte '${trimmedUser}' supprimé de la section ${section}.` });
  } catch (error) {
    console.error('Erreur DELETE /api/admin/users:', error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// ============================================================================
// GESTION ET CONFIGURATION DES SEMAINES ET DATES DU CALENDRIER SCOLAIRE
// ============================================================================

async function loadWeeksConfigurationFromDb(db) {
  try {
    const configDoc = await db.collection('settings').findOne({ _id: 'weeks_configuration' });
    const mergedConfig = {};
    for (const [wNum, wData] of Object.entries(defaultWeeksConfig)) {
      mergedConfig[wNum] = { ...wData };
    }
    if (configDoc && configDoc.weeks) {
      for (const [wNum, wData] of Object.entries(configDoc.weeks)) {
        if (wData) {
          mergedConfig[wNum] = {
            title: wData.title || defaultWeeksConfig[wNum]?.title || `Semaine ${wNum}`,
            titleAr: wData.titleAr || defaultWeeksConfig[wNum]?.titleAr || `الأسبوع ${wNum}`,
            start: wData.start || defaultWeeksConfig[wNum]?.start || '',
            end: wData.end || defaultWeeksConfig[wNum]?.end || ''
          };
        }
      }
    }
    // Synchroniser en mémoire specificWeekDateRangesNode
    for (const [wNum, wData] of Object.entries(mergedConfig)) {
      specificWeekDateRangesNode[wNum] = { start: wData.start, end: wData.end };
    }
    return mergedConfig;
  } catch (err) {
    console.error('Erreur chargement weeks_configuration:', err);
    return defaultWeeksConfig;
  }
}

app.get(['/api/weeks-config', '/api/admin/weeks-config'], async (req, res) => {
  try {
    const db = await connectToDatabase();
    const weeksConfig = await loadWeeksConfigurationFromDb(db);
    res.status(200).json({ success: true, weeks: weeksConfig, defaultWeeks: defaultWeeksConfig });
  } catch (error) {
    console.error('Erreur GET /api/weeks-config:', error);
    res.status(200).json({ success: true, weeks: defaultWeeksConfig, defaultWeeks: defaultWeeksConfig });
  }
});

app.post(['/api/admin/weeks-config', '/api/weeks-config'], async (req, res) => {
  try {
    const db = await connectToDatabase();
    const { week, title, titleAr, start, end, weeks, resetToDefault } = req.body;

    if (resetToDefault) {
      await db.collection('settings').updateOne(
        { _id: 'weeks_configuration' },
        { $set: { _id: 'weeks_configuration', weeks: defaultWeeksConfig, updatedAt: new Date() } },
        { upsert: true }
      );
      for (const [wNum, wData] of Object.entries(defaultWeeksConfig)) {
        specificWeekDateRangesNode[wNum] = { start: wData.start, end: wData.end };
      }
      return res.status(200).json({
        success: true,
        message: 'Calendrier scolaire réinitialisé aux dates officielles 2026/2027.',
        weeks: defaultWeeksConfig
      });
    }

    const currentConfig = await loadWeeksConfigurationFromDb(db);

    if (weeks && typeof weeks === 'object') {
      // Mise à jour multiple
      for (const [wNum, wData] of Object.entries(weeks)) {
        if (currentConfig[wNum]) {
          currentConfig[wNum] = {
            title: wData.title !== undefined ? String(wData.title).trim() : currentConfig[wNum].title,
            titleAr: wData.titleAr !== undefined ? String(wData.titleAr).trim() : currentConfig[wNum].titleAr,
            start: wData.start !== undefined ? String(wData.start).trim() : currentConfig[wNum].start,
            end: wData.end !== undefined ? String(wData.end).trim() : currentConfig[wNum].end
          };
          specificWeekDateRangesNode[wNum] = { start: currentConfig[wNum].start, end: currentConfig[wNum].end };
        }
      }
      await db.collection('settings').updateOne(
        { _id: 'weeks_configuration' },
        { $set: { _id: 'weeks_configuration', weeks: currentConfig, updatedAt: new Date() } },
        { upsert: true }
      );
      return res.status(200).json({
        success: true,
        message: 'Toutes les semaines ont été mises à jour avec succès.',
        weeks: currentConfig
      });
    }

    if (week) {
      const wNum = parseInt(week, 10);
      if (isNaN(wNum) || wNum < 1 || wNum > 52) {
        return res.status(400).json({ message: 'Numéro de semaine invalide.' });
      }

      currentConfig[wNum] = {
        title: title !== undefined ? String(title).trim() : (currentConfig[wNum]?.title || `Semaine ${wNum}`),
        titleAr: titleAr !== undefined ? String(titleAr).trim() : (currentConfig[wNum]?.titleAr || `الأسبوع ${wNum}`),
        start: start !== undefined ? String(start).trim() : (currentConfig[wNum]?.start || ''),
        end: end !== undefined ? String(end).trim() : (currentConfig[wNum]?.end || '')
      };

      specificWeekDateRangesNode[wNum] = { start: currentConfig[wNum].start, end: currentConfig[wNum].end };

      await db.collection('settings').updateOne(
        { _id: 'weeks_configuration' },
        { $set: { _id: 'weeks_configuration', weeks: currentConfig, updatedAt: new Date() } },
        { upsert: true }
      );

      return res.status(200).json({
        success: true,
        message: `Configuration de la semaine ${wNum} mise à jour avec succès.`,
        week: wNum,
        weekData: currentConfig[wNum],
        weeks: currentConfig
      });
    }

    return res.status(400).json({ message: 'Données de semaine manquantes.' });
  } catch (error) {
    console.error('Erreur POST /api/admin/weeks-config:', error);
    res.status(500).json({ message: 'Erreur serveur lors de la mise à jour des semaines.' });
  }
});

// ============================================================================
// FONCTIONS AIDES ET HOMELOG/DEVOIRS UTILS
// ============================================================================

function convertGoogleDriveUrl(url) {
  if (!url) return url;
  const drivePattern = /https:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/;
  const match = String(url).match(drivePattern);
  if (match && match[1]) {
    return `https://lh3.googleusercontent.com/d/${match[1]}`;
  }
  return url;
}

async function deleteOldPhotos(collection) {
  try {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const result = await collection.deleteMany({ createdAt: { $lt: threeDaysAgo } });
    return result.deletedCount;
  } catch (e) {
    return 0;
  }
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

const dayNamesFr = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
function getDayNameFr(dateStr) {
  if (!dateStr) return null;
  const m = moment(dateStr);
  if (m.isValid()) {
    return dayNamesFr[m.day()];
  }
  return null;
}

const calculateDailyStar = (evaluations) => {
  if (!evaluations || evaluations.length === 0) return 0;
  const completedHomework = evaluations.filter(ev => ev.status === 'Fait').length;
  const partiallyCompleted = evaluations.filter(ev => ev.status === 'Partiellement Fait').length;
  const hasGoodParticipation = evaluations.every(ev => (ev.participation || 0) > 5);
  const hasGoodBehavior = evaluations.every(ev => (ev.behavior || 0) > 5);
  if (completedHomework === evaluations.length && hasGoodParticipation && hasGoodBehavior) {
    return 1;
  }
  const halfOrMore = (completedHomework + partiallyCompleted) >= (evaluations.length / 2);
  if (halfOrMore && hasGoodParticipation && hasGoodBehavior) {
    return 0.5;
  }
  return 0;
};

const calculateStarsLegacy = (evaluations) => {
  const evalsByDay = {};
  (evaluations || []).forEach(ev => {
    if (!evalsByDay[ev.date]) evalsByDay[ev.date] = [];
    evalsByDay[ev.date].push(ev);
  });
  let stars = 0;
  for (const date in evalsByDay) {
    const dayEvals = evalsByDay[date];
    const completedHomework = dayEvals.filter(ev => ev.status === 'Fait' || ev.status === 'Partiellement Fait').length;
    const completionRate = (completedHomework / dayEvals.length) * 100;
    const hasGoodCompletion = completionRate > 70;
    const goodBehavior = dayEvals.every(ev => (ev.behavior || 0) > 5);
    const goodParticipation = dayEvals.every(ev => (ev.participation || 0) > 5);
    if (hasGoodCompletion && goodBehavior && goodParticipation) {
      stars++;
    }
  }
  return stars;
};

const defaultStudents = {
  PEI1: [
    { name: "Faysal", photo: "https://lh3.googleusercontent.com/d/1IB6BKROX3TRxaIIHVVVWbB7-Ii-V8VrC", birthday: "4/2014" },
    { name: "Bilal", photo: "https://lh3.googleusercontent.com/d/1B0QUZJhpSad5Fs3qRTugUe4oyTlUDEVu", birthday: "2/2015" },
    { name: "Jad", photo: "https://lh3.googleusercontent.com/d/1VLvrWjeJwaClf4pSaLiwjnS79N-HrsFr", birthday: "8/2014" },
    { name: "Manaf", photo: "https://lh3.googleusercontent.com/d/1h46Tqtqcp5tNqdY62wV6pyZFYknCEMWY", birthday: "8/2014" }
  ],
  PEI2: [
    { name: "Ahmed", photo: "https://lh3.googleusercontent.com/d/1cDF-yegSB2tqsWac0AoNttbi8qAALYT1", birthday: "9/2013" },
    { name: "Yasser", photo: "https://lh3.googleusercontent.com/d/1DthaZcLUhfkkxbvaTr4o4XJENIM6ZNsz", birthday: "8/2013" },
    { name: "Eyad", photo: "https://lh3.googleusercontent.com/d/1HGyWS4cC1jWWD25Ah3WcT_eIbUHqFzJ1", birthday: "4/2013" },
    { name: "Ali", photo: "https://lh3.googleusercontent.com/d/18QAEYQWVI2HgQf9Kl_8eJ91cjE-Rjg40", birthday: "4/2013" }
  ],
  PEI3: [
    { name: "Seifeddine", photo: "https://lh3.googleusercontent.com/d/1tWdPSbtCAsTMB86WzDgqh3Xw01ahm9s6", birthday: "1/2012" },
    { name: "Mohamed", photo: "https://lh3.googleusercontent.com/d/1lB8ObGOvQDVT6FITL2y7C5TYmAGyggFn", birthday: "11/2011" },
    { name: "Wajih", photo: "https://lh3.googleusercontent.com/d/1MH6M05mQamOHevmDffVFNpSFNnxqbxs3", birthday: "6/2012" },
    { name: "Ahmad", photo: "https://lh3.googleusercontent.com/d/1zU-jBuAbYjHanzank9C1BAd00skS1Y5J", birthday: "2/2012" },
    { name: "Adam", photo: "https://lh3.googleusercontent.com/d/15I9p6VSnn1yVmPxRRbGsUkM-fsBKYOWF", birthday: "12/2012" }
  ],
  PEI4: [
    { name: "Mohamed Younes", photo: "https://lh3.googleusercontent.com/d/1ok8M9EOY71ScKuaW0mHfKUErjKZ4wbe1", birthday: "11/2011" },
    { name: "Mohamed Amine", photo: "https://lh3.googleusercontent.com/d/1UrBw6guz0oBTUy8COGeewIs3XAK773bR", birthday: "12/2012" },
    { name: "Samir", photo: "https://lh3.googleusercontent.com/d/1NdaCH8CU0DJFHXw4D0lItP-QnCswl23b", birthday: "12/2012" },
    { name: "Abdulrahman", photo: "https://lh3.googleusercontent.com/d/1yCTO5StU2tnPY0BEynnWzUveljMIUcLE", birthday: "4/2012" },
    { name: "Youssef", photo: "https://lh3.googleusercontent.com/d/1Bygg5-PYrjjMOZdI5hAe16eZ8ltn772e", birthday: "11/2011" }
  ]
};

// ============================================================================
// API GESTION DES ÉLÈVES (ADMIN)
// ============================================================================

app.get('/api/admin/students', async (req, res) => {
  try {
    const section = req.query.section || 'garcons';
    const targetClass = req.query.class;
    const db = await connectToDatabase();

    let query = { section: section };
    if (targetClass) query.class = targetClass;

    let students = await db.collection('students').find(query).toArray();

    if (!students || students.length === 0) {
      // Auto-seeding
      const seeded = [];
      for (const [cls, list] of Object.entries(defaultStudents)) {
        if (!targetClass || targetClass === cls) {
          for (const s of list) {
            const studentObj = {
              _id: `${section}_${cls}_${s.name}`,
              name: s.name,
              photo: s.photo,
              birthday: s.birthday,
              class: cls,
              section: section,
              createdAt: new Date()
            };
            await db.collection('students').updateOne(
              { _id: studentObj._id },
              { $set: studentObj },
              { upsert: true }
            );
            seeded.push(studentObj);
          }
        }
      }
      students = seeded;
    }

    res.status(200).json(students);
  } catch (error) {
    console.error('Erreur GET /api/admin/students:', error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

app.post('/api/admin/students', async (req, res) => {
  try {
    const { name, photo, birthday, class: className, section = 'garcons' } = req.body;
    if (!name || !className) {
      return res.status(400).json({ message: 'Nom et classe requis.' });
    }
    const db = await connectToDatabase();
    const studentId = `${section}_${className}_${name.trim()}`;
    const formattedPhoto = convertGoogleDriveUrl(photo || '');

    const studentData = {
      _id: studentId,
      name: name.trim(),
      photo: formattedPhoto,
      birthday: birthday || '',
      class: className,
      section: section,
      updatedAt: new Date()
    };

    await db.collection('students').updateOne(
      { _id: studentId },
      { $set: studentData },
      { upsert: true }
    );

    res.status(200).json({ message: `Élève '${name}' enregistré avec succès.`, student: studentData });
  } catch (error) {
    console.error('Erreur POST /api/admin/students:', error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

app.delete('/api/admin/students', async (req, res) => {
  try {
    const { id, name, class: className, section = 'garcons' } = req.body;
    const db = await connectToDatabase();
    const studentId = id || `${section}_${className}_${name}`;

    await db.collection('students').deleteOne({ _id: studentId });
    res.status(200).json({ message: 'Élève supprimé avec succès.' });
  } catch (error) {
    console.error('Erreur DELETE /api/admin/students:', error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

app.post('/api/admin/students/move', async (req, res) => {
  try {
    const { studentId, oldClass, newClass, name, section = 'garcons' } = req.body;
    if (!newClass) {
      return res.status(400).json({ message: 'La nouvelle classe est obligatoire.' });
    }
    const db = await connectToDatabase();

    let student = null;
    if (studentId) {
      student = await db.collection('students').findOne({ _id: studentId });
    }
    if (!student && name && oldClass) {
      student = await db.collection('students').findOne({ _id: `${section}_${oldClass}_${name}` });
    }
    if (!student && name) {
      student = await db.collection('students').findOne({ name: name, section: section });
    }

    if (!student) {
      return res.status(404).json({ message: "Élève introuvable." });
    }

    const currentOldClass = student.class || oldClass;
    const studentName = student.name;
    const currentSection = student.section || section;
    const oldId = student._id;
    const newId = `${currentSection}_${newClass}_${studentName}`;

    // Supprimer l'ancien document si l'ID a changé
    if (oldId !== newId) {
      await db.collection('students').deleteOne({ _id: oldId });
    }

    // Créer / mettre à jour avec la nouvelle classe
    const updatedStudent = {
      ...student,
      _id: newId,
      class: newClass,
      updatedAt: new Date()
    };

    await db.collection('students').updateOne(
      { _id: newId },
      { $set: updatedStudent },
      { upsert: true }
    );

    // Mettre à jour les évaluations associées à l'élève
    try {
      await db.collection('homework_evaluations').updateMany(
        { studentId: oldId },
        { $set: { studentId: newId, class: newClass } }
      );
    } catch (evalErr) {
      console.warn('Note mise à jour homework_evaluations:', evalErr.message);
    }

    res.status(200).json({
      message: `L'élève ${studentName} a été déplacé avec succès de ${currentOldClass} vers ${newClass}.`,
      student: updatedStudent
    });
  } catch (error) {
    console.error('Erreur POST /api/admin/students/move:', error);
    res.status(500).json({ message: 'Erreur lors du déplacement de l\'élève.' });
  }
});

// ============================================================================
// API PORTAIL DEVOIRS ET ÉVALUATIONS (AVEC TRANSFERT AUTOMATIQUE)
// ============================================================================

app.get('/api/evaluations', async (req, res) => {
  try {
    const { class: className, student: studentName, date: dateQuery, week, section = 'garcons' } = req.query;
    if (!className || !dateQuery) {
      return res.status(400).json({ error: 'Classe et date sont requises.' });
    }

    const db = await connectToDatabase();

    // 1. EXTRACTION AUTOMATIQUE DES DEVOIRS DEPUIS 'plans'
    const planDocs = await db.collection('plans').find({ section: section }).toArray();
    if ((!planDocs || planDocs.length === 0) && section === 'garcons') {
      const fallbackDocs = await db.collection('plans').find({}).toArray();
      if (fallbackDocs) planDocs.push(...fallbackDocs);
    }

    const dayName = getDayNameFr(dateQuery);
    const homeworks = [];
    const seenAssignments = new Set();

    planDocs.forEach(doc => {
      if (Array.isArray(doc.data)) {
        doc.data.forEach(row => {
          const rowClass = row[findKey(row, 'Classe')];
          const rowDay = row[findKey(row, 'Jour')];
          const rowDevoirs = row[findKey(row, 'Devoirs')];
          const rowMatiere = row[findKey(row, 'Matière')];
          const rowEnseignant = row[findKey(row, 'Enseignant')];

          if (rowClass && String(rowClass).trim().toLowerCase() === String(className).trim().toLowerCase()) {
            if (rowDevoirs && String(rowDevoirs).trim() !== '') {
              let matchDay = false;
              if (rowDay) {
                const cleanRowDay = String(rowDay).trim().toLowerCase();
                const cleanDateQuery = String(dateQuery).trim().toLowerCase();
                const cleanDayName = dayName ? dayName.toLowerCase() : '';

                if (cleanRowDay === cleanDateQuery || cleanRowDay === cleanDayName || cleanRowDay.includes(cleanDayName) || cleanRowDay.includes(cleanDateQuery)) {
                  matchDay = true;
                }
              } else {
                matchDay = true;
              }

              if (matchDay) {
                const uniqueKey = `${rowMatiere}_${rowDevoirs}`;
                if (!seenAssignments.has(uniqueKey)) {
                  seenAssignments.add(uniqueKey);
                  homeworks.push({
                    subject: rowMatiere || 'Matière',
                    assignment: rowDevoirs,
                    teacher: rowEnseignant || 'Enseignant'
                  });
                }
              }
            }
          }
        });
      }
    });

    // 2. RÉCUPÉRER LES ÉVALUATIONS DÉJÀ ENREGISTRÉES
    let query = { class: className, date: dateQuery, section: section };
    if (studentName) {
      query.studentName = studentName;
    }

    let evaluations = await db.collection('evaluations').find(query).toArray();
    if ((!evaluations || evaluations.length === 0) && section === 'garcons') {
      delete query.section;
      evaluations = await db.collection('evaluations').find(query).toArray();
    }

    let responseData = { homeworks, evaluations: evaluations || [] };

    // 3. ÉVALUATIONS DE LA SEMAINE (SI SOLICITÉES)
    if (week === 'true' && studentName) {
      const targetDate = moment.utc(dateQuery);
      const firstDayOfWeek = targetDate.clone().startOf('isoWeek');
      const lastDayOfWeek = targetDate.clone().endOf('isoWeek');

      const firstDayStr = firstDayOfWeek.format('YYYY-MM-DD');
      const lastDayStr = lastDayOfWeek.format('YYYY-MM-DD');

      responseData.weeklyEvaluations = await db.collection('evaluations').find({
        studentName: studentName,
        class: className,
        date: { $gte: firstDayStr, $lte: lastDayStr }
      }).toArray();
    }

    res.status(200).json(responseData);
  } catch (error) {
    console.error('Erreur GET /api/evaluations:', error);
    res.status(500).json({ error: 'Erreur serveur', details: error.message });
  }
});

app.post('/api/evaluations', async (req, res) => {
  try {
    const { evaluations, section = 'garcons' } = req.body;
    if (!evaluations || !Array.isArray(evaluations) || evaluations.length === 0) {
      return res.status(200).json({ message: 'Aucune évaluation à enregistrer.' });
    }
    const db = await connectToDatabase();
    const operations = evaluations.map(ev => ({
      updateOne: {
        filter: { date: ev.date, studentName: ev.studentName, class: ev.class, subject: ev.subject },
        update: { $set: { ...ev, section: section, updatedAt: new Date() } },
        upsert: true
      }
    }));
    await db.collection('evaluations').bulkWrite(operations);
    res.status(200).json({ message: 'Évaluations enregistrées avec succès.' });
  } catch (error) {
    console.error('Erreur POST /api/evaluations:', error);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

app.get('/api/weekly-summary', async (req, res) => {
  try {
    const section = req.query.section || 'garcons';
    const db = await connectToDatabase();
    const today = moment().startOf('day');
    const dayOfWeek = today.day();

    let targetWeekStart = today.clone().subtract(7, 'days').day(0);
    let targetWeekEnd = today.clone().subtract(7, 'days').day(4);

    const weekIdentifier = targetWeekStart.format('YYYY-[W]WW');
    const existing = await db.collection('students_of_the_week').find({ weekIdentifier, section }).toArray();
    if (existing && existing.length > 0) {
      return res.status(200).json({ studentsOfWeek: existing, showDisplay: true, isLastWeek: true });
    }

    const dateQuery = {
      $gte: targetWeekStart.format('YYYY-MM-DD'),
      $lte: targetWeekEnd.format('YYYY-MM-DD')
    };

    const dailyStars = await db.collection('daily_stars').find({ date: dateQuery, section }).toArray();
    const allEvals = await db.collection('evaluations').find({ date: dateQuery, section }).toArray();

    const studentsByClass = {};
    dailyStars.forEach(starRecord => {
      const classKey = starRecord.className;
      if (!studentsByClass[classKey]) studentsByClass[classKey] = {};
      if (!studentsByClass[classKey][starRecord.studentName]) {
        studentsByClass[classKey][starRecord.studentName] = { stars: 0, dailyRecords: [], progressPercentage: 0 };
      }
      if (starRecord.earnedStar) studentsByClass[classKey][starRecord.studentName].stars += starRecord.earnedStar;
      studentsByClass[classKey][starRecord.studentName].dailyRecords.push(starRecord);
    });

    allEvals.forEach(ev => {
      const classKey = ev.class;
      if (!studentsByClass[classKey]) studentsByClass[classKey] = {};
      if (!studentsByClass[classKey][ev.studentName]) {
        studentsByClass[classKey][ev.studentName] = { evals: [], class: ev.class };
      }
      if (!studentsByClass[classKey][ev.studentName].evals) {
        studentsByClass[classKey][ev.studentName].evals = [];
      }
      studentsByClass[classKey][ev.studentName].evals.push(ev);
    });

    let topStudentOverall = null;
    let topStarsOverall = -1;

    for (const classKey in studentsByClass) {
      const students = studentsByClass[classKey];
      for (const studentName in students) {
        const studentData = students[studentName];
        const studentEvals = allEvals.filter(ev => ev.class === classKey && ev.studentName === studentName);
        let totalScore = 0, maxScore = 0;

        studentEvals.forEach(ev => {
          const d = moment(ev.date).day();
          if (d >= 0 && d <= 4 && ev.status !== 'Absent') {
            totalScore += (ev.status === 'Fait' ? 10 : ev.status === 'Partiellement Fait' ? 5 : 0) + (ev.participation || 0) + (ev.behavior || 0);
            maxScore += 30;
          }
        });

        const progress = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
        const stars = studentData.stars || calculateStarsLegacy(studentEvals);

        if (stars >= 3 && progress > 79) {
          if (stars > topStarsOverall) {
            topStarsOverall = stars;
            topStudentOverall = {
              name: studentName,
              class: classKey,
              stars: stars,
              progressPercentage: progress,
              progressComment: { fr: 'Excellent', ar: 'ممتاز' },
              weekIdentifier: weekIdentifier,
              section: section,
              createdAt: new Date()
            };
          }
        }
      }
    }

    const studentsOfWeek = topStudentOverall ? [topStudentOverall] : [];
    if (studentsOfWeek.length > 0) {
      await db.collection('students_of_the_week').insertMany(studentsOfWeek);
    }

    res.status(200).json({ studentsOfWeek, showDisplay: true, isLastWeek: true });
  } catch (error) {
    console.error('Erreur GET /api/weekly-summary:', error);
    res.status(500).json({ studentsOfWeek: [], showDisplay: false });
  }
});

app.get('/api/daily-stars', async (req, res) => {
  try {
    const { studentName, className, date, week, section = 'garcons' } = req.query;
    const db = await connectToDatabase();
    let query = { section: section };
    if (studentName) query.studentName = studentName;
    if (className) query.className = className;
    if (date) query.date = date;

    if (week) {
      const today = moment().startOf('day');
      query.date = {
        $gte: today.clone().day(0).format('YYYY-MM-DD'),
        $lte: today.clone().day(4).format('YYYY-MM-DD')
      };
    }

    const stars = await db.collection('daily_stars').find(query).toArray();
    res.status(200).json({ stars });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/daily-stars', async (req, res) => {
  try {
    const { date, section = 'garcons' } = req.body;
    const targetDate = date || moment().format('YYYY-MM-DD');
    const db = await connectToDatabase();

    const evaluations = await db.collection('evaluations').find({ date: targetDate, section }).toArray();
    if (evaluations.length === 0) {
      return res.status(200).json({ message: 'Aucune évaluation pour cette date.', date: targetDate });
    }

    const evalsByStudent = {};
    evaluations.forEach(ev => {
      const key = `${ev.studentName}_${ev.class}`;
      if (!evalsByStudent[key]) {
        evalsByStudent[key] = { studentName: ev.studentName, className: ev.class, evaluations: [] };
      }
      evalsByStudent[key].evaluations.push(ev);
    });

    const dailyStars = [];
    for (const key in evalsByStudent) {
      const sData = evalsByStudent[key];
      const earnedStarValue = calculateDailyStar(sData.evaluations);
      const starRecord = {
        date: targetDate,
        studentName: sData.studentName,
        className: sData.className,
        earnedStar: earnedStarValue,
        section: section,
        createdAt: new Date()
      };
      await db.collection('daily_stars').updateOne(
        { date: targetDate, studentName: sData.studentName, className: sData.className, section: section },
        { $set: starRecord },
        { upsert: true }
      );
      dailyStars.push(starRecord);
    }
    res.status(200).json({ message: `Traité pour ${dailyStars.length} élèves.`, stars: dailyStars });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/photo-of-the-day', async (req, res) => {
  try {
    const section = req.query.section || 'garcons';
    const db = await connectToDatabase();
    await deleteOldPhotos(db.collection('photos_of_the_day'));
    const latest = await db.collection('photos_of_the_day').find({ section }).sort({ createdAt: -1 }).limit(1).toArray();
    res.status(200).json(latest[0] || {});
  } catch (e) {
    res.status(500).json({});
  }
});

app.post('/api/photo-of-the-day', async (req, res) => {
  try {
    let { imageUrl, comment, section = 'garcons' } = req.body;
    if (!imageUrl) return res.status(400).json({ error: 'URL requise' });
    imageUrl = convertGoogleDriveUrl(imageUrl);
    const db = await connectToDatabase();
    await db.collection('photos_of_the_day').insertOne({ url: imageUrl, comment: comment || '', section, createdAt: new Date() });
    res.status(200).json({ message: 'Photo de félicitations ajoutée.', convertedUrl: imageUrl });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/photo-2', async (req, res) => {
  try {
    const section = req.query.section || 'garcons';
    const db = await connectToDatabase();
    await deleteOldPhotos(db.collection('photos_celebration_2'));
    const latest = await db.collection('photos_celebration_2').find({ section }).sort({ createdAt: -1 }).limit(1).toArray();
    res.status(200).json(latest[0] || {});
  } catch (e) {
    res.status(500).json({});
  }
});

app.post('/api/photo-2', async (req, res) => {
  try {
    let { imageUrl, comment, section = 'garcons' } = req.body;
    if (!imageUrl) return res.status(400).json({ error: 'URL requise' });
    imageUrl = convertGoogleDriveUrl(imageUrl);
    const db = await connectToDatabase();
    await db.collection('photos_celebration_2').insertOne({ url: imageUrl, comment: comment || '', section, createdAt: new Date() });
    res.status(200).json({ message: 'Photo 2 ajoutée.', convertedUrl: imageUrl });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/photo-3', async (req, res) => {
  try {
    const section = req.query.section || 'garcons';
    const db = await connectToDatabase();
    await deleteOldPhotos(db.collection('photos_celebration_3'));
    const latest = await db.collection('photos_celebration_3').find({ section }).sort({ createdAt: -1 }).limit(1).toArray();
    res.status(200).json(latest[0] || {});
  } catch (e) {
    res.status(500).json({});
  }
});

app.post('/api/photo-3', async (req, res) => {
  try {
    let { imageUrl, comment, section = 'garcons' } = req.body;
    if (!imageUrl) return res.status(400).json({ error: 'URL requise' });
    imageUrl = convertGoogleDriveUrl(imageUrl);
    const db = await connectToDatabase();
    await db.collection('photos_celebration_3').insertOne({ url: imageUrl, comment: comment || '', section, createdAt: new Date() });
    res.status(200).json({ message: 'Photo 3 ajoutée.', convertedUrl: imageUrl });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/send-message', async (req, res) => {
  try {
    const { teacherName, parentName, parentPhone, message, timestamp, section = 'garcons' } = req.body;
    if (!teacherName || !parentName || !message) return res.status(400).json({ error: 'Données incomplètes' });
    const db = await connectToDatabase();
    await db.collection('teacher_messages').insertOne({
      teacherName, parentName, parentPhone: parentPhone || '', message, date: timestamp || new Date().toISOString(), read: false, section, createdAt: new Date()
    });
    res.status(200).json({ message: 'Message envoyé avec succès' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/get-messages', async (req, res) => {
  try {
    const { teacherName, section = 'garcons' } = req.query;
    const db = await connectToDatabase();
    let query = { section };
    if (teacherName && teacherName !== 'all') query.teacherName = teacherName;
    const messages = await db.collection('teacher_messages').find(query).sort({ createdAt: -1 }).toArray();
    res.status(200).json(messages);
  } catch (e) {
    res.status(500).json([]);
  }
});

app.post('/api/mark-messages-read', async (req, res) => {
  try {
    const { teacherName, section = 'garcons' } = req.body;
    if (!teacherName) return res.status(400).json({ error: 'Nom enseignant requis' });
    const db = await connectToDatabase();
    await db.collection('teacher_messages').updateMany({ teacherName, section, read: false }, { $set: { read: true } });
    res.status(200).json({ message: 'Messages marqués comme lus' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/unread-count', async (req, res) => {
  try {
    const { teacherName, section = 'garcons' } = req.query;
    if (!teacherName) return res.status(400).json({ error: 'Nom enseignant requis' });
    const db = await connectToDatabase();
    const count = await db.collection('teacher_messages').countDocuments({ teacherName, section, read: false });
    res.status(200).json({ count });
  } catch (e) {
    res.status(500).json({ count: 0 });
  }
});

app.post('/api/parent-register', async (req, res) => {
  try {
    const { firstName, lastName, phone, password, section = 'garcons' } = req.body;
    if (!firstName || !lastName || !phone || !password) {
      return res.status(400).json({ error: 'Tous les champs sont requis' });
    }
    const db = await connectToDatabase();
    const existing = await db.collection('parent_accounts').findOne({ phone });
    if (existing) {
      return res.status(409).json({ error: 'Ce numéro de téléphone est déjà enregistré' });
    }
    const hashedPassword = hashPassword(password);
    await db.collection('parent_accounts').insertOne({
      firstName, lastName, phone, password: hashedPassword, section, createdAt: new Date()
    });
    res.status(201).json({ message: 'Compte créé avec succès', parent: { firstName, lastName, phone } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/parent-login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) return res.status(400).json({ error: 'Numéro et mot de passe requis' });
    const hashedPassword = hashPassword(password);
    const db = await connectToDatabase();
    const parent = await db.collection('parent_accounts').findOne({ phone, password: hashedPassword });
    if (!parent) return res.status(401).json({ error: 'Identifiants incorrects' });
    await db.collection('parent_accounts').updateOne({ phone }, { $set: { lastLogin: new Date() } });
    res.status(200).json({ message: 'Connexion réussie', parent: { firstName: parent.firstName, lastName: parent.lastName, phone: parent.phone } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/parent-messages', async (req, res) => {
  try {
    const { phone } = req.query;
    if (!phone) return res.status(400).json({ error: 'Numéro de téléphone requis' });
    const db = await connectToDatabase();
    const messages = await db.collection('teacher_messages').find({ parentPhone: phone }).sort({ createdAt: -1 }).toArray();
    res.status(200).json({ messages });
  } catch (e) {
    res.status(500).json({ messages: [] });
  }
});

app.get('/api/parent-unread-replies', async (req, res) => {
  try {
    const { phone } = req.query;
    if (!phone) return res.status(400).json({ error: 'Téléphone requis' });
    const db = await connectToDatabase();
    const count = await db.collection('teacher_replies').countDocuments({ parentPhone: phone, readByParent: false });
    res.status(200).json({ unreadCount: count });
  } catch (e) {
    res.status(500).json({ unreadCount: 0 });
  }
});

app.post('/api/mark-replies-read', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Téléphone requis' });
    const db = await connectToDatabase();
    await db.collection('teacher_replies').updateMany({ parentPhone: phone, readByParent: false }, { $set: { readByParent: true } });
    res.status(200).json({ message: 'Réponses marquées comme lues' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/send-reply', async (req, res) => {
  try {
    const { messageId, teacherName, parentPhone, replyText } = req.body;
    if (!messageId || !teacherName || !parentPhone || !replyText) return res.status(400).json({ error: 'Données incomplètes' });
    const db = await connectToDatabase();
    await db.collection('teacher_replies').insertOne({
      messageId, teacherName, parentPhone, replyText, readByParent: false, createdAt: new Date()
    });
    res.status(200).json({ message: 'Réponse envoyée' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/get-conversation', async (req, res) => {
  try {
    const { messageId } = req.query;
    if (!messageId) return res.status(400).json({ error: 'ID requis' });
    const db = await connectToDatabase();
    const message = await db.collection('teacher_messages').findOne({ _id: new (require('mongodb').ObjectId)(messageId) });
    const replies = await db.collection('teacher_replies').find({ messageId }).sort({ createdAt: 1 }).toArray();
    res.status(200).json({ message, replies });
  } catch (e) {
    res.status(500).json({ message: null, replies: [] });
  }
});

app.post('/api/translate-text', async (req, res) => {
  try {
    const { text, targetLang } = req.body;
    if (!text) return res.status(400).json({ error: 'Texte requis' });
    const translations = {
      'Fait': 'أنجز', 'Non Fait': 'لم ينجز', 'Partiellement Fait': 'أنجز جزئياً', 'Absent': 'غائب',
      'Excellent': 'ممتاز', 'Très bien': 'جيد جداً', 'Bien': 'جيد', 'Moyen': 'متوسط', 'Faible': 'ضعيف',
      'أنجز': 'Fait', 'لم ينجز': 'Non Fait', 'أنجز جزئياً': 'Partiellement Fait', 'غائب': 'Absent'
    };
    let translatedText = text;
    for (const [key, val] of Object.entries(translations)) {
      translatedText = translatedText.replace(new RegExp(key, 'gi'), val);
    }
    res.status(200).json({ originalText: text, translatedText, targetLang });
  } catch (e) {
    res.status(500).json({ originalText: text, translatedText: text });
  }
});

app.get('/api/general-evaluations', async (req, res) => {
  try {
    const section = req.query.section || 'garcons';
    const db = await connectToDatabase();
    const eightWeeksAgo = moment().subtract(8, 'weeks').startOf('day');
    const evaluations = await db.collection('evaluations').find({
      section: section,
      date: { $gte: eightWeeksAgo.format('YYYY-MM-DD') }
    }).toArray();

    const studentEvaluations = {};
    evaluations.forEach(ev => {
      const key = `${ev.class}|||${ev.studentName}`;
      if (!studentEvaluations[key]) {
        studentEvaluations[key] = {
          classe: ev.class,
          student: ev.studentName,
          behaviors: [], participations: [], statuses: [],
          bySubject: {}
        };
      }
      const sd = studentEvaluations[key];
      const subj = (ev.subject || '').trim();
      if (subj && !sd.bySubject[subj]) {
        sd.bySubject[subj] = { behaviors: [], participations: [], statuses: [] };
      }
      const bNum = parseInt(ev.behavior);
      const pNum = parseInt(ev.participation);
      if (!isNaN(bNum)) { sd.behaviors.push(bNum); if (subj) sd.bySubject[subj].behaviors.push(bNum); }
      if (!isNaN(pNum)) { sd.participations.push(pNum); if (subj) sd.bySubject[subj].participations.push(pNum); }
      if (ev.status) { sd.statuses.push(ev.status); if (subj) sd.bySubject[subj].statuses.push(ev.status); }
    });

    function calcScores(behaviors, participations, statuses, isPEI1) {
      const maxPB = isPEI1 ? 30 : 20;
      const avgB = behaviors.length > 0 ? behaviors.reduce((a, b) => a + b, 0) / behaviors.length : 0;
      const avgP = participations.length > 0 ? participations.reduce((a, b) => a + b, 0) / participations.length : 0;
      const rawPB = ((avgB + avgP) / 2) / 10 * maxPB;
      const participationBehaviorScore = Math.min(maxPB, parseFloat(rawPB.toFixed(2)));
      const total = statuses.length;
      const done = statuses.filter(s => s === 'Fait').length;
      const partial = statuses.filter(s => s === 'Partiellement Fait').length;
      const rate = total > 0 ? (done + partial * 0.5) / total : 0;
      const homeworkScore = Math.min(20, parseFloat((rate * 20).toFixed(2)));
      return { participationBehaviorScore, homeworkScore, maxPB, maxHW: 20 };
    }

    const results = Object.values(studentEvaluations).map(sd => {
      const isPEI1 = sd.classe === 'PEI1';
      const maxPB = isPEI1 ? 30 : 20;
      const global = calcScores(sd.behaviors, sd.participations, sd.statuses, isPEI1);
      const subjectScores = {};
      for (const [subj, data] of Object.entries(sd.bySubject)) {
        subjectScores[subj] = calcScores(data.behaviors, data.participations, data.statuses, isPEI1);
      }
      return {
        classe: sd.classe,
        student: sd.student,
        isPEI1, maxPB, maxHW: 20,
        participationBehaviorScore: global.participationBehaviorScore,
        homeworkScore: global.homeworkScore,
        totalScore: parseFloat((global.participationBehaviorScore + global.homeworkScore).toFixed(2)),
        totalMax: maxPB + 20,
        subjectScores
      };
    });

    res.status(200).json(results);
  } catch (e) {
    console.error('Erreur /api/general-evaluations:', e);
    res.status(500).json([]);
  }
});

app.get('/api/plans/:week', async (req, res) => {
  const weekNumber = parseInt(req.params.week, 10);
  const section = req.query.section || 'garcons';
  if (isNaN(weekNumber)) return res.status(400).json({ message: 'Semaine invalide.' });
  try {
    const db = await connectToDatabase();
    
    let planDocument = await db.collection('plans').findOne({ _id: `${section}_${weekNumber}` });
    
    if (!planDocument) {
      planDocument = await db.collection('plans').findOne({ week: weekNumber, section: section });
    }

    if (!planDocument && section === 'garcons') {
      planDocument = await db.collection('plans').findOne({ week: weekNumber });
    }
    
    if (planDocument) {
      const lessonPlans = await db.collection('lessonPlans')
        .find({ week: weekNumber, section: section }, { projection: { _id: 1 } })
        .toArray();
      
      const availableLessonPlanIds = new Set(lessonPlans.map(lp => lp._id));
      
      const weeklyPlans = await db.collection('weeklyLessonPlans')
        .find({ week: weekNumber, section: section }, { projection: { classe: 1 } })
        .toArray();
      
      const availableWeeklyPlans = weeklyPlans.map(p => p.classe);
      
      console.log(`📋 Plans disponibles pour S${weekNumber} (${section}):`, Array.from(availableLessonPlanIds));
      
      const enrichedData = (planDocument.data || []).map(row => {
        const enseignant = row[findKey(row, 'Enseignant')] || '';
        const classe = row[findKey(row, 'Classe')] || '';
        const matiere = row[findKey(row, 'Matière')] || '';
        const periode = row[findKey(row, 'Période')] || '';
        const jour = row[findKey(row, 'Jour')] || '';
        
        const potentialLessonPlanId = `${section}_${weekNumber}_${enseignant}_${classe}_${matiere}_${periode}_${jour}`.replace(/\s+/g, '_');
        
        if (availableLessonPlanIds.has(potentialLessonPlanId)) {
          return { ...row, lessonPlanId: potentialLessonPlanId };
        }
        return row;
      });
      
      res.status(200).json({ 
          planData: enrichedData, 
          classNotes: planDocument.classNotes || {},
          availableWeeklyPlans: availableWeeklyPlans
      });
    } else {
      res.status(200).json({ planData: [], classNotes: {}, availableWeeklyPlans: [] });
    }
  } catch (error) {
    console.error('Erreur MongoDB /plans/:week:', error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

app.post('/api/save-plan', async (req, res) => {
  const weekNumber = parseInt(req.body.week, 10);
  const data = req.body.data;
  const section = req.body.section || 'garcons';
  if (isNaN(weekNumber) || !Array.isArray(data)) return res.status(400).json({ message: 'Données invalides.' });
  try {
    const db = await connectToDatabase();
    const docId = `${section}_${weekNumber}`;
    await db.collection('plans').updateOne(
      { _id: docId },
      { $set: { week: weekNumber, section: section, data: data, updatedAt: new Date() } },
      { upsert: true }
    );
    res.status(200).json({ message: `Plan S${weekNumber} (${section}) enregistré.` });
  } catch (error) {
    console.error('Erreur MongoDB /save-plan:', error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

app.post('/api/save-notes', async (req, res) => {
  const weekNumber = parseInt(req.body.week, 10);
  const { classe, notes, section = 'garcons' } = req.body;
  if (isNaN(weekNumber) || !classe) return res.status(400).json({ message: 'Données invalides.' });
  try {
    const db = await connectToDatabase();
    const docId = `${section}_${weekNumber}`;
    await db.collection('plans').updateOne(
      { _id: docId },
      { $set: { week: weekNumber, section: section, [`classNotes.${classe}`]: notes, updatedAt: new Date() } },
      { upsert: true }
    );
    res.status(200).json({ message: 'Notes enregistrées.' });
  } catch (error) {
    console.error('Erreur MongoDB /save-notes:', error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

app.post('/api/save-row', async (req, res) => {
  const weekNumber = parseInt(req.body.week, 10);
  const rowData = req.body.data;
  const section = req.body.section || 'garcons';
  if (isNaN(weekNumber) || typeof rowData !== 'object') return res.status(400).json({ message: 'Données invalides.' });
  try {
    const db = await connectToDatabase();
    const docId = `${section}_${weekNumber}`;
    const updateFields = {};
    const now = new Date();
    for (const key in rowData) {
      updateFields[`data.$[elem].${key}`] = rowData[key];
    }
    updateFields['data.$[elem].updatedAt'] = now;

    const arrayFilters = [{
      "elem.Enseignant": rowData[findKey(rowData, 'Enseignant')],
      "elem.Classe": rowData[findKey(rowData, 'Classe')],
      "elem.Jour": rowData[findKey(rowData, 'Jour')],
      "elem.Période": rowData[findKey(rowData, 'Période')],
      "elem.Matière": rowData[findKey(rowData, 'Matière')]
    }];

    const result = await db.collection('plans').updateOne(
      { _id: docId },
      { $set: updateFields },
      { arrayFilters: arrayFilters }
    );

    if (result.modifiedCount > 0 || result.matchedCount > 0) {
      res.status(200).json({ message: 'Ligne enregistrée.', updatedData: { updatedAt: now } });
    } else {
      res.status(404).json({ message: 'Ligne non trouvée.' });
    }
  } catch (error) {
    console.error('Erreur MongoDB /save-row:', error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

app.get('/api/all-classes', async (req, res) => {
  try {
    const section = req.query.section || 'garcons';
    const db = await connectToDatabase();
    const classes = await db.collection('plans').distinct('data.Classe', { section: section, 'data.Classe': { $nin: [null, ""] } });
    res.status(200).json((classes || []).sort());
  } catch (error) {
    console.error('Erreur MongoDB /api/all-classes:', error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// --------------------- Génération Word (plan hebdo) ---------------------

app.post('/api/generate-word', async (req, res) => {
  try {
    const { week, classe, data, notes } = req.body;
    const weekNumber = Number(week);
    if (!Number.isInteger(weekNumber) || !classe || !Array.isArray(data)) {
      return res.status(400).json({ message: 'Données invalides.' });
    }

    let templateBuffer;
    try {
      templateBuffer = await getWordTemplateBuffer();
    } catch (e) {
      console.error("Erreur de récupération du modèle Word:", e);
      return res.status(500).json({ message: `Erreur récupération modèle Word.` });
    }

    const zip = new PizZip(templateBuffer);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      nullGetter: () => "",
    });

    const groupedByDay = {};
    const dayOrder = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi"];
    const datesNode = specificWeekDateRangesNode[weekNumber];
    let weekStartDateNode = null;
    if (datesNode?.start) {
      weekStartDateNode = new Date(datesNode.start + 'T00:00:00Z');
    }
    if (!weekStartDateNode || isNaN(weekStartDateNode.getTime())) {
      return res.status(500).json({ message: `Dates serveur manquantes pour S${weekNumber}.` });
    }

    const sampleRow = data[0] || {};
    const jourKey = findKey(sampleRow, 'Jour'),
          periodeKey = findKey(sampleRow, 'Période'),
          matiereKey = findKey(sampleRow, 'Matière'),
          leconKey = findKey(sampleRow, 'Leçon'),
          travauxKey = findKey(sampleRow, 'Travaux de classe'),
          supportKey = findKey(sampleRow, 'Support'),
          devoirsKey = findKey(sampleRow, 'Devoirs');

    data.forEach(item => {
      const day = item[jourKey];
      if (day && dayOrder.includes(day)) {
        if (!groupedByDay[day]) groupedByDay[day] = [];
        groupedByDay[day].push(item);
      }
    });

    const joursData = dayOrder.map(dayName => {
      if (!groupedByDay[dayName]) return null;

      const dateOfDay = getDateForDayNameNode(weekStartDateNode, dayName);
      const formattedDate = dateOfDay ? formatDateFrenchNode(dateOfDay) : dayName;
      const sortedEntries = groupedByDay[dayName].sort((a, b) => (parseInt(a[periodeKey], 10) || 0) - (parseInt(b[periodeKey], 10) || 0));

      const matieres = sortedEntries.map(item => ({
        matiere: item[matiereKey] ?? "",
        Lecon: formatTextForWord(item[leconKey], { color: 'FF0000' }),
        travailDeClasse: formatTextForWord(item[travauxKey]),
        Support: formatTextForWord(item[supportKey], { color: 'FF0000', italic: true }),
        devoirs: formatTextForWord(item[devoirsKey], { color: '0000FF', italic: true })
      }));

      return { jourDateComplete: formattedDate, matieres: matieres };
    }).filter(Boolean);

    let plageSemaineText = `Semaine ${weekNumber}`;
    if (datesNode?.start && datesNode?.end) {
      const startD = new Date(datesNode.start + 'T00:00:00Z');
      const endD = new Date(datesNode.end + 'T00:00:00Z');
      if (!isNaN(startD.getTime()) && !isNaN(endD.getTime())) {
        plageSemaineText = `du ${formatDateFrenchNode(startD)} à ${formatDateFrenchNode(endD)}`;
      }
    }

    const templateData = {
      semaine: weekNumber,
      classe: classe,
      jours: joursData,
      notes: formatTextForWord(notes),
      plageSemaine: plageSemaineText
    };

    doc.render(templateData);

    const buf = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
    const filename = `Plan_hebdomadaire_S${weekNumber}_${classe.replace(/[^a-z0-9]/gi, '_')}.docx`;

    // 1. Enregistrement du plan de leçon dans MongoDB
    try {
      const db = await connectToDatabase();
      const lessonPlanId = `S${weekNumber}_${classe.replace(/[^a-z0-9]/gi, '_')}`;
      
      await db.collection('weeklyLessonPlans').updateOne(
          { _id: lessonPlanId },
          { 
              $set: { 
                  week: weekNumber, 
                  classe: classe, 
                  filename: filename, 
                  fileData: buf, 
                  updatedAt: new Date() 
              },
              $setOnInsert: { createdAt: new Date() }
          },
          { upsert: true }
      );
      console.log(`✅ Plan de leçon ${lessonPlanId} enregistré dans MongoDB.`);
    } catch (dbError) {
      console.error(`❌ Erreur lors de l'enregistrement du plan de leçon dans MongoDB:`, dbError);
      // On continue pour envoyer le fichier même en cas d'échec de l'enregistrement
    }
    // Fin 1. Enregistrement du plan de leçon dans MongoDB
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.send(buf);

  } catch (error) {
    console.error('❌ Erreur serveur /generate-word:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Erreur interne /generate-word.' });
    }
	  }
	});

	// --------------------- Génération ZIP (Plans de Leçon Multiples) ---------------------

	app.post('/api/generate-weekly-plans-zip', async (req, res) => {
	  try {
	    const { week, classes, data, notes } = req.body;
	    const weekNumber = Number(week);
	    if (!Number.isInteger(weekNumber) || !Array.isArray(classes) || !Array.isArray(data)) {
	      return res.status(400).json({ message: 'Données invalides (semaine, classes ou data manquantes).' });
	    }

	    // Configuration du ZIP
	    const archive = archiver('zip', { zlib: { level: 9 } });
	    const filename = `Plans_Hebdomadaires_S${weekNumber}_${classes.length}_Classes.zip`;

	    res.setHeader('Content-Type', 'application/zip');
	    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
	    archive.pipe(res);

	    const dayOrder = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi"];
	    const datesNode = specificWeekDateRangesNode[weekNumber];
	    let weekStartDateNode = null;
	    if (datesNode?.start) {
	      weekStartDateNode = new Date(datesNode.start + 'T00:00:00Z');
	    }
	    if (!weekStartDateNode || isNaN(weekStartDateNode.getTime())) {
	      archive.abort();
	      return res.status(500).json({ message: `Dates serveur manquantes pour S${weekNumber}.` });
	    }

	    let templateBuffer;
	    try {
	      templateBuffer = await getWordTemplateBuffer();
	    } catch (e) {
	      console.error("Erreur de récupération du modèle Word:", e);
	      archive.abort();
	      return res.status(500).json({ message: `Erreur récupération modèle Word.` });
	    }

	    let plageSemaineText = `Semaine ${weekNumber}`;
	    if (datesNode?.start && datesNode?.end) {
	      const startD = new Date(datesNode.start + 'T00:00:00Z');
	      const endD = new Date(datesNode.end + 'T00:00:00Z');
	      if (!isNaN(startD.getTime()) && !isNaN(endD.getTime())) {
	        plageSemaineText = `du ${formatDateFrenchNode(startD)} à ${formatDateFrenchNode(endD)}`;
	      }
	    }

	    const sampleRow = data[0] || {};
	    const jourKey = findKey(sampleRow, 'Jour'),
	          periodeKey = findKey(sampleRow, 'Période'),
	          matiereKey = findKey(sampleRow, 'Matière'),
	          leconKey = findKey(sampleRow, 'Leçon'),
	          travauxKey = findKey(sampleRow, 'Travaux de classe'),
	          supportKey = findKey(sampleRow, 'Support'),
	          devoirsKey = findKey(sampleRow, 'Devoirs');

	    for (const classe of classes) {
	      const classData = data.filter(item => item[findKey(item, 'Classe')] === classe);
	      const classNotes = notes[classe] || '';

	      if (classData.length === 0) {
	        console.warn(`Aucune donnée trouvée pour la classe ${classe}. Sautée.`);
	        continue;
	      }

	      const groupedByDay = {};
	      classData.forEach(item => {
	        const day = item[jourKey];
	        if (day && dayOrder.includes(day)) {
	          if (!groupedByDay[day]) groupedByDay[day] = [];
	          groupedByDay[day].push(item);
	        }
	      });

	      const joursData = dayOrder.map(dayName => {
	        if (!groupedByDay[dayName]) return null;

	        const dateOfDay = getDateForDayNameNode(weekStartDateNode, dayName);
	        const formattedDate = dateOfDay ? formatDateFrenchNode(dateOfDay) : dayName;
	        const sortedEntries = groupedByDay[dayName].sort((a, b) => (parseInt(a[periodeKey], 10) || 0) - (parseInt(b[periodeKey], 10) || 0));

	        const matieres = sortedEntries.map(item => ({
	          matiere: item[matiereKey] ?? "",
	          Lecon: formatTextForWord(item[leconKey], { color: 'FF0000' }),
	          travailDeClasse: formatTextForWord(item[travauxKey]),
	          Support: formatTextForWord(item[supportKey], { color: 'FF0000', italic: true }),
	          devoirs: formatTextForWord(item[devoirsKey], { color: '0000FF', italic: true })
	        }));

	        return { jourDateComplete: formattedDate, matieres: matieres };
	      }).filter(Boolean);

	      const templateData = {
	        semaine: weekNumber,
	        classe: classe,
	        jours: joursData,
	        notes: formatTextForWord(classNotes),
	        plageSemaine: plageSemaineText
	      };

	      // Créer une nouvelle instance de Docxtemplater pour chaque classe
	      const zip = new PizZip(templateBuffer);
	      const doc = new Docxtemplater(zip, {
	        paragraphLoop: true,
	        nullGetter: () => "",
	      });

	      doc.render(templateData);

	      const buf = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
	      const docxFilename = `Plan_hebdomadaire_S${weekNumber}_${classe.replace(/[^a-z0-9]/gi, '_')}.docx`;

	      // Enregistrement du plan de leçon dans MongoDB (comme dans /api/generate-word)
	      try {
	        const db = await connectToDatabase();
	        const lessonPlanId = `S${weekNumber}_${classe.replace(/[^a-z0-9]/gi, '_')}`;
	        
	        await db.collection('weeklyLessonPlans').updateOne(
	            { _id: lessonPlanId },
	            { 
	                $set: { 
	                    week: weekNumber, 
	                    classe: classe, 
	                    filename: docxFilename, 
	                    fileData: buf, 
	                    updatedAt: new Date() 
	                },
	                $setOnInsert: { createdAt: new Date() }
	            },
	            { upsert: true }
	        );
	        console.log(`✅ Plan de leçon ${lessonPlanId} enregistré dans MongoDB.`);
	      } catch (dbError) {
	        console.error(`❌ Erreur lors de l'enregistrement du plan de leçon dans MongoDB:`, dbError);
	      }
	      
	      // Ajouter le DOCX au ZIP
	      archive.append(buf, { name: docxFilename });
	    }

	    archive.finalize();

	  } catch (error) {
	    console.error('❌ Erreur serveur /generate-weekly-plans-zip:', error);
	    if (!res.headersSent) {
	      res.status(500).json({ message: 'Erreur interne /generate-weekly-plans-zip.' });
	    }
	  }
	});

	// --------------------- Téléchargement Plan de Leçon (DOCX) ---------------------

	app.get('/api/download-weekly-plan/:week/:classe', async (req, res) => {
	  try {
	    const weekNumber = Number(req.params.week);
	    const classe = req.params.classe;
	    if (!Number.isInteger(weekNumber) || !classe) {
	      return res.status(400).json({ message: 'Semaine ou classe invalide.' });
	    }

	    const lessonPlanId = `S${weekNumber}_${classe.replace(/[^a-z0-9]/gi, '_')}`;
	    const db = await connectToDatabase();
	    const planDocument = await db.collection('weeklyLessonPlans').findOne({ _id: lessonPlanId });

	    if (!planDocument || !planDocument.fileData) {
	      console.log(`⚠️ Plan de leçon non trouvé pour ${lessonPlanId}`);
	      return res.status(404).json({ message: 'Plan de leçon non généré ou non trouvé.' });
	    }

	    console.log(`✅ Plan de leçon trouvé pour ${lessonPlanId}. Envoi du fichier.`);
	    res.setHeader('Content-Disposition', `attachment; filename="${planDocument.filename}"`);
	    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
	    res.send(planDocument.fileData.buffer); // fileData est un BSON Binary, on utilise .buffer pour le Buffer Node.js

	  } catch (error) {
	    console.error('❌ Erreur serveur /download-weekly-plan:', error);
	    if (!res.headersSent) {
	      res.status(500).json({ message: 'Erreur interne /download-weekly-plan.' });
	    }
	  }
	});

	// --------------------- Génération Excel (workbook) ---------------------

app.post('/api/generate-excel-workbook', async (req, res) => {
  try {
    const weekNumber = Number(req.body.week);
    if (!Number.isInteger(weekNumber)) return res.status(400).json({ message: 'Semaine invalide.' });

    const db = await connectToDatabase();
    const planDocument = await db.collection('plans').findOne({ week: weekNumber });
    if (!planDocument?.data?.length) return res.status(404).json({ message: `Aucune donnée pour S${weekNumber}.` });

    const finalHeaders = [ 'Enseignant', 'Jour', 'Période', 'Classe', 'Matière', 'Leçon', 'Travaux de classe', 'Support', 'Devoirs' ];
    const formattedData = planDocument.data.map(item => {
      const row = {};
      finalHeaders.forEach(header => {
        const itemKey = findKey(item, header);
        row[header] = itemKey ? item[itemKey] : '';
      });
      return row;
    });

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(formattedData, { header: finalHeaders });
    worksheet['!cols'] = [
      { wch: 20 }, { wch: 15 }, { wch: 10 }, { wch: 12 }, { wch: 20 },
      { wch: 45 }, { wch: 45 }, { wch: 25 }, { wch: 45 }
    ];
    XLSX.utils.book_append_sheet(workbook, worksheet, `Plan S${weekNumber}`);

    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    const filename = `Plan_Hebdomadaire_S${weekNumber}_Complet.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    console.error('❌ Erreur serveur /generate-excel-workbook:', error);
    if (!res.headersSent) res.status(500).json({ message: 'Erreur interne Excel.' });
  }
});

// --------------- Rapport Excel par classe (toutes semaines) ------------

app.post('/api/full-report-by-class', async (req, res) => {
  try {
    const { classe: requestedClass } = req.body;
    if (!requestedClass) return res.status(400).json({ message: 'Classe requise.' });

    const db = await connectToDatabase();
    const allPlans = await db.collection('plans').find({}).sort({ week: 1 }).toArray();
    if (!allPlans || allPlans.length === 0) return res.status(404).json({ message: 'Aucune donnée.' });

    const dataBySubject = {};
    const monthsFrench = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

    allPlans.forEach(plan => {
      const weekNumber = plan.week;
      let monthName = 'N/A';
      const weekDates = specificWeekDateRangesNode[weekNumber];
      if (weekDates?.start) {
        try {
          const startDate = new Date(weekDates.start + 'T00:00:00Z');
          monthName = monthsFrench[startDate.getUTCMonth()];
        } catch (e) {}
      }

      (plan.data || []).forEach(item => {
        const itemClassKey = findKey(item, 'classe');
        const itemSubjectKey = findKey(item, 'matière');
        if (itemClassKey && item[itemClassKey] === requestedClass && itemSubjectKey && item[itemSubjectKey]) {
          const subject = item[itemSubjectKey];
          if (!dataBySubject[subject]) dataBySubject[subject] = [];
          const row = {
            'Mois': monthName,
            'Semaine': weekNumber,
            'Période': item[findKey(item, 'période')] || '',
            'Leçon': item[findKey(item, 'leçon')] || '',
            'Travaux de classe': item[findKey(item, 'travaux de classe')] || '',
            'Support': item[findKey(item, 'support')] || '',
            'Devoirs': item[findKey(item, 'devoirs')] || ''
          };
          dataBySubject[subject].push(row);
        }
      });
    });

    const subjectsFound = Object.keys(dataBySubject);
    if (subjectsFound.length === 0) return res.status(404).json({ message: `Aucune donnée pour la classe '${requestedClass}'.` });

    const workbook = XLSX.utils.book_new();
    const headers = ['Mois', 'Semaine', 'Période', 'Leçon', 'Travaux de classe', 'Support', 'Devoirs'];

    subjectsFound.sort().forEach(subject => {
      const safeSheetName = subject.substring(0, 30).replace(/[*?:/\\\[\]]/g, '_');
      const worksheet = XLSX.utils.json_to_sheet(dataBySubject[subject], { header: headers });
      worksheet['!cols'] = [
        { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 40 }, { wch: 40 }, { wch: 25 }, { wch: 40 }
      ];
      XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName);
    });

    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    const filename = `Rapport_Complet_${requestedClass.replace(/[^a-z0-9]/gi, '_')}.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    console.error('❌ Erreur serveur /full-report-by-class:', error);
    if (!res.headersSent) res.status(500).json({ message: 'Erreur interne du rapport.' });
  }
});

// --------------------- Génération IA (REST, v1, modèle dynamique) ------

app.post('/api/generate-ai-lesson-plan', async (req, res) => {
  try {
    console.log('📝 [AI Lesson Plan] Nouvelle demande de génération');
    
    // Pool de clés GROQ API avec rotation automatique
    const GROQ_API_KEYS = [
      process.env.GROQ_API_KEY,
      process.env.GROQ_API_KEY_BACKUP // Clé de secours
    ].filter(Boolean); // Filtrer les clés vides
    
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    
    if (GROQ_API_KEYS.length === 0 && !GEMINI_API_KEY) {
      console.error('❌ [AI Lesson Plan] Aucune clé API (GROQ ou GEMINI) disponible');
      return res.status(503).json({ message: "Le service IA n'est pas initialisé. Vérifiez les clés API GROQ ou GEMINI du serveur." });
    }
    
    console.log(`🔧 [AI Lesson Plan] ${GROQ_API_KEYS.length} clé(s) GROQ disponible(s), GEMINI: ${GEMINI_API_KEY ? 'Oui' : 'Non'}`);
    const AI_API_KEY = null; // Non utilisé avec le nouveau système

    const { week, rowData } = req.body;
    if (!rowData || typeof rowData !== 'object' || !week) {
      console.error('❌ [AI Lesson Plan] Données invalides:', { week, hasRowData: !!rowData });
      return res.status(400).json({ message: "Les données de la ligne ou de la semaine sont manquantes." });
    }
    
    console.log(`✅ [AI Lesson Plan] Génération pour semaine ${week}`);

    // Charger le modèle Word (depuis l'URL ou modèle intégré de secours)
    let templateBuffer;
    try {
      templateBuffer = await getLessonTemplateBuffer();
    } catch (e) {
      console.error("Erreur de récupération du modèle Word:", e);
      return res.status(500).json({ message: "Impossible de générer ou récupérer le modèle de leçon." });
    }

    // Extraire données
    const enseignant = rowData[findKey(rowData, 'Enseignant')] || '';
    const classe = rowData[findKey(rowData, 'Classe')] || '';
    const matiere = rowData[findKey(rowData, 'Matière')] || '';
    const lecon = rowData[findKey(rowData, 'Leçon')] || '';
    const jour = rowData[findKey(rowData, 'Jour')] || '';
    const seance = rowData[findKey(rowData, 'Période')] || '';
    const support = rowData[findKey(rowData, 'Support')] || 'Non spécifié';
    const travaux = rowData[findKey(rowData, 'Travaux de classe')] || 'Non spécifié';
    const devoirsPrevus = rowData[findKey(rowData, 'Devoirs')] || 'Non spécifié';
    
    console.log(`📚 [AI Lesson Plan] Données: ${enseignant} | ${classe} | ${matiere} | ${lecon}`);

    // Date formatée
    let formattedDate = "";
    const weekNumber = Number(week);
    const datesNode = specificWeekDateRangesNode[weekNumber];
    if (jour && datesNode?.start) {
      const weekStartDateNode = new Date(datesNode.start + 'T00:00:00Z');
      if (!isNaN(weekStartDateNode.getTime())) {
        // Extract day name from the jour field (in case it contains a full date)
        const dayName = extractDayNameFromString(jour);
        if (dayName) {
          const dateOfDay = getDateForDayNameNode(weekStartDateNode, dayName);
          if (dateOfDay) formattedDate = formatDateFrenchNode(dateOfDay);
        }
      }
    }

    // Prompt + structure JSON
    const jsonStructure = `{"TitreUnite":"un titre d'unité pertinent pour la leçon","Methodes":"liste des méthodes d'enseignement","Outils":"liste des outils de travail","Objectifs":"une liste concise des objectifs d'apprentissage (compétences, connaissances), séparés par des sauts de ligne (\\\\n). Commence chaque objectif par un tiret (-).","etapes":[{"phase":"Introduction","duree":"5 min","activite":"Description de l'activité d'introduction pour l'enseignant et les élèves."},{"phase":"Activité Principale","duree":"25 min","activite":"Description de l'activité principale, en intégrant les 'travaux de classe' et le 'support' si possible."},{"phase":"Synthèse","duree":"10 min","activite":"Description de l'activité de conclusion et de vérification des acquis."},{"phase":"Clôture","duree":"5 min","activite":"Résumé rapide et annonce des devoirs."}],"Ressources":"les ressources spécifiques à utiliser.","Devoirs":"une suggestion de devoirs.","DiffLents":"une suggestion pour aider les apprenants en difficulté.","DiffTresPerf":"une suggestion pour stimuler les apprenants très performants.","DiffTous":"une suggestion de différenciation pour toute la classe."}`;

    let prompt;
    if (englishTeachers.includes(enseignant)) {
      prompt = `Return ONLY valid JSON. No markdown, no code fences, no commentary.

As an expert pedagogical assistant, create a detailed 45-minute lesson plan in English. Structure the lesson into timed phases and integrate the teacher's existing notes:
- Subject: ${matiere}, Class: ${classe}, Lesson Topic: ${lecon}
- Planned Classwork: ${travaux}
- Mentioned Support/Materials: ${support}
- Planned Homework: ${devoirsPrevus}

Use the following JSON structure with professional, concrete values in English (keys exactly as specified):
${jsonStructure}`;
    } else if (arabicTeachers.includes(enseignant)) {
      prompt = `أعد فقط JSON صالحًا. بدون Markdown أو أسوار كود أو تعليقات.

بصفتك مساعدًا تربويًا خبيرًا، أنشئ خطة درس مفصلة باللغة العربية مدتها 45 دقيقة. قم ببناء الدرس في مراحل محددة زمنياً وادمج ملاحظات المعلم:
- المادة: ${matiere}، الفصل: ${classe}، الموضوع: ${lecon}
- أعمال الصف المخطط لها: ${travaux}
- الدعم/المواد: ${support}
- الواجبات المخطط لها: ${devoirsPrevus}

استخدم البنية التالية بالقيم المهنية والملموسة (المفاتيح كما هي بالإنجليزية):
${jsonStructure}`;
    } else {
      prompt = `Renvoie UNIQUEMENT du JSON valide. Pas de markdown, pas de blocs de code, pas de commentaire.

En tant qu'assistant pédagogique expert, crée un plan de leçon détaillé de 45 minutes en français. Structure en phases chronométrées et intègre les notes de l'enseignant :
- Matière : ${matiere}, Classe : ${classe}, Thème : ${lecon}
- Travaux de classe : ${travaux}
- Support/Matériel : ${support}
- Devoirs prévus : ${devoirsPrevus}

Utilise la structure JSON suivante (valeurs concrètes et professionnelles ; clés strictement identiques) :
${jsonStructure}`;
    }

    // === Essayer toutes les clés GROQ en rotation, puis fallback vers GEMINI ===
    let API_URL, requestBody, aiResponse;
    let lastError = null;
    let providerUsed = null;
    
    // Essayer toutes les clés GROQ
    for (let i = 0; i < GROQ_API_KEYS.length; i++) {
      const GROQ_KEY = GROQ_API_KEYS[i];
      console.log(`🤖 [AI Lesson Plan] Tentative ${i + 1}/${GROQ_API_KEYS.length} avec GROQ (llama-3.3-70b)`);
      
      API_URL = 'https://api.groq.com/openai/v1/chat/completions';
      requestBody = {
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 2048
      };
      
      try {
        console.log(`🔄 [AI Lesson Plan] Appel à GROQ (clé ${i + 1})...`);
        aiResponse = await fetch(API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${GROQ_KEY}`
          },
          body: JSON.stringify(requestBody),
        });
        
        if (aiResponse.ok) {
          providerUsed = `GROQ (clé ${i + 1})`;
          console.log(`✅ [AI Lesson Plan] Succès avec ${providerUsed}`);
          break; // Succès, sortir de la boucle
        } else if (aiResponse.status === 429) {
          const errorBody = await aiResponse.json().catch(() => ({}));
          console.warn(`⚠️ [AI Lesson Plan] Quota épuisé pour clé GROQ ${i + 1}, essai clé suivante...`);
          lastError = new Error(`Quota GROQ clé ${i + 1} épuisé`);
          continue; // Essayer la clé suivante
        } else {
          const errorBody = await aiResponse.json().catch(() => ({}));
          console.error(`❌ [AI Lesson Plan] Erreur clé GROQ ${i + 1}:`, errorBody);
          lastError = new Error(errorBody.error?.message || `Erreur GROQ ${aiResponse.status}`);
          continue; // Essayer la clé suivante
        }
      } catch (error) {
        console.error(`❌ [AI Lesson Plan] Exception clé GROQ ${i + 1}:`, error.message);
        lastError = error;
        continue; // Essayer la clé suivante
      }
    }
    
    // Si aucune clé GROQ n'a fonctionné, essayer GEMINI
    if (!providerUsed && GEMINI_API_KEY) {
      console.log('🤖 [AI Lesson Plan] Toutes les clés GROQ épuisées, fallback vers GEMINI...');
      try {
        const MODEL_NAME = await resolveGeminiModel(GEMINI_API_KEY);
        console.log(`🤖 [AI Lesson Plan] Modèle GEMINI sélectionné: ${MODEL_NAME}`);
        
        API_URL = `https://generativelanguage.googleapis.com/v1/models/${MODEL_NAME}:generateContent?key=${GEMINI_API_KEY}`;
        requestBody = {
          contents: [{ role: "user", parts: [{ text: prompt }] }]
        };
        
        console.log('🔄 [AI Lesson Plan] Appel à l\'API Gemini...');
        aiResponse = await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });
        
        if (aiResponse.ok) {
          providerUsed = 'GEMINI';
          console.log('✅ [AI Lesson Plan] Succès avec GEMINI');
        } else {
          const errorBody = await aiResponse.json().catch(() => ({}));
          console.error('❌ [AI Lesson Plan] Erreur GEMINI:', errorBody);
          throw new Error(`Erreur GEMINI: ${errorBody.error?.message || aiResponse.statusText}`);
        }
      } catch (error) {
        console.error('❌ [AI Lesson Plan] Exception GEMINI:', error.message);
        lastError = error;
      }
    }
    
    // Si aucune API n'a fonctionné
    if (!providerUsed) {
      console.error('❌ [AI Lesson Plan] TOUTES LES APIS ÉPUISÉES');
      throw new Error(`⚠️ QUOTA API ÉPUISÉ : Toutes les clés API (GROQ et GEMINI) ont atteint leur limite. Veuillez réessayer demain. ${lastError?.message || ''}`);
    }

    const aiResult = await aiResponse.json();

    // Extraction robuste du texte JSON renvoyé
    let text = "";
    try {
      if (providerUsed.includes('GROQ')) {
        // Format GROQ (OpenAI-compatible)
        text = aiResult?.choices?.[0]?.message?.content?.trim();
      } else {
        // Format GEMINI
        text = aiResult?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (!text && Array.isArray(aiResult?.candidates?.[0]?.content?.parts)) {
          text = aiResult.candidates[0].content.parts.map(p => p.text || "").join("").trim();
        }
        if (!text && aiResult?.candidates?.[0]?.output_text) {
          text = String(aiResult.candidates[0].output_text).trim();
        }
      }
    } catch (_) {}

    if (!text) {
      console.error("Réponse IA vide ou non reconnue:", JSON.stringify(aiResult, null, 2));
      return res.status(500).json({ message: "Réponse IA vide ou non reconnue." });
    }

    // Parse JSON avec petit nettoyage si Markdown accidentel
    let aiData;
    try {
      aiData = JSON.parse(text);
    } catch {
      const cleaned = text.replace(/^```json\s*|\s*```$/g, '').trim();
      aiData = JSON.parse(cleaned);
    }

    // Préparer le DOCX
    const zip = new PizZip(templateBuffer);
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, nullGetter: () => "" });

    let minutageString = "";
    let contenuString = "";
    if (aiData.etapes && Array.isArray(aiData.etapes)) {
      minutageString = aiData.etapes.map(e => e.duree || "").join('\n');
      contenuString = aiData.etapes.map(e => `▶ ${e.phase || ""}:\n${e.activite || ""}`).join('\n\n');
    }

    const templateData = {
      ...aiData,
      Semaine: week,
      Lecon: lecon,
      Matiere: matiere,
      Classe: classe,
      Jour: jour,
      Seance: seance,
      NomEnseignant: enseignant,
      Date: formattedDate,
      Deroulement: minutageString,
      Contenu: contenuString,
    };

    doc.render(templateData);
    const buf = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });

    // Format: Matière_Classe_Semaine_Séance_Enseignant.docx
    const filename = `${sanitizeForFilename(matiere)}_${sanitizeForFilename(classe)}_S${weekNumber}_P${sanitizeForFilename(seance)}_${sanitizeForFilename(enseignant)}.docx`;
    console.log(`📄 [AI Lesson Plan] Envoi du fichier: ${filename}`);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.send(buf);
    console.log('✅ [AI Lesson Plan] Génération terminée avec succès');

  } catch (error) {
    console.error('❌ Erreur serveur /generate-ai-lesson-plan:', error);
    if (!res.headersSent) {
      const errorMessage = error.message || "Erreur interne.";
      res.status(500).json({ message: `Erreur interne lors de la génération IA: ${errorMessage}` });
    }
  }
});

// Sauvegarder un plan de leçon généré dans MongoDB
app.post('/api/save-lesson-plan', async (req, res) => {
  try {
    console.log('💾 [Save Lesson Plan] Sauvegarde d\'un plan de leçon');
    
    const { week, rowData, fileBuffer, filename } = req.body;
    
    if (!week || !rowData || !fileBuffer || !filename) {
      return res.status(400).json({ message: 'Données manquantes pour la sauvegarde.' });
    }
    
    const db = await connectToDatabase();
    
    // Créer ou mettre à jour le document du plan de leçon
    const enseignant = rowData[findKey(rowData, 'Enseignant')] || '';
    const classe = rowData[findKey(rowData, 'Classe')] || '';
    const matiere = rowData[findKey(rowData, 'Matière')] || '';
    const periode = rowData[findKey(rowData, 'Période')] || '';
    const jour = rowData[findKey(rowData, 'Jour')] || '';
    
    const lessonPlanId = `${week}_${enseignant}_${classe}_${matiere}_${periode}_${jour}`.replace(/\s+/g, '_');
    
    await db.collection('lessonPlans').updateOne(
      { _id: lessonPlanId },
      {
        $set: {
          week: Number(week),
          enseignant,
          classe,
          matiere,
          periode,
          jour,
          filename,
          fileBuffer: Buffer.from(fileBuffer, 'base64'),
          createdAt: new Date(),
          rowData
        }
      },
      { upsert: true }
    );
    
    console.log(`✅ [Save Lesson Plan] Plan sauvegardé: ${lessonPlanId}`);
    res.status(200).json({ success: true, message: 'Plan de leçon sauvegardé.', lessonPlanId });
    
  } catch (error) {
    console.error('❌ Erreur sauvegarde plan de leçon:', error);
    res.status(500).json({ message: 'Erreur lors de la sauvegarde du plan de leçon.' });
  }
});

// ============================================================================
// NOUVELLE ROUTE: Génération multiple de plans de leçon IA en ZIP
// ============================================================================
app.post('/api/generate-multiple-ai-lesson-plans', async (req, res) => {
  try {
    console.log('📚 [Multiple AI Lesson Plans] Nouvelle demande de génération multiple');
    
    // Support GROQ API (prioritaire) avec fallback vers GEMINI
    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const USE_GROQ = GROQ_API_KEY ? true : false;
    
    if (!GROQ_API_KEY && !GEMINI_API_KEY) {
      return res.status(503).json({ message: "Le service IA n'est pas initialisé. Vérifiez les clés API GROQ ou GEMINI." });
    }
    
    console.log(`🔧 [Multiple AI] Provider IA: ${USE_GROQ ? 'GROQ (llama-3.3-70b)' : 'GEMINI'}`);

    const { week, rowsData } = req.body;
    if (!Array.isArray(rowsData) || rowsData.length === 0 || !week) {
      return res.status(400).json({ message: "Données invalides ou vides." });
    }

    console.log(`✅ [Multiple AI Lesson Plans] Génération de ${rowsData.length} plans pour semaine ${week}`);

    // ⚡ FILTRER LES LIGNES AVEC LEÇONS VIDES AVANT DE COMMENCER
    const validRows = [];
    const skippedRows = [];
    
    for (let i = 0; i < rowsData.length; i++) {
      const rowData = rowsData[i];
      const lecon = rowData[findKey(rowData, 'Leçon')] || '';
      const enseignant = rowData[findKey(rowData, 'Enseignant')] || '';
      const classe = rowData[findKey(rowData, 'Classe')] || '';
      const matiere = rowData[findKey(rowData, 'Matière')] || '';
      
      if (!lecon || lecon.trim() === '' || lecon.trim().length < 3) {
        console.log(`⏭️  [${i+1}/${rowsData.length}] IGNORÉ (leçon vide): ${enseignant} | ${classe} | ${matiere}`);
        skippedRows.push({ index: i+1, enseignant, classe, matiere, reason: 'Leçon vide' });
      } else {
        validRows.push({ index: i, rowData });
      }
    }
    
    console.log(`📊 [Multiple AI] ${validRows.length} lignes valides, ${skippedRows.length} ignorées`);
    
    if (validRows.length === 0) {
      return res.status(400).json({ 
        message: "Aucune ligne avec une leçon valide à générer.",
        skipped: skippedRows
      });
    }

    // Charger le modèle Word une seule fois (depuis l'URL ou modèle intégré de secours)
    let templateBuffer;
    try {
      templateBuffer = await getLessonTemplateBuffer();
    } catch (e) {
      console.error("Erreur récupération modèle:", e);
      return res.status(500).json({ message: "Impossible de récupérer ou générer le modèle de leçon." });
    }

    // Configuration du ZIP
    const archive = archiver('zip', { zlib: { level: 9 } });
    const filename = `Plans_Lecon_IA_S${week}_${validRows.length}_fichiers.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    archive.pipe(res);

    const weekNumber = Number(week);
    const datesNode = specificWeekDateRangesNode[weekNumber];

    // Résoudre le modèle selon le provider
    let MODEL_NAME;
    if (!USE_GROQ) {
      MODEL_NAME = await resolveGeminiModel(GEMINI_API_KEY);
      console.log(`🤖 [Multiple AI] Modèle GEMINI: ${MODEL_NAME}`);
    }

    let successCount = 0;
    let errorCount = 0;
    
    // Si des lignes ont été ignorées, ajouter un fichier récapitulatif
    if (skippedRows.length > 0) {
      const skipContent = `⏭️  LIGNES IGNORÉES (LEÇONS VIDES)\n\nTotal: ${skippedRows.length} ligne(s)\n\n` +
        skippedRows.map(r => `${r.index}. ${r.enseignant} | ${r.classe} | ${r.matiere}\n   Raison: ${r.reason}`).join('\n\n');
      archive.append(Buffer.from(skipContent, 'utf-8'), { name: '00_LIGNES_IGNOREES.txt' });
    }

    // Générer chaque plan de leçon (uniquement les lignes valides)
    for (let i = 0; i < validRows.length; i++) {
      const { index: originalIndex, rowData } = validRows[i];
      
      try {
        // Extraire données
        const enseignant = rowData[findKey(rowData, 'Enseignant')] || '';
        const classe = rowData[findKey(rowData, 'Classe')] || '';
        const matiere = rowData[findKey(rowData, 'Matière')] || '';
        const lecon = rowData[findKey(rowData, 'Leçon')] || '';
        const jour = rowData[findKey(rowData, 'Jour')] || '';
        const seance = rowData[findKey(rowData, 'Période')] || '';
        const support = rowData[findKey(rowData, 'Support')] || 'Non spécifié';
        const travaux = rowData[findKey(rowData, 'Travaux de classe')] || 'Non spécifié';
        const devoirsPrevus = rowData[findKey(rowData, 'Devoirs')] || 'Non spécifié';

        console.log(`📝 [${i+1}/${validRows.length}] (Ligne originale #${originalIndex+1}) ${enseignant} | ${classe} | ${matiere}`);
        console.log(`  ├─ Leçon: "${lecon.substring(0, 50)}${lecon.length > 50 ? '...' : ''}"`);
        console.log(`  ├─ Travaux: "${travaux.substring(0, 30)}${travaux.length > 30 ? '...' : ''}"`);
        console.log(`  └─ Support: "${support.substring(0, 30)}${support.length > 30 ? '...' : ''}"`);
        
        // Note: Cette vérification n'est plus nécessaire car déjà filtrée au début
        // Mais on la garde par sécurité
        if (!lecon || lecon.trim() === '') {
          throw new Error('⚠️ Leçon vide - impossible de générer un plan de leçon sans contenu de leçon');
        }

        // Date formatée
        let formattedDate = "";
        if (jour && datesNode?.start) {
          const weekStartDateNode = new Date(datesNode.start + 'T00:00:00Z');
          if (!isNaN(weekStartDateNode.getTime())) {
            const dayName = extractDayNameFromString(jour);
            if (dayName) {
              const dateOfDay = getDateForDayNameNode(weekStartDateNode, dayName);
              if (dateOfDay) formattedDate = formatDateFrenchNode(dateOfDay);
            }
          }
        }

        // Prompt selon la langue de l'enseignant
        const jsonStructure = `{"TitreUnite":"un titre d'unité pertinent pour la leçon","Methodes":"liste des méthodes d'enseignement","Outils":"liste des outils de travail","Objectifs":"une liste concise des objectifs d'apprentissage (compétences, connaissances), séparés par des sauts de ligne (\\\\n). Commence chaque objectif par un tiret (-).","etapes":[{"phase":"Introduction","duree":"5 min","activite":"Description de l'activité d'introduction pour l'enseignant et les élèves."},{"phase":"Activité Principale","duree":"25 min","activite":"Description de l'activité principale, en intégrant les 'travaux de classe' et le 'support' si possible."},{"phase":"Synthèse","duree":"10 min","activite":"Description de l'activité de conclusion et de vérification des acquis."},{"phase":"Clôture","duree":"5 min","activite":"Résumé rapide et annonce des devoirs."}],"Ressources":"les ressources spécifiques à utiliser.","Devoirs":"une suggestion de devoirs.","DiffLents":"une suggestion pour aider les apprenants en difficulté.","DiffTresPerf":"une suggestion pour stimuler les apprenants très performants.","DiffTous":"une suggestion de différenciation pour toute la classe."}`;

        let prompt;
        if (englishTeachers.includes(enseignant)) {
          prompt = `Return ONLY valid JSON. No markdown, no code fences, no commentary.\n\nAs an expert pedagogical assistant, create a detailed 45-minute lesson plan in English. Structure the lesson into timed phases and integrate the teacher's existing notes:\n- Subject: ${matiere}, Class: ${classe}, Lesson Topic: ${lecon}\n- Planned Classwork: ${travaux}\n- Mentioned Support/Materials: ${support}\n- Planned Homework: ${devoirsPrevus}\n\nUse the following JSON structure with professional, concrete values in English (keys exactly as specified):\n${jsonStructure}`;
        } else if (arabicTeachers.includes(enseignant)) {
          prompt = `أعد فقط JSON صالحًا. بدون Markdown أو أسوار كود أو تعليقات.\n\nبصفتك مساعدًا تربويًا خبيرًا، أنشئ خطة درس مفصلة باللغة العربية مدتها 45 دقيقة. قم ببناء الدرس في مراحل محددة زمنياً وادمج ملاحظات المعلم:\n- المادة: ${matiere}، الفصل: ${classe}، الموضوع: ${lecon}\n- أعمال الصف المخطط لها: ${travaux}\n- الدعم/المواد: ${support}\n- الواجبات المخطط لها: ${devoirsPrevus}\n\nاستخدم البنية التالية بالقيم المهنية والملموسة (المفاتيح كما هي بالإنجليزية):\n${jsonStructure}`;
        } else {
          prompt = `Renvoie UNIQUEMENT du JSON valide. Pas de markdown, pas de blocs de code, pas de commentaire.\n\nEn tant qu'assistant pédagogique expert, crée un plan de leçon détaillé de 45 minutes en français. Structure en phases chronométrées et intègre les notes de l'enseignant :\n- Matière : ${matiere}, Classe : ${classe}, Thème : ${lecon}\n- Travaux de classe : ${travaux}\n- Support/Matériel : ${support}\n- Devoirs prévus : ${devoirsPrevus}\n\nUtilise la structure JSON suivante (valeurs concrètes et professionnelles ; clés strictement identiques) :\n${jsonStructure}`;
        }

        // Appel API selon le provider avec RETRY automatique
        let aiResponse, aiResult, rawContent;
        let retryCount = 0;
        const MAX_RETRIES = 3;
        
        while (retryCount <= MAX_RETRIES) {
          try {
            if (USE_GROQ) {
              // GROQ API
              const API_URL = 'https://api.groq.com/openai/v1/chat/completions';
              aiResponse = await fetch(API_URL, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${GROQ_API_KEY}`
                },
                body: JSON.stringify({
                  model: 'llama-3.3-70b-versatile',
                  messages: [{ role: 'user', content: prompt }],
                  temperature: 0.7,
                  max_tokens: 2048
                })
              });
              
              if (!aiResponse.ok) {
                const errorBody = await aiResponse.json().catch(() => ({}));
                
                // Si erreur 429 (rate limit), on réessaye après un délai
                if (aiResponse.status === 429 && retryCount < MAX_RETRIES) {
                  const waitTime = Math.pow(2, retryCount) * 5000; // 5s, 10s, 20s
                  console.log(`⏳ [GROQ] Rate limit atteint, attente ${waitTime/1000}s avant retry ${retryCount+1}/${MAX_RETRIES}`);
                  await new Promise(resolve => setTimeout(resolve, waitTime));
                  retryCount++;
                  continue; // Réessayer
                }
                
                console.error(`❌ [GROQ Error] Status ${aiResponse.status}:`, JSON.stringify(errorBody, null, 2));
                throw new Error(`API GROQ error ${aiResponse.status}: ${errorBody.error?.message || JSON.stringify(errorBody)}`);
              }
              
              aiResult = await aiResponse.json();
              rawContent = aiResult?.choices?.[0]?.message?.content || "";
              
              if (!rawContent) {
                console.error('❌ [GROQ] Réponse vide:', JSON.stringify(aiResult, null, 2));
                throw new Error('GROQ a retourné une réponse vide');
              }
              
              break; // Succès, sortir de la boucle retry
              
            } else {
              // GEMINI API
              const API_URL = `https://generativelanguage.googleapis.com/v1/models/${MODEL_NAME}:generateContent?key=${GEMINI_API_KEY}`;
              aiResponse = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contents: [{ role: "user", parts: [{ text: prompt }] }]
                })
              });
              
              if (!aiResponse.ok) {
                const errorBody = await aiResponse.json().catch(() => ({}));
                
                // Si erreur 429 (rate limit), on réessaye après un délai
                if (aiResponse.status === 429 && retryCount < MAX_RETRIES) {
                  const waitTime = Math.pow(2, retryCount) * 5000; // 5s, 10s, 20s
                  console.log(`⏳ [GEMINI] Quota dépassé, attente ${waitTime/1000}s avant retry ${retryCount+1}/${MAX_RETRIES}`);
                  await new Promise(resolve => setTimeout(resolve, waitTime));
                  retryCount++;
                  continue; // Réessayer
                }
                
                console.error(`❌ [GEMINI Error] Status ${aiResponse.status}:`, JSON.stringify(errorBody, null, 2));
                
                // Message spécifique pour quota dépassé
                if (aiResponse.status === 429) {
                  throw new Error(`⚠️ QUOTA GEMINI DÉPASSÉ (429): ${errorBody.error?.message || 'Limite atteinte'}`);
                }
                
                throw new Error(`API GEMINI error ${aiResponse.status}: ${errorBody.error?.message || JSON.stringify(errorBody)}`);
              }
              
              aiResult = await aiResponse.json();
              rawContent = aiResult?.candidates?.[0]?.content?.parts?.[0]?.text || "";
              
              if (!rawContent) {
                console.error('❌ [GEMINI] Réponse vide:', JSON.stringify(aiResult, null, 2));
                throw new Error('GEMINI a retourné une réponse vide');
              }
              
              break; // Succès, sortir de la boucle retry
            }
          } catch (fetchError) {
            // Si erreur réseau, réessayer
            if (retryCount < MAX_RETRIES) {
              const waitTime = Math.pow(2, retryCount) * 3000; // 3s, 6s, 12s
              console.log(`⏳ Erreur réseau, attente ${waitTime/1000}s avant retry ${retryCount+1}/${MAX_RETRIES}`);
              await new Promise(resolve => setTimeout(resolve, waitTime));
              retryCount++;
              continue;
            }
            throw fetchError; // Après 3 essais, lancer l'erreur
          }
        }
        
        // Parser JSON
        let jsonData;
        try {
          const cleanedJson = rawContent.replace(/```json\n?|```\n?/g, '').trim();
          
          if (!cleanedJson) {
            throw new Error('Contenu JSON vide après nettoyage');
          }
          
          jsonData = JSON.parse(cleanedJson);
          
          // Vérifier que les champs essentiels sont présents
          if (!jsonData.TitreUnite && !jsonData.Objectifs && !jsonData.etapes) {
            throw new Error('Structure JSON invalide : champs essentiels manquants');
          }
        } catch (parseError) {
          console.error(`❌ Erreur parsing JSON pour ${classe} ${matiere}:`);
          console.error(`  - Message: ${parseError.message}`);
          console.error(`  - Contenu brut (100 premiers chars): ${rawContent.substring(0, 100)}`);
          throw new Error(`Format JSON invalide: ${parseError.message}`);
        }

        // Générer le document Word
        const zip = new PizZip(templateBuffer);
        const doc = new Docxtemplater(zip, { paragraphLoop: true, nullGetter: () => "" });

        // Formatter les données pour le template
        const minutageString = (jsonData.etapes || []).map(e =>
          `${e.phase || ""} (${e.duree || ""}):\n${e.activite || ""}`
        ).join('\n\n');

        const templateData = {
          TitreUnite: jsonData.TitreUnite || "",
          Methodes: jsonData.Methodes || "",
          Outils: jsonData.Outils || "",
          Objectifs: jsonData.Objectifs || "",
          Ressources: jsonData.Ressources || "",
          Devoirs: jsonData.Devoirs || "",
          DiffLents: jsonData.DiffLents || "",
          DiffTresPerf: jsonData.DiffTresPerf || "",
          DiffTous: jsonData.DiffTous || "",
          Classe: classe,
          Matiere: matiere,
          Lecon: lecon,
          Seance: seance,
          NomEnseignant: enseignant,
          Date: formattedDate,
          Deroulement: minutageString,
          Contenu: minutageString, // Le contenu est le déroulement des étapes
          Minutage: minutageString, // Alias pour compatibilité
        };

        doc.render(templateData);
        const docBuffer = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });

        // Format: Matière_Classe_Semaine_Séance_Enseignant.docx
        const docFilename = `${sanitizeForFilename(matiere)}_${sanitizeForFilename(classe)}_S${weekNumber}_P${sanitizeForFilename(seance)}_${sanitizeForFilename(enseignant)}.docx`;
        
        // Ajouter au ZIP
        archive.append(docBuffer, { name: docFilename });
        successCount++;
        
        console.log(`✅ [${i+1}/${validRows.length}] Généré: ${docFilename}`);

        // Délai adaptatif pour éviter rate limit
        if (i < validRows.length - 1) {
          // Délai progressif : 3s pour les premières, 5s après 10, 8s après 20
          let delay = 3000; // 3 secondes par défaut
          if (i >= 20) delay = 8000; // 8 secondes après 20 générations
          else if (i >= 10) delay = 5000; // 5 secondes après 10 générations
          
          console.log(`⏳ Pause de ${delay/1000}s avant la prochaine génération...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }

      } catch (error) {
        const classe = rowData[findKey(rowData, 'Classe')] || 'Unknown';
        const matiere = rowData[findKey(rowData, 'Matière')] || 'Unknown';
        const enseignant = rowData[findKey(rowData, 'Enseignant')] || 'Unknown';
        const lecon = rowData[findKey(rowData, 'Leçon')] || 'VIDE';
        
        console.error(`❌ Erreur pour ligne ${i+1}:`, {
          error: error.message,
          stack: error.stack,
          classe,
          matiere,
          enseignant,
          lecon: lecon.substring(0, 50) // Premiers 50 caractères
        });
        errorCount++;
        
        // Ajouter un fichier texte d'erreur DÉTAILLÉ dans le ZIP
        const errorFilename = `ERREUR_${String(i+1).padStart(2, '0')}_${sanitizeForFilename(classe)}_${sanitizeForFilename(matiere)}.txt`;
        const errorContent = `❌ ERREUR DE GÉNÉRATION - PLAN DE LEÇON IA

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📍 INFORMATIONS DE LA LIGNE
  Ligne valide    : ${i+1}/${validRows.length}
  Ligne originale : ${originalIndex+1}/${rowsData.length}
  
👤 ENSEIGNANT     : ${enseignant}
📚 CLASSE         : ${classe}
📖 MATIÈRE        : ${matiere}

📝 LEÇON (premiers 300 caractères) :
${lecon.substring(0, 300)}${lecon.length > 300 ? '...' : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️  ERREUR DÉTECTÉE :
${error.message}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔍 STACK TRACE COMPLET :
${error.stack}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 DONNÉES COMPLÈTES DE LA LIGNE :
${JSON.stringify(rowData, null, 2)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 SOLUTIONS POSSIBLES :
1. Vérifier que la clé API (GROQ ou GEMINI) est valide
2. Vérifier que le quota API n'est pas dépassé
3. Vérifier que la leçon contient suffisamment d'information
4. Réessayer la génération plus tard si c'est un problème de quota
5. Contacter le support si l'erreur persiste

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Date: ${new Date().toISOString()}
Provider IA: ${USE_GROQ ? 'GROQ (llama-3.3-70b-versatile)' : 'GEMINI'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
        archive.append(Buffer.from(errorContent, 'utf-8'), { name: errorFilename });
      }
    }

    console.log(`📊 [Multiple AI] Résultat: ${successCount} succès, ${errorCount} erreurs`);
    
    // Ajouter un fichier récapitulatif final
    const summaryContent = `📊 RÉCAPITULATIF DE GÉNÉRATION - PLANS DE LEÇON IA
    
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📅 Date de génération : ${new Date().toLocaleString('fr-FR')}
📦 Semaine            : ${week}
🔧 Provider IA        : ${USE_GROQ ? 'GROQ (llama-3.3-70b-versatile)' : 'GEMINI (' + (MODEL_NAME || 'N/A') + ')'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📈 STATISTIQUES :
  Lignes totales reçues  : ${rowsData.length}
  Lignes valides         : ${validRows.length}
  Lignes ignorées        : ${skippedRows.length} (leçons vides)
  
  ✅ Succès              : ${successCount}
  ❌ Erreurs             : ${errorCount}
  
  📊 Taux de réussite    : ${validRows.length > 0 ? Math.round((successCount / validRows.length) * 100) : 0}%

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${errorCount > 0 ? `⚠️  ATTENTION : ${errorCount} erreur(s) détectée(s)
Consultez les fichiers ERREUR_XX_*.txt pour plus de détails.

💡 CAUSES POSSIBLES DES ERREURS :
- Quota API dépassé (429)
- Problème de connexion réseau
- Format de réponse invalide de l'IA
- Données de leçon insuffisantes

🔑 SOLUTION : Configurer GROQ_API_KEY sur Vercel
GROQ offre un quota gratuit plus généreux que GEMINI.
Instructions : Voir README.md du projet
` : '🎉 Toutes les générations ont réussi !'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📁 CONTENU DU ZIP :
${skippedRows.length > 0 ? `  - 00_LIGNES_IGNOREES.txt (${skippedRows.length} lignes)\n` : ''}  - ${successCount} fichier(s) .docx (plans générés)
${errorCount > 0 ? `  - ${errorCount} fichier(s) ERREUR_*.txt (détails des erreurs)\n` : ''}  - 99_RECAPITULATIF.txt (ce fichier)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Généré par le système de gestion des plans hebdomadaires
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
    archive.append(Buffer.from(summaryContent, 'utf-8'), { name: '99_RECAPITULATIF.txt' });
    
    archive.finalize();

  } catch (error) {
    console.error('❌ Erreur serveur /generate-multiple-ai-lesson-plans:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: `Erreur interne: ${error.message}` });
    }
  }
});

// Télécharger un plan de leçon depuis MongoDB
app.get('/api/download-lesson-plan/:lessonPlanId', async (req, res) => {
  try {
    const { lessonPlanId } = req.params;
    console.log(`📥 [Download Lesson Plan] Téléchargement: ${lessonPlanId}`);
    
    const db = await connectToDatabase();
    const lessonPlan = await db.collection('lessonPlans').findOne({ _id: lessonPlanId });
    
    if (!lessonPlan) {
      return res.status(404).json({ message: 'Plan de leçon introuvable.' });
    }
    
    res.setHeader('Content-Disposition', `attachment; filename="${lessonPlan.filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.send(lessonPlan.fileBuffer.buffer);
    
    console.log(`✅ [Download Lesson Plan] Envoyé: ${lessonPlan.filename}`);
    
  } catch (error) {
    console.error('❌ Erreur téléchargement plan de leçon:', error);
    res.status(500).json({ message: 'Erreur lors du téléchargement du plan de leçon.' });
  }
});

// Obtenir la liste des plans de leçon pour une semaine spécifique
app.get('/api/lesson-plans/:week', async (req, res) => {
  try {
    const week = parseInt(req.params.week, 10);
    if (isNaN(week)) {
      return res.status(400).json({ message: 'Numéro de semaine invalide.' });
    }
    
    console.log(`📋 [Lesson Plans List] Récupération pour semaine ${week}`);
    
    const db = await connectToDatabase();
    const lessonPlans = await db.collection('lessonPlans')
      .find({ week }, { projection: { fileBuffer: 0 } }) // Exclure le buffer pour économiser la bande passante
      .toArray();
    
    console.log(`✅ [Lesson Plans List] ${lessonPlans.length} plan(s) trouvé(s)`);
    res.status(200).json(lessonPlans);
    
  } catch (error) {
    console.error('❌ Erreur récupération liste plans de leçon:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des plans de leçon.' });
  }
});

// --------------------- Test de Rappels Forcé (Semaine 17) ---------------------

app.post('/api/test-weekly-reminders', async (req, res) => {
  try {
    const { apiKey, weekNumber } = req.body;
    const targetWeek = weekNumber || 17; // Par défaut à la semaine 17
    
    // Sécurité basique avec clé API
    const CRON_API_KEY = process.env.CRON_API_KEY || 'default-cron-key-change-me';
    if (apiKey !== CRON_API_KEY) {
      return res.status(401).json({ message: 'Non autorisé. Clé API invalide.' });
    }

    console.log(`🧪 [Test Reminders] Test forcé pour la semaine ${targetWeek}`);

    // Récupérer les données de la semaine
    const db = await connectToDatabase();
    const planDocument = await db.collection('plans').findOne({ week: targetWeek });
    
    if (!planDocument || !planDocument.data || planDocument.data.length === 0) {
      return res.status(200).json({ 
        message: `Aucune donnée pour la semaine ${targetWeek}.`,
        week: targetWeek
      });
    }

    // Trouver les enseignants avec des travaux incomplets
    const incompleteTeachers = {};
    const planData = planDocument.data;
    
    planData.forEach(item => {
      const teacher = item[findKey(item, 'Enseignant')];
      const taskVal = item[findKey(item, 'Travaux de classe')];
      const className = item[findKey(item, 'Classe')];
      
      // Un enseignant est incomplet si au moins un "Travaux de classe" est vide
      if (teacher && className && (taskVal == null || String(taskVal).trim() === '')) {
        if (!incompleteTeachers[teacher]) {
          incompleteTeachers[teacher] = new Set();
        }
        incompleteTeachers[teacher].add(className);
      }
    });

    const teachersToNotify = Object.keys(incompleteTeachers);
    console.log(`📊 [Test Reminders] ${teachersToNotify.length} enseignants incomplets:`, teachersToNotify);

    if (teachersToNotify.length === 0) {
      return res.status(200).json({ 
        message: 'Tous les enseignants ont complété leurs plans.',
        week: targetWeek
      });
    }

    // Récupérer les abonnements push depuis MongoDB
    const subscriptions = await db.collection('pushSubscriptions').find({}).toArray();
    
    let notificationsSent = 0;
    const notificationResults = [];

    // Envoyer des notifications à chaque enseignant incomplet
    for (const teacher of teachersToNotify) {
      const subscription = subscriptions.find(sub => sub.username === teacher);
      
      if (subscription && subscription.subscription) {
        const classes = [...incompleteTeachers[teacher]].sort().join(', ');
        const lang = getTeacherLanguage(teacher);
        const msgs = notificationMessages[lang];
        
        // Message de rappel avec urgence
        const message = {
          title: msgs.reminderTitle,
          body: msgs.reminderBody(teacher, targetWeek),
          icon: 'https://cdn.glitch.global/1c613b14-019c-488a-a856-d55d64d174d0/al-kawthar-international-schools-jeddah-saudi-arabia-modified.png?v=1739565146299',
          badge: 'https://cdn.glitch.global/1c613b14-019c-488a-a856-d55d64d174d0/al-kawthar-international-schools-jeddah-saudi-arabia-modified.png?v=1739565146299',
          requireInteraction: true,
          vibrate: [200, 100, 200, 100, 200],
          tag: `plan-reminder-${targetWeek}-${Date.now()}`, // Tag unique pour chaque rappel
          renotify: true, // Force la réaffichage même si tag similaire
          data: {
            url: 'https://plan-hebdomadaire-2026-boys.vercel.app',
            week: targetWeek,
            teacher: teacher,
            classes: classes,
            lang: lang,
            playSound: true,
            timestamp: new Date().toISOString()
          }
        };

        try {
          const payload = JSON.stringify(message);
          await webpush.sendNotification(subscription.subscription, payload);
          
          notificationResults.push({
            teacher: teacher,
            classes: classes,
            language: lang,
            status: 'sent'
          });
          
          notificationsSent++;
          console.log(`✅ [Test Reminders] Notification envoyée à ${teacher} (${lang})`);
        } catch (error) {
          console.error(`❌ [Test Reminders] Erreur notification pour ${teacher}:`, error);
          notificationResults.push({
            teacher: teacher,
            status: 'error',
            error: error.message
          });
          
          // Si l'abonnement est invalide (410 Gone), le supprimer
          if (error.statusCode === 410) {
            console.log(`🗑️ Suppression de l'abonnement invalide pour ${teacher}`);
            await db.collection('pushSubscriptions').deleteOne({ username: teacher });
          }
        }
      } else {
        console.log(`ℹ️ [Test Reminders] ${teacher} n'a pas d'abonnement push`);
        notificationResults.push({
          teacher: teacher,
          status: 'no_subscription'
        });
      }
    }

    res.status(200).json({
      message: `Test de rappel forcé terminé pour la semaine ${targetWeek}.`,
      week: targetWeek,
      incompleteCount: teachersToNotify.length,
      notificationsSent: notificationsSent,
      results: notificationResults
    });

  } catch (error) {
    console.error('❌ [Test Reminders] Erreur:', error);
    res.status(500).json({ 
      message: 'Erreur serveur.',
      error: error.message 
    });
  }
});

// --------------------- Système de Notifications Push ---------------------

// Stocker les abonnements push (en production, utiliser une vraie DB)
const pushSubscriptions = new Map();

// Sauvegarder un abonnement push
app.post('/api/subscribe-push', async (req, res) => {
  try {
    const { username, subscription } = req.body;
    if (!username || !subscription) {
      return res.status(400).json({ message: 'Username et subscription requis.' });
    }

    // Sauvegarder dans MongoDB
    const db = await connectToDatabase();
    await db.collection('pushSubscriptions').updateOne(
      { username: username },
      { $set: { subscription: subscription, updatedAt: new Date() } },
      { upsert: true }
    );

    // Cache local
    pushSubscriptions.set(username, subscription);
    
    console.log(`✅ Abonnement push sauvegardé pour ${username}`);
    res.status(200).json({ message: 'Abonnement enregistré avec succès.' });
  } catch (error) {
    console.error('Erreur /subscribe-push:', error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// Désabonner des notifications
app.post('/api/unsubscribe-push', async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) {
      return res.status(400).json({ message: 'Username requis.' });
    }

    const db = await connectToDatabase();
    await db.collection('pushSubscriptions').deleteOne({ username: username });
    pushSubscriptions.delete(username);
    
    console.log(`✅ Désabonnement push pour ${username}`);
    res.status(200).json({ message: 'Désabonnement réussi.' });
  } catch (error) {
    console.error('Erreur /unsubscribe-push:', error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// Messages multilingues pour les notifications
const notificationMessages = {
  fr: {
    title: '⚠️ Plan Hebdomadaire Incomplet',
    body: (teacher, week, classes) => `Bonjour ${teacher}, votre plan pour la semaine ${week} est incomplet pour: ${classes}. Veuillez le compléter.`,
    reminderTitle: '📋 Rappel: Finaliser le Plan Hebdomadaire',
    reminderBody: (teacher, week) => `Bonjour ${teacher}, n'oubliez pas de finaliser votre plan pour la semaine ${week}.`
  },
  ar: {
    title: '⚠️ الخطة الأسبوعية غير مكتملة',
    body: (teacher, week, classes) => `مرحباً ${teacher}، خطتك للأسبوع ${week} غير مكتملة للفصول: ${classes}. يرجى إكمالها.`,
    reminderTitle: '📋 تذكير: أكمل الخطة الأسبوعية',
    reminderBody: (teacher, week) => `مرحباً ${teacher}، لا تنسى إكمال خطتك للأسبوع ${week}.`
  },
  en: {
    title: '⚠️ Incomplete Weekly Plan',
    body: (teacher, week, classes) => `Hello ${teacher}, your plan for week ${week} is incomplete for: ${classes}. Please complete it.`,
    reminderTitle: '📋 Reminder: Finalize Weekly Plan',
    reminderBody: (teacher, week) => `Hello ${teacher}, don't forget to finalize your plan for week ${week}.`
  }
};

// Déterminer la langue d'un enseignant
function getTeacherLanguage(teacher) {
  if (arabicTeachers.includes(teacher)) return 'ar';
  if (englishTeachers.includes(teacher)) return 'en';
  return 'fr';
}

// Vérifier les enseignants incomplets et envoyer des notifications
// Cette route sera appelée par un CRON job chaque LUNDI (3 fois par jour)
app.all('/api/check-incomplete-and-notify', async (req, res) => {
  try {
    const apiKey = (req.body && req.body.apiKey) || req.query.apiKey || req.headers['x-cron-key'] || (req.headers['authorization'] ? req.headers['authorization'].replace(/^Bearer\s+/i, '') : null);
    
    // Sécurité avec clé API (si configurée dans l'environnement)
    const expectedKey = process.env.CRON_API_KEY || process.env.CRON_SECRET;
    if (expectedKey && apiKey !== expectedKey) {
      return res.status(401).json({ message: 'Non autorisé. Clé Cron invalide.' });
    }

    // Déterminer la semaine actuelle
    const currentDate = new Date();
    let currentWeek = null;
    
    // Trouver la semaine actuelle
    for (const [week, dates] of Object.entries(specificWeekDateRangesNode)) {
      const startDate = new Date(dates.start + 'T00:00:00Z');
      const endDate = new Date(dates.end + 'T23:59:59Z');
      
      if (currentDate >= startDate && currentDate <= endDate) {
        currentWeek = parseInt(week, 10);
        break;
      }
    }

    if (!currentWeek) {
      return res.status(200).json({ message: 'Aucune semaine active actuellement.' });
    }

    console.log(`📅 Vérification des plans incomplets pour la semaine ${currentWeek}`);

    // Récupérer les données de la semaine
    const db = await connectToDatabase();
    const planDocument = await db.collection('plans').findOne({ week: currentWeek });
    
    if (!planDocument || !planDocument.data || planDocument.data.length === 0) {
      return res.status(200).json({ message: `Aucune donnée pour la semaine ${currentWeek}.` });
    }

    // Trouver les enseignants avec des travaux incomplets
    const incompleteTeachers = {};
    const planData = planDocument.data;
    
    planData.forEach(item => {
      const teacher = item[findKey(item, 'Enseignant')];
      const taskVal = item[findKey(item, 'Travaux de classe')];
      const className = item[findKey(item, 'Classe')];
      
      if (teacher && className && (taskVal == null || String(taskVal).trim() === '')) {
        if (!incompleteTeachers[teacher]) {
          incompleteTeachers[teacher] = new Set();
        }
        incompleteTeachers[teacher].add(className);
      }
    });

    const teachersToNotify = Object.keys(incompleteTeachers);
    console.log(`📊 ${teachersToNotify.length} enseignants avec plans incomplets:`, teachersToNotify);

    // Récupérer les abonnements push depuis MongoDB
    const subscriptions = await db.collection('pushSubscriptions').find({}).toArray();
    
    let notificationsSent = 0;
    const notificationResults = [];

    // Envoyer des notifications à chaque enseignant incomplet avec leur langue
    for (const teacher of teachersToNotify) {
      const subscription = subscriptions.find(sub => sub.username === teacher);
      
      if (subscription && subscription.subscription) {
        const classes = [...incompleteTeachers[teacher]].sort().join(', ');
        const lang = getTeacherLanguage(teacher);
        const msgs = notificationMessages[lang];
        
        const message = {
          title: msgs.title,
          body: msgs.body(teacher, currentWeek, classes),
          icon: 'https://cdn.glitch.global/1c613b14-019c-488a-a856-d55d64d174d0/al-kawthar-international-schools-jeddah-saudi-arabia-modified.png?v=1739565146299',
          badge: 'https://cdn.glitch.global/1c613b14-019c-488a-a856-d55d64d174d0/al-kawthar-international-schools-jeddah-saudi-arabia-modified.png?v=1739565146299',
          requireInteraction: true,
          vibrate: [200, 100, 200, 100, 200],
          tag: `plan-reminder-${currentWeek}`,
          data: {
            url: 'https://plan-hebdomadaire-2026-boys.vercel.app',
            week: currentWeek,
            teacher: teacher,
            classes: classes,
            lang: lang,
            playSound: true
          }
        };

        try {
          // Envoyer la notification push via web-push
          const payload = JSON.stringify(message);
          
          await webpush.sendNotification(subscription.subscription, payload);
          
          notificationResults.push({
            teacher: teacher,
            classes: classes,
            language: lang,
            status: 'sent',
            message: message
          });
          
          notificationsSent++;
          console.log(`✅ Notification envoyée à ${teacher} (${lang}) pour ${classes}`);
        } catch (error) {
          console.error(`❌ Erreur notification pour ${teacher}:`, error);
          notificationResults.push({
            teacher: teacher,
            status: 'error',
            error: error.message
          });
          
          // Si l'abonnement est invalide (410 Gone), le supprimer
          if (error.statusCode === 410) {
            console.log(`🗑️ Suppression de l'abonnement invalide pour ${teacher}`);
            await db.collection('pushSubscriptions').deleteOne({ username: teacher });
          }
        }
      } else {
        console.log(`ℹ️ ${teacher} n'a pas d'abonnement push`);
        notificationResults.push({
          teacher: teacher,
          status: 'no_subscription'
        });
      }
    }

    res.status(200).json({
      message: `Vérification terminée pour la semaine ${currentWeek}.`,
      week: currentWeek,
      incompleteCount: teachersToNotify.length,
      notificationsSent: notificationsSent,
      results: notificationResults
    });

  } catch (error) {
    console.error('❌ Erreur /check-incomplete-and-notify:', error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// Endpoint pour tester les notifications manuellement
app.post('/api/test-notification', async (req, res) => {
  try {
    const { username } = req.body;
    
    if (!username) {
      return res.status(400).json({ message: 'Username requis.' });
    }

    const db = await connectToDatabase();
    const subscription = await db.collection('pushSubscriptions').findOne({ username: username });
    
    if (!subscription) {
      return res.status(404).json({ message: `Aucun abonnement trouvé pour ${username}.` });
    }

    console.log(`🧪 Test de notification pour ${username}`);
    
    // Envoyer une notification de test
    const testMessage = {
      title: '🧪 Test de Notification',
      body: `Bonjour ${username}, ceci est un test de notification push. Si vous voyez ce message, les notifications fonctionnent correctement !`,
      icon: 'https://cdn.glitch.global/1c613b14-019c-488a-a856-d55d64d174d0/al-kawthar-international-schools-jeddah-saudi-arabia-modified.png?v=1739565146299',
      data: {
        url: 'https://plan-hebdomadaire-2026-boys.vercel.app',
        teacher: username
      }
    };

    try {
      const payload = JSON.stringify(testMessage);
      await webpush.sendNotification(subscription.subscription, payload);
      
      res.status(200).json({ 
        message: 'Notification de test envoyée avec succès.',
        username: username,
        hasSubscription: true
      });
    } catch (pushError) {
      console.error('❌ Erreur envoi notification test:', pushError);
      
      // Si l'abonnement est invalide (410 Gone), le supprimer
      if (pushError.statusCode === 410) {
        console.log(`🗑️ Suppression de l'abonnement invalide pour ${username}`);
        await db.collection('pushSubscriptions').deleteOne({ username: username });
      }
      
      throw new Error(`Échec d'envoi: ${pushError.message}`);
    }

  } catch (error) {
    console.error('❌ Erreur /test-notification:', error);
    res.status(500).json({ 
      message: 'Erreur serveur.',
      error: error.message 
    });
  }
});

// Endpoint pour obtenir la clé publique VAPID (nécessaire pour le frontend)
app.get('/api/vapid-public-key', (req, res) => {
  res.status(200).json({ publicKey: VAPID_PUBLIC_KEY });
});

// ✅ FONCTIONNALITÉ 3: Système d'alertes automatiques hebdomadaires
// Route pour vérifier et envoyer des alertes TOUTES LES 3 HEURES depuis le LUNDI
// Cette route peut être appelée par Vercel Cron ou un CRON job externe
app.all('/api/send-weekly-reminders', async (req, res) => {
  try {
    const apiKey = (req.body && req.body.apiKey) || req.query.apiKey || req.headers['x-cron-key'] || (req.headers['authorization'] ? req.headers['authorization'].replace(/^Bearer\s+/i, '') : null);
    
    // Sécurité avec clé API (si configurée dans l'environnement)
    const expectedKey = process.env.CRON_API_KEY || process.env.CRON_SECRET;
    if (expectedKey && apiKey !== expectedKey) {
      return res.status(401).json({ message: 'Non autorisé. Clé API invalide.' });
    }

    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Dimanche, 1 = Lundi, ..., 6 = Samedi
    const hourOfDay = now.getHours();

    console.log(`📅 [Weekly Reminders] Vérification: ${now.toISOString()} - Jour: ${dayOfWeek}, Heure: ${hourOfDay}`);

    // ⚠️ IMPORTANT: N'envoyer des alertes QUE du LUNDI (1) au JEUDI (4)
    // Le CRON doit tourner toutes les 3 heures pendant ces jours
    if (dayOfWeek < 1 || dayOfWeek > 4) {
      return res.status(200).json({ 
        message: 'Alerte désactivée (hors période Lundi-Jeudi).',
        day: ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'][dayOfWeek],
        timestamp: now.toISOString()
      });
    }

    // Déterminer la semaine actuelle
    let currentWeek = null;
    
    for (const [week, dates] of Object.entries(specificWeekDateRangesNode)) {
      const startDate = new Date(dates.start + 'T00:00:00Z');
      const endDate = new Date(dates.end + 'T23:59:59Z');
      
      if (now >= startDate && now <= endDate) {
        currentWeek = parseInt(week, 10);
        break;
      }
    }

    if (!currentWeek) {
      return res.status(200).json({ message: 'Aucune semaine active actuellement.' });
    }

    console.log(`📅 [Weekly Reminders] Semaine active: ${currentWeek}`);

    // Récupérer les données de la semaine
    const db = await connectToDatabase();
    const planDocument = await db.collection('plans').findOne({ week: currentWeek });
    
    if (!planDocument || !planDocument.data || planDocument.data.length === 0) {
      return res.status(200).json({ 
        message: `Aucune donnée pour la semaine ${currentWeek}.`,
        week: currentWeek
      });
    }

    // Trouver les enseignants avec des travaux incomplets
    const incompleteTeachers = {};
    const planData = planDocument.data;
    
    planData.forEach(item => {
      const teacher = item[findKey(item, 'Enseignant')];
      const taskVal = item[findKey(item, 'Travaux de classe')];
      const className = item[findKey(item, 'Classe')];
      
      // Un enseignant est incomplet si au moins un "Travaux de classe" est vide
      if (teacher && className && (taskVal == null || String(taskVal).trim() === '')) {
        if (!incompleteTeachers[teacher]) {
          incompleteTeachers[teacher] = new Set();
        }
        incompleteTeachers[teacher].add(className);
      }
    });

    const teachersToNotify = Object.keys(incompleteTeachers);
    console.log(`📊 [Weekly Reminders] ${teachersToNotify.length} enseignants incomplets:`, teachersToNotify);

    if (teachersToNotify.length === 0) {
      return res.status(200).json({ 
        message: 'Tous les enseignants ont complété leurs plans.',
        week: currentWeek,
        timestamp: now.toISOString()
      });
    }

    // Récupérer les abonnements push depuis MongoDB
    const subscriptions = await db.collection('pushSubscriptions').find({}).toArray();
    
    let notificationsSent = 0;
    const notificationResults = [];

    // Envoyer des notifications à chaque enseignant incomplet
    for (const teacher of teachersToNotify) {
      const subscription = subscriptions.find(sub => sub.username === teacher);
      
      if (subscription && subscription.subscription) {
        const classes = [...incompleteTeachers[teacher]].sort().join(', ');
        const lang = getTeacherLanguage(teacher);
        const msgs = notificationMessages[lang];
        
        // Message de rappel avec urgence
        const message = {
          title: msgs.reminderTitle,
          body: msgs.reminderBody(teacher, currentWeek),
          icon: 'https://cdn.glitch.global/1c613b14-019c-488a-a856-d55d64d174d0/al-kawthar-international-schools-jeddah-saudi-arabia-modified.png?v=1739565146299',
          badge: 'https://cdn.glitch.global/1c613b14-019c-488a-a856-d55d64d174d0/al-kawthar-international-schools-jeddah-saudi-arabia-modified.png?v=1739565146299',
          requireInteraction: true,
          vibrate: [200, 100, 200, 100, 200],
          tag: `plan-reminder-${currentWeek}-${Date.now()}`, // Tag unique pour chaque rappel
          renotify: true, // Force la réaffichage même si tag similaire
          data: {
            url: 'https://plan-hebdomadaire-2026-boys.vercel.app',
            week: currentWeek,
            teacher: teacher,
            classes: classes,
            lang: lang,
            playSound: true,
            timestamp: now.toISOString()
          }
        };

        try {
          const payload = JSON.stringify(message);
          await webpush.sendNotification(subscription.subscription, payload);
          
          notificationResults.push({
            teacher: teacher,
            classes: classes,
            language: lang,
            status: 'sent',
            timestamp: now.toISOString()
          });
          
          notificationsSent++;
          console.log(`✅ [Weekly Reminders] Notification envoyée à ${teacher} (${lang})`);
        } catch (error) {
          console.error(`❌ [Weekly Reminders] Erreur notification pour ${teacher}:`, error);
          notificationResults.push({
            teacher: teacher,
            status: 'error',
            error: error.message
          });
          
          // Si l'abonnement est invalide (410 Gone), le supprimer
          if (error.statusCode === 410) {
            console.log(`🗑️ Suppression de l'abonnement invalide pour ${teacher}`);
            await db.collection('pushSubscriptions').deleteOne({ username: teacher });
          }
        }
      } else {
        console.log(`ℹ️ [Weekly Reminders] ${teacher} n'a pas d'abonnement push`);
        notificationResults.push({
          teacher: teacher,
          status: 'no_subscription'
        });
      }
    }

    res.status(200).json({
      message: `Rappels hebdomadaires envoyés pour la semaine ${currentWeek}.`,
      week: currentWeek,
      day: 'Lundi',
      hour: hourOfDay,
      incompleteCount: teachersToNotify.length,
      notificationsSent: notificationsSent,
      timestamp: now.toISOString(),
      results: notificationResults
    });

  } catch (error) {
    console.error('❌ [Weekly Reminders] Erreur:', error);
    res.status(500).json({ 
      message: 'Erreur serveur.',
      error: error.message 
    });
  }
});
// ============================================================================
// NOUVELLE ROUTE: Notification en temps réel pour enseignants incomplets
// ============================================================================
app.post('/api/notify-incomplete-teachers', async (req, res) => {
  try {
    const { week, incompleteTeachers } = req.body;
    
    if (!week || !incompleteTeachers || typeof incompleteTeachers !== 'object') {
      return res.status(400).json({ message: 'Paramètres invalides.' });
    }

    const db = await connectToDatabase();
    const teachersToNotify = Object.keys(incompleteTeachers);
    
    if (teachersToNotify.length === 0) {
      return res.status(200).json({ 
        message: 'Aucun enseignant incomplet.',
        notificationsSent: 0 
      });
    }

    console.log(`🔔 Notification en temps réel pour ${teachersToNotify.length} enseignants incomplets`);

    // Récupérer les abonnements push depuis MongoDB
    const subscriptions = await db.collection('pushSubscriptions').find({}).toArray();
    
    let notificationsSent = 0;
    const notificationResults = [];

    // Envoyer des notifications à chaque enseignant incomplet
    for (const teacher of teachersToNotify) {
      const subscription = subscriptions.find(sub => sub.username === teacher);
      
      if (subscription && subscription.subscription) {
        const classes = Array.isArray(incompleteTeachers[teacher]) 
          ? incompleteTeachers[teacher].join(', ')
          : incompleteTeachers[teacher];
        
        const lang = getTeacherLanguage(teacher);
        const msgs = notificationMessages[lang];
        
        const message = {
          title: msgs.title,
          body: msgs.body(teacher, week, classes),
          icon: 'https://cdn.glitch.global/1c613b14-019c-488a-a856-d55d64d174d0/al-kawthar-international-schools-jeddah-saudi-arabia-modified.png?v=1739565146299',
          badge: 'https://cdn.glitch.global/1c613b14-019c-488a-a856-d55d64d174d0/al-kawthar-international-schools-jeddah-saudi-arabia-modified.png?v=1739565146299',
          requireInteraction: true,
          vibrate: [200, 100, 200, 100, 200],
          tag: `plan-alert-${week}-${Date.now()}`,
          data: {
            url: 'https://plan-hebdomadaire-2026-boys.vercel.app',
            week: week,
            teacher: teacher,
            classes: classes,
            lang: lang,
            playSound: true
          }
        };

        try {
          const payload = JSON.stringify(message);
          await webpush.sendNotification(subscription.subscription, payload);
          
          notificationResults.push({
            teacher: teacher,
            classes: classes,
            language: lang,
            status: 'sent'
          });
          
          notificationsSent++;
          console.log(`✅ Notification envoyée à ${teacher} (${lang})`);
        } catch (error) {
          console.error(`❌ Erreur notification pour ${teacher}:`, error);
          notificationResults.push({
            teacher: teacher,
            status: 'error',
            error: error.message
          });
          
          // Si l'abonnement est invalide, le supprimer
          if (error.statusCode === 410) {
            console.log(`🗑️ Suppression abonnement invalide pour ${teacher}`);
            await db.collection('pushSubscriptions').deleteOne({ username: teacher });
          }
        }
      } else {
        console.log(`⚠️ Pas d'abonnement push pour ${teacher}`);
        notificationResults.push({
          teacher: teacher,
          status: 'no_subscription'
        });
      }
    }

    res.status(200).json({
      message: `Notifications envoyées: ${notificationsSent}/${teachersToNotify.length}`,
      notificationsSent: notificationsSent,
      totalIncomplete: teachersToNotify.length,
      results: notificationResults
    });

  } catch (error) {
    console.error('❌ Erreur /notify-incomplete-teachers:', error);
    res.status(500).json({ 
      message: 'Erreur serveur.',
      error: error.message 
    });
  }
});
// Configuration Port et Host
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

// Ne démarrer le serveur d'écoute HTTP que si on n'est pas sur une fonction Serverless Vercel
if (!process.env.VERCEL) {
  app.listen(PORT, HOST, () => {
    console.log(`✅ Server is running and listening on http://${HOST}:${PORT}`);
    console.log(`🚀 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔑 IA Provider: ${USE_GROQ ? 'GROQ (llama-3.3-70b)' : 'GEMINI'}`);
    console.log(`📊 MongoDB: ${MONGO_URL ? '✅ Configured' : '❌ Missing'}`);
    console.log(`📄 Templates: ${LESSON_TEMPLATE_URL && WORD_TEMPLATE_URL ? '✅ Configured' : '❌ Missing'}`);
  });
}

// Enregistrer l'instance globale pour éviter les rechargements multiples
global.appInstance = app;

// Export obligatoire pour Vercel Serverless Functions
module.exports = app;

