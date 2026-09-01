        console.log("Script principal démarré.");

        // Variables globales
        let loggedInUser = null;
        let loggedInTeacherTable = localStorage.getItem('tableTeacherName') || '';
        let currentUserLanguage = 'fr';
        let currentSection = localStorage.getItem('selectedSection') || localStorage.getItem('currentSection') || 'garcons';
        let planData = [];
        let filteredAndSortedData = [];
        let uploadedPlanData = null;
        let headers = [];
        let currentWeek = null;
        let weekStartDate = null;
        let weeklyClassNotes = {};
        let alertTimeoutId = null;
        let incompleteTeachersInfo = {};

        // Listes strictes des enseignants par section
        const maleTeachersList = [
            'Mohamed', 'Abas', 'Jaber', 'Imad', 'Kamel', 'Majed', 'Mohamed Ali', 'Morched', 
            'Saeed', 'Sami', 'Sylvano', 'Tonga', 'Oumarou', 'Zine', 'Youssouf'
        ];

        const femaleTeachersList = [
            'Amina', 'Fatima', 'Khadija', 'Mariam', 'Salma', 'Zainab', 'Nour', 'Houda', 
            'Leila', 'Sarah', 'Zohra', 'Farah', 'Music', 'Musique', 'Amal', 'Amal Arabe'
        ];

        const primaireTeachersList = [
            'Nadia', 'Samira', 'Imane', 'Fatima Zahra', 'Mouna', 'Siham', 'Hajar', 'Meriem', 
            'Salma P', 'Khadija P', 'Aicha', 'Hanane', 'Farah', 'Music', 'Musique', 'Amal'
        ];

        const isMusicTeacher = (name) => {
            if (!name) return false;
            const n = String(name).trim().toLowerCase();
            return n === 'farah' || n.includes('farah') || n === 'music' || n === 'musique' || n.includes('music') || n.includes('musique');
        };

        const isAmalArabeTeacher = (name) => {
            if (!name) return false;
            const n = String(name).trim().toLowerCase();
            return (n.includes('amal') || n.startsWith('amal')) && (n.includes('arabe') || n.includes('arab') || n.includes('عرب'));
        };

        const isAmalSoleTeacher = (name) => {
            if (!name) return false;
            const n = String(name).trim().toLowerCase();
            if (isAmalArabeTeacher(n)) return false;
            return n === 'amal' || n === 'amal sole' || n === 'amal (seul)' || n === 'amal seul';
        };

        const isDualSectionTeacher = (username) => {
            if (!username) return false;
            return isMusicTeacher(username) || isAmalSoleTeacher(username);
        };

        function isUserAdminOrSupervisor(user, role) {
            const u = String(user || (typeof loggedInUser !== 'undefined' ? loggedInUser : '')).trim().toLowerCase();
            const r = String(role || (typeof currentUserRole !== 'undefined' ? currentUserRole : '')).trim().toLowerCase();
            return u === 'med01' || u === 'racha' || r === 'admin' || r === 'supervisor';
        }

        function isRowForLoggedInTeacher(rowTeacher, user, tableTeacher) {
            if (!user || isUserAdminOrSupervisor(user)) return true;
            if (!rowTeacher) return false;
            const rT = String(rowTeacher).trim().toLowerCase();
            const u = String(user).trim().toLowerCase();
            const tT = tableTeacher ? String(tableTeacher).trim().toLowerCase() : '';
            
            // 1. Enseignante Musique (Farah)
            if (isMusicTeacher(u) || (tT && isMusicTeacher(tT))) {
                return isMusicTeacher(rT) || rT === u || (tT && rT === tT);
            }

            // 2. Amal (Seule / non arabe)
            if (isAmalSoleTeacher(u) || (tT && isAmalSoleTeacher(tT))) {
                return isAmalSoleTeacher(rT) || (tT && isAmalSoleTeacher(tT) && isAmalSoleTeacher(rT));
            }

            // 3. Amal Arabe
            if (isAmalArabeTeacher(u) || (tT && isAmalArabeTeacher(tT))) {
                return isAmalArabeTeacher(rT) || (tT && isAmalArabeTeacher(tT) && isAmalArabeTeacher(rT));
            }
            
            return rT === u || (tT && rT === tT);
        }

        const teachersSectionMap = {
            garcons: maleTeachersList,
            filles: femaleTeachersList,
            primaire: primaireTeachersList
        };

        const sectionClassesMap = {
            garcons: ["PEI1", "PEI2", "PEI3", "PEI4", "PEI5", "DP1", "DP2"],
            filles: ["PEI1", "PEI2", "PEI3", "PEI4", "PEI5", "DP1", "DP2"],
            primaire: ["PS", "MS", "GS", "PP1", "PP2", "PP3", "PP4", "PP5"]
        };

        function getSectionClasses(sec) {
            return sectionClassesMap[sec || currentSection] || sectionClassesMap.garcons;
        }

        // --- Fonctions de Gestion de Section et Accueil ---
        function showHomeStep(step) {
            const mainStep = document.getElementById('home-step-main');
            const parentStep = document.getElementById('home-step-parent');
            const teacherStep = document.getElementById('home-step-teacher');
            
            if (mainStep) mainStep.style.display = (step === 'main' || !step) ? 'block' : 'none';
            if (parentStep) parentStep.style.display = (step === 'parent') ? 'block' : 'none';
            if (teacherStep) teacherStep.style.display = (step === 'teacher') ? 'block' : 'none';
        }

        function chooseSection(section) {
            currentSection = section;
            localStorage.setItem('selectedSection', section);
            localStorage.setItem('currentSection', section);
            applyParentUIMode(false);
            updateSectionBadges();
            
            const sectionSelectionEl = document.getElementById('section-selection');
            if (sectionSelectionEl) sectionSelectionEl.style.display = 'none';
            
            if (loggedInUser) {
                document.getElementById('main-content').style.display = 'block';
                document.getElementById('login-form').style.display = 'none';
                if (currentWeek) {
                    fetchPlanData(currentWeek);
                }
            } else {
                document.getElementById('login-form').style.display = 'block';
                document.getElementById('main-content').style.display = 'none';
            }
        }

        function resetSectionChoice() {
            const sectionSelectionEl = document.getElementById('section-selection');
            if (sectionSelectionEl) sectionSelectionEl.style.display = 'flex';
            document.getElementById('login-form').style.display = 'none';
            document.getElementById('main-content').style.display = 'none';
            showHomeStep('main');
        }

        function updateSectionBadges() {
            const isBoys = currentSection === 'garcons';
            const isGirls = currentSection === 'filles';
            const isPrimaire = currentSection === 'primaire';
            
            let badgeText = 'Section Garçons 👦';
            let badgeClass = 'section-badge badge-garcons';
            let toggleText = 'Section Garçons 👦';
            
            if (isGirls) {
                badgeText = 'Section Filles 👧';
                badgeClass = 'section-badge badge-filles';
                toggleText = currentUserLanguage === 'ar' ? 'قسم البنات 👧' : 'Section Filles 👧';
            } else if (isPrimaire) {
                badgeText = 'Section Primaire & Maternelle 👶🎒';
                badgeClass = 'section-badge badge-primaire';
                toggleText = currentUserLanguage === 'ar' ? 'الابتدائي والروضة 👶🎒' : 'Primaire & Maternelle 👶🎒';
            } else {
                toggleText = currentUserLanguage === 'ar' ? 'قسم البنين 👦' : 'Section Garçons 👦';
            }
            
            const loginBadge = document.getElementById('loginSectionBadge');
            if (loginBadge) {
                loginBadge.textContent = badgeText;
                loginBadge.className = badgeClass;
            }
            
            const mainBadge = document.getElementById('mainSectionBadge');
            if (mainBadge) {
                mainBadge.textContent = badgeText;
                mainBadge.className = badgeClass;
            }

            document.querySelectorAll('.parentSectionBadgeDisplay').forEach(el => {
                el.className = `parentSectionBadgeDisplay ${badgeClass}`;
            });

            document.querySelectorAll('.parentSectionToggleText').forEach(el => {
                el.textContent = toggleText;
            });

            const adminFilter = document.getElementById('adminSectionFilter');
            if (adminFilter) {
                adminFilter.value = currentSection;
            }

            const adminStudFilter = document.getElementById('adminStudentSectionFilter');
            if (adminStudFilter) {
                adminStudFilter.value = currentSection;
            }

            // Mettre à jour l'état visuel des boutons commutateurs de section admin
            document.querySelectorAll('.admin-sec-toggle-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            const activeAdminBtn = document.getElementById(`adminSecBtn_${currentSection}`);
            if (activeAdminBtn) activeAdminBtn.classList.add('active');

            // Mettre à jour les sélecteurs de classe pour la section active
            if (typeof renderParentClassButtons === 'function') renderParentClassButtons();
            if (typeof updateClassDropdowns === 'function') updateClassDropdowns();
            updateDualTeacherSectionButtons();
        }

        // Mettre à jour l'affichage du commutateur de section pour les enseignantes multi-sections (Farah, Amal)
        function updateDualTeacherSectionButtons() {
            const isDual = (typeof isDualSectionTeacher === 'function') && isDualSectionTeacher(loggedInUser);
            const dualSecSwitch = document.getElementById('dualTeacherSectionSwitch');
            const dualBanner = document.getElementById('dualTeacherNoticeBanner');
            
            if (dualSecSwitch) {
                dualSecSwitch.style.display = isDual ? 'inline-flex' : 'none';
            }
            if (dualBanner) {
                dualBanner.style.display = isDual ? 'flex' : 'none';
            }

            if (isDual) {
                const teacherDisplayName = (typeof loggedInTeacherTable !== 'undefined' && loggedInTeacherTable) ? loggedInTeacherTable : loggedInUser;
                const isMusic = (typeof isMusicTeacher === 'function') && isMusicTeacher(loggedInUser);
                const teacherIcon = isMusic ? 'fas fa-music' : 'fas fa-chalkboard-teacher';
                
                const secLabel = document.getElementById('dualSecTeacherLabel');
                if (secLabel) {
                    secLabel.innerHTML = `<i class="${teacherIcon}"></i> <span>${teacherDisplayName}</span> :`;
                }

                const bannerTeacherName = document.getElementById('dualBannerTeacherName');
                if (bannerTeacherName) {
                    bannerTeacherName.textContent = teacherDisplayName;
                }

                const bannerIcon = document.getElementById('dualBannerIcon');
                if (bannerIcon) {
                    bannerIcon.innerHTML = `<i class="${teacherIcon}"></i>`;
                }
            }

            // Mise à jour des boutons dans l'en-tête
            const btnFilles = document.getElementById('teacherSecBtn_filles');
            const btnPrimaire = document.getElementById('teacherSecBtn_primaire');
            if (btnFilles) btnFilles.classList.toggle('active', currentSection === 'filles');
            if (btnPrimaire) btnPrimaire.classList.toggle('active', currentSection === 'primaire');

            // Mise à jour des boutons dans la bannière
            const bannerBtnFilles = document.getElementById('dualBannerBtn_filles');
            const bannerBtnPrimaire = document.getElementById('dualBannerBtn_primaire');
            if (bannerBtnFilles) bannerBtnFilles.classList.toggle('active', currentSection === 'filles');
            if (bannerBtnPrimaire) bannerBtnPrimaire.classList.toggle('active', currentSection === 'primaire');

            // Mise à jour du texte de statut dans la bannière
            const statusText = document.getElementById('dualCurrentSectionText');
            if (statusText) {
                if (currentSection === 'primaire') {
                    statusText.innerHTML = `Section active : <span class="active-sec-pill pill-primaire">Section Primaire & Maternelle 👶🎒</span>`;
                } else {
                    statusText.innerHTML = `Section active : <span class="active-sec-pill pill-filles">Section Filles 👧</span>`;
                }
            }
        }

        // Permet aux enseignantes multi-sections (Farah, Amal) de basculer instantanément entre Section Filles et Section Primaire & Maternelle
        async function switchDualTeacherSection(newSection) {
            if (!newSection) return;
            if (newSection !== 'filles' && newSection !== 'primaire') {
                newSection = 'filles';
            }
            if (newSection === currentSection) return;
            
            console.log(`🔄 Enseignante Multi-sections (${loggedInUser}) - Basculement de section: ${currentSection} ➔ ${newSection}`);
            currentSection = newSection;
            localStorage.setItem('selectedSection', newSection);
            localStorage.setItem('currentSection', newSection);
            
            updateSectionBadges();
            updateDualTeacherSectionButtons();
            
            if (typeof updateClassDropdowns === 'function') updateClassDropdowns();
            if (typeof populateNotesClassSelector === 'function') populateNotesClassSelector();
            
            // Recharger le plan de travail de la nouvelle section sélectionnée
            if (currentWeek) {
                await fetchPlanData(currentWeek);
            }
            
            const secLabel = newSection === 'primaire' ? 'Section Primaire & Maternelle 👶🎒' : 'Section Filles 👧';
            displayAlert(`Section active : <strong>${secLabel}</strong>. Vous pouvez maintenant remplir et modifier le plan de cette section.`, false);
        }

        // Basculer la section de travail de l'administrateur sans déconnexion
        function switchAdminActiveSection(newSection) {
            if (!newSection) return;
            
            currentSection = newSection;
            localStorage.setItem('selectedSection', newSection);
            localStorage.setItem('currentSection', newSection);
            
            updateSectionBadges();
            
            // Mettre à jour les filtres d'onglets de gestion admin
            const adminFilter = document.getElementById('adminSectionFilter');
            if (adminFilter) adminFilter.value = newSection;
            
            const adminStudFilter = document.getElementById('adminStudentSectionFilter');
            if (adminStudFilter) adminStudFilter.value = newSection;
            
            // Recharger l'onglet admin actuellement actif
            const activeTabBtn = document.querySelector('.admin-tab-btn.active');
            const activeTab = activeTabBtn ? activeTabBtn.id.replace('tabBtn_', '') : 'upload';
            if (activeTab === 'teachers') {
                loadAdminUsersList();
            } else if (activeTab === 'students') {
                if (typeof loadAdminStudentsList === 'function') loadAdminStudentsList();
            } else if (activeTab === 'reports') {
                if (typeof populateAdminReportClassSelector === 'function') populateAdminReportClassSelector();
            }
            
            // Recharger le tableau du plan hebdomadaire de la semaine en cours si ouvert
            if (typeof currentWeek !== 'undefined' && currentWeek) {
                if (typeof fetchPlanData === 'function') fetchPlanData(currentWeek);
            }
            
            const secLabel = newSection === 'garcons' ? 'Section Garçons 👦' : (newSection === 'primaire' ? 'Section Primaire & Maternelle 👶🎒' : 'Section Filles 👧');
            displayAlert(`Section active de travail : <strong>${secLabel}</strong> (basculement immédiat)`, false);
        }

        function cycleAdminSection() {
            let nextSec = 'garcons';
            if (currentSection === 'garcons') nextSec = 'filles';
            else if (currentSection === 'filles') nextSec = 'primaire';
            else nextSec = 'garcons';
            switchAdminActiveSection(nextSec);
        }
        
        // Version d'authentification pour forcer la déconnexion
        const AUTH_VERSION = 2; // Incrémenter pour forcer tous les utilisateurs à se reconnecter

        const arabicTeachers = ['Majed', 'Jaber', 'Imad'];
        const englishTeachers = ['Kamel'];
        const isArabicUser = () => currentUserLanguage === 'ar';
        
        // Version du code pour vérifier le déploiement
        console.log('%c🚀 VERSION DÉPLOYÉE: 2026-01-23 15:30 - Garçons', 'background: #0066CC; color: white; padding: 5px 10px; border-radius: 5px; font-weight: bold;');
        console.log('📋 Enseignants Arabes:', arabicTeachers);
        console.log('📋 Enseignants Anglais:', englishTeachers);

        // Traductions
        const translations = {
            fr: { 
                login_title: "Connexion", login_username_label: "Nom d'utilisateur (Enseignant) :", login_password_label: "Mot de passe (idem Nom) :", login_button_text: "Se connecter", remember_me: "Rester connecté", logout_button: "Déconnecter", main_page_title: "Plans Hebdomadaires", week_label: "Semaine:", select_week: "-- Sélectionnez une semaine --", please_select_week: "Veuillez sélectionner une semaine.", admin_actions_title: "Actions Administrateur", admin_excel_label: "Fichier Excel :", admin_save_button: "Charger et Enregistrer dans la DB", generate_word_button: "Générer Word par Classe", generate_excel_button: "Générer Excel (1 Fichier)", save_all_button: "Enregistrer Lignes Affichées", filter_teacher_label: "Enseignant:", filter_class_label: "Classe:", filter_material_label: "Matière:", filter_period_label: "Période:", filter_day_label: "Jour:", all: "Tous", all_f: "Toutes", day_sun: "Dimanche", day_mon: "Lundi", day_tue: "Mardi", day_wed: "Mercredi", day_thu: "Jeudi", days: ["Dim", "Lun", "Mar", "Mer", "Jeu"], fullDays: ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi"], months: ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"], headers: { 'Leçon': 'Leçon', 'Travaux de classe': 'Travaux de classe', 'Support': 'Support', 'Devoirs': 'Devoirs', 'Enseignant': 'Enseignant', 'Classe': 'Classe', 'Matière': 'Matière', 'Période': 'Période', 'Jour': 'Jour' }, actions: "Actions", updated_at: "Mis à jour", notes_for_class: "Notes pour la classe :", select_class: "-- Sélectionnez une classe --", select_class_placeholder: "Sélectionnez une classe pour voir ou ajouter des notes...", notes_placeholder: "Notes pour {classText}...", save_notes_button: "Enregistrer Notes", saving: "Enregistrement...", saved: "Enregistré", saving_notes_for: "Enregistrement notes pour {class} S{week}", notes_saved_success: "Notes enregistrées pour {class}, S{week}.", error_saving_notes: "Erreur d'enregistrement des notes: {error}", display_incomplete: "Afficher Incomplets", hide_incomplete: "Masquer Incomplets", incomplete_teachers_title: "Enseignants Incomplets", loading: "Chargement...", no_data: "Aucune donnée.", all_complete: "Tout complet!", error_config_columns: "Erreur config colonnes.", welcome_user: "Bienvenue {user} ! Veuillez sélectionner une semaine.", connected_as: "Connecté: {user}", loading_data_week: "Chargement données S{week}...", data_loaded_week: "Données S{week} chargées.", no_data_found_week: "Aucune donnée trouvée pour S{week}.", error_loading_week: "Erreur chargement S{week}: {error}", select_week_to_display: "Veuillez sélectionner une semaine pour afficher les données.", error_structure: "Erreur: Structure de données non définie.", no_data_to_display_filters: "Aucune donnée à afficher avec les filtres actuels.", save_row_title: "Enregistrer cette ligne", invalid_row: "Ligne invalide.", error_saving_row: "Erreur enregistrement ligne: {error}", no_rows_to_save: "Aucune ligne affichée à enregistrer.", confirm_save_all: "Confirmer l'enregistrement des {count} lignes affichées pour la S{week}?", save_all_cancelled: "Enregistrement annulé.", saving_all_displayed: "Enregistrement des {count} lignes en cours...", save_all_success: "{count} lignes enregistrées avec succès.", save_all_partial: "Enregistrement terminé: {success} succès, {error} erreurs.", generating_word: "Génération de {count} document(s) Word...", generating_word_success: "{count} document(s) Word généré(s).", generating_word_partial: "Génération Word terminée: {ok} succès, {err} erreurs.", generating_word_failed: "Échec de la génération Word ({err} erreurs).", generating_excel: "Génération du fichier Excel S{week}...", generating_excel_success: "Fichier Excel '{filename}' généré.", error_generating_excel: "Erreur génération Excel: {error}", no_file_selected: "Aucun fichier sélectionné.", reading_file: "Lecture du fichier {fileName}...", file_read_success: "Fichier {fileName} lu ({count} lignes).", file_error: "Erreur lecture fichier: {error}", invalid_file_type: "Type de fichier invalide (.xlsx ou .xls requis).", saving_uploaded_data: "Enregistrement des données chargées pour S{week}...", uploaded_data_saved: "Données chargées enregistrées pour S{week}.", uploaded_data_error: "Erreur enregistrement données chargées: {error}", no_word_dates: "Génération Word: Dates manquantes côté serveur pour la semaine S{week}.",
                generate_ai_lesson_plan_button: "Plan de Leçon (IA)", generating_ai_lesson_plan: "Génération du plan de leçon IA...", error_generating_ai_lesson_plan: "Erreur génération plan IA: {error}", ai_lesson_plan_generated: "Plan de leçon IA généré.", quota_exceeded: "⚠️ Quota API épuisé ! La limite d'utilisation gratuite de l'IA a été atteinte aujourd'hui. Veuillez réessayer demain ou contacter l'administrateur.",
                generate_weekly_lessons_button: "Générer Plans de Leçons (Semaine)", generating_weekly_lessons: "Génération des plans de leçons pour la semaine...", weekly_lessons_generated: "Plans de leçons hebdomadaires générés.",
                admin_report_class_label: "Choisir une Classe :", generate_full_report_button: "Générer Rapport Complet par Classe", loading_classes: "-- Chargement des classes --", select_report_class: "-- Sélectionnez une classe pour le rapport --", no_classes_found: "-- Aucune classe trouvée --", generating_full_report: "Génération du rapport complet pour la classe {classe}...", generating_full_report_success: "Rapport complet pour {classe} généré.", generating_full_report_error: "Erreur génération du rapport pour {classe}: {error}", please_select_class_for_report: "Veuillez sélectionner une classe pour générer le rapport."
            },
            ar: { 
                login_title: "تسجيل الدخول", login_username_label: "اسم المستخدم (المعلم):", login_password_label: "كلمة المرور (نفس الاسم):", login_button_text: "تسجيل الدخول", remember_me: "تذكرني", logout_button: "تسجيل الخروج", main_page_title: "الخطط الأسبوعية", week_label: "الأسبوع:", select_week: "-- اختر أسبوع --", please_select_week: "يرجى اختيار أسبوع.", admin_actions_title: "إجراءات المسؤول", admin_excel_label: "ملف اكسل:", admin_save_button: "تحميل وحفظ في قاعدة البيانات", generate_word_button: "إنشاء ملف وورد حسب الفصل", generate_excel_button: "إنشاء ملف اكسل (ملف واحد)", save_all_button: "حفظ الصفوف المعروضة", filter_teacher_label: "المعلم:", filter_class_label: "الفصل:", filter_material_label: "المادة:", filter_period_label: "الحصة:", filter_day_label: "اليوم:", all: "الكل", all_f: "الكل", day_sun: "الأحد", day_mon: "الاثنين", day_tue: "الثلاثاء", day_wed: "الأربعاء", day_thu: "الخميس", days: ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"], fullDays: ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"], months: ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"], headers: { 'Leçon': 'الدرس', 'Travaux de classe': 'أعمال الفصل', 'Support': 'الدعم', 'Devoirs': 'الواجبات', 'Enseignant': 'المعلم', 'Classe': 'الفصل', 'Matière': 'المادة', 'Période': 'الحصة', 'Jour': 'اليوم' }, actions: "إجراءات", updated_at: "آخر تحديث", notes_for_class: "ملاحظات للفصل:", select_class: "-- اختر فصل --", select_class_placeholder: "اختر فصلًا لعرض أو إضافة ملاحظات...", notes_placeholder: "ملاحظات ل {classText}...", save_notes_button: "حفظ الملاحظات", saving: "جاري الحفظ...", saved: "تم الحفظ", saving_notes_for: "جاري حفظ الملاحظات ل {class} أسبوع {week}", notes_saved_success: "تم حفظ الملاحظات ل {class}، أسبوع {week}.", error_saving_notes: "خطأ في حفظ الملاحظات: {error}", display_incomplete: "إظهار غير المكتمل", hide_incomplete: "إخفاء غير المكتمل", incomplete_teachers_title: "المعلمون غير المكتملين", loading: "جاري التحميل...", no_data: "لا توجد بيانات.", all_complete: "الكل مكتمل!", error_config_columns: "خطأ في إعداد الأعمدة.", welcome_user: "مرحباً {user}! يرجى اختيار أسبوع.", connected_as: "متصل: {user}", loading_data_week: "جاري تحميل بيانات الأسبوع {week}...", data_loaded_week: "تم تحميل بيانات الأسبوع {week}.", no_data_found_week: "لم يتم العثور على بيانات للأسبوع {week}.", error_loading_week: "خطأ في تحميل الأسبوع {week}: {error}", select_week_to_display: "يرجى اختيار أسبوع لعرض البيانات.", error_structure: "خطأ: هيكل البيانات غير محدد.", no_data_to_display_filters: "لا توجد بيانات لعرضها مع الفلاتر الحالية.", save_row_title: "حفظ هذا السطر", invalid_row: "سطر غير صالح.", error_saving_row: "خطأ في حفظ السطر: {error}", no_rows_to_save: "لا توجد أسطر معروضة للحفظ.", confirm_save_all: "تأكيد حفظ {count} أسطر معروضة للأسبوع {week}؟", save_all_cancelled: "تم إلغاء الحفظ.", saving_all_displayed: "جاري حفظ {count} أسطر...", save_all_success: "تم حفظ {count} أسطر بنجاح.", save_all_partial: "اكتمل الحفظ: {success} نجاح، {error} أخطاء.", generating_word: "جاري إنشاء {count} مستند (مستندات) وورد...", generating_word_success: "تم إنشاء {count} مستند (مستندات) وورد.", generating_word_partial: "اكتمل إنشاء الوورد: {ok} نجاح، {err} أخطاء.", generating_word_failed: "فشل إنشاء الوورد ({err} أخطاء).", generating_excel: "جاري إنشاء ملف اكسل للأسبوع {week}...", generating_excel_success: "تم إنشاء ملف اكسل '{filename}'.", error_generating_excel: "خطأ في إنشاء اكسل: {error}", no_file_selected: "لم يتم اختيار ملف.", reading_file: "قراءة الملف {fileName}...", file_read_success: "تمت قراءة الملف {fileName} ({count} أسطر).", file_error: "خطأ في قراءة الملف: {error}", invalid_file_type: "نوع الملف غير صالح (مطلوب .xlsx أو .xls).", saving_uploaded_data: "جاري حفظ البيانات المحملة للأسبوع {week}...", uploaded_data_saved: "تم حفظ البيانات المحملة للأسبوع {week}.", uploaded_data_error: "خطأ في حفظ البيانات المحملة: {error}", no_word_dates: "توليد وورد: التواريخ مفقودة على الخادم للأسبوع {week}.",
                generate_ai_lesson_plan_button: "خطة الدرس (AI)", generating_ai_lesson_plan: "جاري إنشاء خطة الدرس بالذكاء الاصطناعي...", error_generating_ai_lesson_plan: "خطأ في إنشاء خطة الدرس بالذكاء الاصطناعي: {error}", ai_lesson_plan_generated: "تم إنشاء خطة الدرس بالذكاء الاصطناعي.", quota_exceeded: "⚠️ تم استنفاد حصة API! تم الوصول إلى حد الاستخدام المجاني للذكاء الاصطناعي اليوم. يرجى المحاولة غدًا أو الاتصال بالمسؤول.",
                generate_weekly_lessons_button: "إنشاء خطط دروس الأسبوع", generating_weekly_lessons: "جاري إنشاء خطط دروس الأسبوع...", weekly_lessons_generated: "تم إنشاء خطط دروس الأسبوع.",
                admin_report_class_label: "اختر فصل:", generate_full_report_button: "إنشاء تقرير كامل حسب الفصل", loading_classes: "-- جاري تحميل الفصول --", select_report_class: "-- اختر فصل للتقرير --", no_classes_found: "-- لم يتم العثور على فصول --", generating_full_report: "جاري إنشاء التقرير الكامل للفصل {classe}...", generating_full_report_success: "تم إنشاء التقرير الكامل للفصل {classe}.", generating_full_report_error: "خطأ في إنشاء التقرير للفصل {classe}: {error}", please_select_class_for_report: "يرجى اختيار فصل لإنشاء التقرير."
            },
            en: { 
                login_title: "Login", login_username_label: "Username (Teacher):", login_password_label: "Password (same as Name):", login_button_text: "Login", remember_me: "Remember me", logout_button: "Logout", main_page_title: "Weekly Plans", week_label: "Week:", select_week: "-- Select a week --", please_select_week: "Please select a week.", admin_actions_title: "Administrator Actions", admin_excel_label: "Excel File:", admin_save_button: "Load and Save to DB", generate_word_button: "Generate Word by Class", generate_excel_button: "Generate Excel (1 File)", save_all_button: "Save Displayed Rows", filter_teacher_label: "Teacher:", filter_class_label: "Class:", filter_material_label: "Subject:", filter_period_label: "Period:", filter_day_label: "Day:", all: "All", all_f: "All", day_sun: "Sunday", day_mon: "Monday", day_tue: "Tuesday", day_wed: "Wednesday", day_thu: "Thursday", days: ["Sun", "Mon", "Tue", "Wed", "Thu"], fullDays: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"], months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], headers: { 'Leçon': 'Lesson', 'Travaux de classe': 'Classwork', 'Support': 'Support', 'Devoirs': 'Homework', 'Enseignant': 'Teacher', 'Classe': 'Class', 'Matière': 'Subject', 'Période': 'Period', 'Jour': 'Day' }, actions: "Actions", updated_at: "Updated At", notes_for_class: "Notes for class:", select_class: "-- Select a class --", select_class_placeholder: "Select a class to view or add notes...", notes_placeholder: "Notes for {classText}...", save_notes_button: "Save Notes", saving: "Saving...", saved: "Saved", saving_notes_for: "Saving notes for {class} W{week}", notes_saved_success: "Notes saved for {class}, W{week}.", error_saving_notes: "Error saving notes: {error}", display_incomplete: "Show Incomplete", hide_incomplete: "Hide Incomplete", incomplete_teachers_title: "Incomplete Teachers", loading: "Loading...", no_data: "No data.", all_complete: "All complete!", error_config_columns: "Column config error.", welcome_user: "Welcome {user}! Please select a week.", connected_as: "Connected: {user}", loading_data_week: "Loading data W{week}...", data_loaded_week: "Data W{week} loaded.", no_data_found_week: "No data found for W{week}.", error_loading_week: "Error loading W{week}: {error}", select_week_to_display: "Please select a week to display data.", error_structure: "Error: Data structure undefined.", no_data_to_display_filters: "No data to display with current filters.", save_row_title: "Save this row", invalid_row: "Invalid row.", error_saving_row: "Error saving row: {error}", no_rows_to_save: "No displayed rows to save.", confirm_save_all: "Confirm saving the {count} displayed rows for W{week}?", save_all_cancelled: "Save cancelled.", saving_all_displayed: "Saving {count} rows...", save_all_success: "{count} rows saved successfully.", save_all_partial: "Save complete: {success} success, {error} errors.", generating_word: "Generating {count} Word document(s)...", generating_word_success: "{count} Word document(s) generated.", generating_word_partial: "Word generation complete: {ok} success, {err} errors.", generating_word_failed: "Word generation failed ({err} errors).", generating_excel: "Generating Excel file W{week}...", generating_excel_success: "Excel file '{filename}' generated.", error_generating_excel: "Error generating Excel: {error}", no_file_selected: "No file selected.", reading_file: "Reading file {fileName}...", file_read_success: "File {fileName} read ({count} rows).", file_error: "Error reading file: {error}", invalid_file_type: "Invalid file type (requires .xlsx or .xls).", saving_uploaded_data: "Saving uploaded data for W{week}...", uploaded_data_saved: "Uploaded data saved for W{week}.", uploaded_data_error: "Error saving uploaded data: {error}", no_word_dates: "Word generation: Server-side dates missing for week W{week}.",
                generate_ai_lesson_plan_button: "Lesson Plan (AI)", generating_ai_lesson_plan: "Generating AI lesson plan...", error_generating_ai_lesson_plan: "Error generating AI lesson plan: {error}", ai_lesson_plan_generated: "AI lesson plan generated.", quota_exceeded: "⚠️ API Quota Exceeded! The free AI usage limit has been reached today. Please try again tomorrow or contact the administrator.",
                generate_weekly_lessons_button: "Generate Weekly Lesson Plans", generating_weekly_lessons: "Generating weekly lesson plans...", weekly_lessons_generated: "Weekly lesson plans generated.",
                admin_report_class_label: "Choose a Class:", generate_full_report_button: "Generate Full Report by Class", loading_classes: "-- Loading classes --", select_report_class: "-- Select a class for the report --", no_classes_found: "-- No classes found --", generating_full_report: "Generating full report for class {classe}...", generating_full_report_success: "Full report for {classe} generated.", generating_full_report_error: "Error generating report for {classe}: {error}", please_select_class_for_report: "Please select a class to generate the report."
            }
        };
        const t = (key, params = {}) => { let text = translations[currentUserLanguage]?.[key] || translations.fr[key] || key; for (const p in params) { text = text.replace(`{${p}}`, params[p]); } return text; };

        // Ordre/Traductions Classes (Maternelle, Primaire, Collège, Lycée)
        const classOrder = ["PS", "MS", "GS", "PP1", "PP2", "PP3", "PP4", "PP5", "PEI1", "PEI2", "PEI3", "PEI4", "PEI5", "DP1", "DP2"];
        const classTranslations = { 
            'PS': 'الروضة الصغرى',
            'MS': 'الروضة المتوسطة',
            'GS': 'الروضة الكبرى',
            'PP1': 'الابتدائي الأول',
            'PP2': 'الابتدائي الثاني',
            'PP3': 'الابتدائي الثالث',
            'PP4': 'الابتدائي الرابع',
            'PP5': 'الابتدائي الخامس',
            'PEI1': 'السادس', 
            'PEI2': 'الاول متوسط', 
            'PEI3': 'الثاني متوسط', 
            'PEI4': 'الثالث متوسط', 
            'PEI5': 'الأول ثانوي', 
            'DP1': 'الثاني ثانوي', 
            'DP2': 'الثالث ثانوي' 
        };
        function getClassLabel(cls) {
            const ar = classTranslations[cls];
            return ar ? `${ar} (${cls})` : cls;
        }
        function compareClasses(a, b) { const indexA = classOrder.indexOf(a); const indexB = classOrder.indexOf(b); if (indexA !== -1 && indexB !== -1) return indexA - indexB; if (indexA !== -1) return -1; if (indexB !== -1) return 1; return String(a).localeCompare(String(b)); }

        function renderParentClassButtons() {
            const container = document.getElementById('parent-class-buttons');
            if (!container) return;
            const classes = getSectionClasses(currentSection);
            if (!classes.includes(currentActiveClassName)) {
                currentActiveClassName = classes[0];
            }
            container.innerHTML = classes.map(cls => {
                const isActive = (cls === currentActiveClassName);
                const label = getClassLabel(cls);
                return `<button class="pro-button ${isActive ? 'primary-button active' : ''}" onclick="loadClassStudents('${cls}')">${label}</button>`;
            }).join(' ');
        }

        function updateClassDropdowns() {
            const classes = getSectionClasses(currentSection);
            
            // Parent Class Selector
            const parentClassSel = document.getElementById('parentClassSelector');
            if (parentClassSel) {
                const prevVal = parentClassSel.value;
                parentClassSel.innerHTML = classes.map(cls => `<option value="${cls}">${getClassLabel(cls)}</option>`).join('');
                if (classes.includes(prevVal)) {
                    parentClassSel.value = prevVal;
                } else {
                    parentClassSel.value = classes[0];
                }
            }
            
            // Teacher Filter Class
            const teacherFilter = document.getElementById('teacherFilterClass');
            if (teacherFilter) {
                const prevVal = teacherFilter.value;
                let html = '<option value="all">Toutes les classes</option>';
                html += classes.map(cls => `<option value="${cls}">${getClassLabel(cls)}</option>`).join('');
                teacherFilter.innerHTML = html;
                if (prevVal === 'all' || classes.includes(prevVal)) {
                    teacherFilter.value = prevVal;
                }
            }
            
            // Admin Student Class Filter
            const adminStudClassFilter = document.getElementById('adminStudentClassFilter');
            const adminSelectedSection = document.getElementById('adminStudentSectionFilter')?.value || currentSection;
            const adminClasses = getSectionClasses(adminSelectedSection);
            if (adminStudClassFilter) {
                const prevVal = adminStudClassFilter.value;
                let html = '<option value="all">-- Toutes les classes --</option>';
                html += adminClasses.map(cls => `<option value="${cls}">${getClassLabel(cls)}</option>`).join('');
                adminStudClassFilter.innerHTML = html;
                if (prevVal === 'all' || adminClasses.includes(prevVal)) {
                    adminStudClassFilter.value = prevVal;
                }
            }
        }

        // Dates et Configuration des 38 semaines de l'année scolaire 2026/2027
        let weeksConfig = {
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

        const specificWeekDateRanges = {};
        for (const [wNum, wData] of Object.entries(weeksConfig)) {
          specificWeekDateRanges[wNum] = { start: wData.start, end: wData.end };
        }

        function formatWeekDateRangeText(weekNum) {
          const w = weeksConfig[weekNum] || { title: `Semaine ${weekNum}`, titleAr: `الأسبوع ${weekNum}`, start: '', end: '' };
          const title = (isArabicUser() ? (w.titleAr || `الأسبوع ${weekNum}`) : (w.title || `Semaine ${weekNum}`));
          if (!w.start || !w.end) return title;
          try {
            const s = new Date(w.start + 'T00:00:00Z');
            const e = new Date(w.end + 'T00:00:00Z');
            const monthsFr = ["Janv.", "Févr.", "Mars", "Avr.", "Mai", "Juin", "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc."];
            const monthsAr = ["جانفي", "فيفري", "مارس", "أفريل", "ماي", "جوان", "جويلية", "أوت", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
            if (isArabicUser()) {
              return `${title} (${s.getUTCDate()} ${monthsAr[s.getUTCMonth()]} - ${e.getUTCDate()} ${monthsAr[e.getUTCMonth()]})`;
            }
            return `${title} (${s.getUTCDate()} ${monthsFr[s.getUTCMonth()]} - ${e.getUTCDate()} ${monthsFr[e.getUTCMonth()]})`;
          } catch(err) {
            return `${title} (${w.start} - ${w.end})`;
          }
        }

        async function fetchWeeksConfiguration() {
          try {
            const res = await fetch('/api/weeks-config');
            if (res.ok) {
              const data = await res.json();
              if (data && data.weeks) {
                weeksConfig = { ...weeksConfig, ...data.weeks };
                for (const [wNum, wData] of Object.entries(weeksConfig)) {
                  specificWeekDateRanges[wNum] = { start: wData.start, end: wData.end };
                }
              }
            }
          } catch (e) {
            console.warn('Erreur chargement weeks-config depuis le serveur, utilisation de la config locale:', e);
          }
          populateMainWeekSelector();
          populateParentWeekSelector();
          populateAdminUploadWeekSelector();
          populateAdminWeekSelectToEdit();
          renderAdminWeeksTable();
        }

        function populateAdminUploadWeekSelector() {
          const sel = document.getElementById('adminUploadWeekSelect');
          const rangeFrom = document.getElementById('uploadRangeFromWeek');
          const rangeTo = document.getElementById('uploadRangeToWeek');
          const grid = document.getElementById('uploadWeeksCheckboxesGrid');
          const specialWeekSel = document.getElementById('specialDayWeek');
          
          const sortedWeekNums = Object.keys(weeksConfig).map(n => parseInt(n, 10)).sort((a, b) => a - b);
          let optionsHtml = '';
          sortedWeekNums.forEach(wNum => {
            const label = formatWeekDateRangeText(wNum);
            optionsHtml += `<option value="${wNum}">${label}</option>`;
          });

          if (sel) {
            const currentVal = sel.value;
            sel.innerHTML = optionsHtml;
            if (currentVal && weeksConfig[currentVal]) {
              sel.value = currentVal;
            } else if (currentWeek && weeksConfig[currentWeek]) {
              sel.value = currentWeek;
            }
          }

          if (rangeFrom) {
            const curFrom = rangeFrom.value || "1";
            rangeFrom.innerHTML = optionsHtml;
            rangeFrom.value = curFrom;
          }
          if (rangeTo) {
            const curTo = rangeTo.value || "38";
            rangeTo.innerHTML = optionsHtml;
            rangeTo.value = curTo;
          }

          if (specialWeekSel) {
            const curSpec = specialWeekSel.value || (currentWeek || "1");
            specialWeekSel.innerHTML = optionsHtml;
            specialWeekSel.value = curSpec;
          }

          if (grid) {
            let gridHtml = '';
            for (let i = 1; i <= 38; i++) {
              gridHtml += `
                <label style="display:flex; align-items:center; gap:4px; font-size:0.8rem; font-weight:700; color:#334155; padding:4px 6px; border-radius:6px; background:#F8FAFC; border:1px solid #E2E8F0; cursor:pointer; user-select:none;">
                  <input type="checkbox" class="upload-week-checkbox" value="${i}" onchange="updateUploadTargetInfo()" style="cursor:pointer;">
                  <span>S${i}</span>
                </label>
              `;
            }
            grid.innerHTML = gridHtml;
          }

          updateUploadTargetInfo();
        }

        function toggleUploadWeekMode(mode) {
          const singleBox = document.getElementById('uploadModeSingleContainer');
          const multiBox = document.getElementById('uploadModeMultipleContainer');
          const rangeBox = document.getElementById('uploadModeRangeContainer');

          if (singleBox) singleBox.style.display = (mode === 'single') ? 'block' : 'none';
          if (multiBox) multiBox.style.display = (mode === 'multiple') ? 'block' : 'none';
          if (rangeBox) rangeBox.style.display = (mode === 'range') ? 'block' : 'none';

          updateUploadTargetInfo();
        }

        function selectUploadWeeksPreset(preset) {
          const checkboxes = document.querySelectorAll('.upload-week-checkbox');
          checkboxes.forEach(cb => {
            const wNum = parseInt(cb.value, 10);
            if (preset === 'all') {
              cb.checked = true;
            } else if (preset === 'p1') {
              cb.checked = (wNum >= 1 && wNum <= 12);
            } else if (preset === 'p2') {
              cb.checked = (wNum >= 13 && wNum <= 24);
            } else if (preset === 'p3') {
              cb.checked = (wNum >= 25 && wNum <= 38);
            } else if (preset === 'none') {
              cb.checked = false;
            }
          });
          updateUploadTargetInfo();
        }

        function getUploadTargetWeeks() {
          const modeRadio = document.querySelector('input[name="uploadWeekMode"]:checked');
          const mode = modeRadio ? modeRadio.value : 'single';

          if (mode === 'single') {
            const sel = document.getElementById('adminUploadWeekSelect');
            const mainSel = document.getElementById('weekSelector');
            const val = (sel && sel.value) ? parseInt(sel.value, 10) : (mainSel ? parseInt(mainSel.value, 10) : null);
            return val ? [val] : [];
          } else if (mode === 'multiple') {
            const checked = [];
            document.querySelectorAll('.upload-week-checkbox:checked').forEach(cb => {
              const num = parseInt(cb.value, 10);
              if (!isNaN(num)) checked.push(num);
            });
            checked.sort((a, b) => a - b);
            return checked;
          } else if (mode === 'range') {
            const fromSel = document.getElementById('uploadRangeFromWeek');
            const toSel = document.getElementById('uploadRangeToWeek');
            const fromW = fromSel ? parseInt(fromSel.value, 10) : 1;
            const toW = toSel ? parseInt(toSel.value, 10) : 38;
            const minW = Math.min(fromW, toW);
            const maxW = Math.max(fromW, toW);
            const range = [];
            for (let i = minW; i <= maxW; i++) {
              range.push(i);
            }
            return range;
          }
          return [];
        }

        function updateUploadTargetInfo() {
          const weeks = getUploadTargetWeeks();
          const countEl = document.getElementById('uploadMultiSelectedCount');
          const summaryEl = document.getElementById('uploadTargetSummaryText');
          const secSelect = document.getElementById('adminUploadSectionSelect');
          const sec = secSelect ? secSelect.value : (currentSection || 'garcons');
          const secLabel = (sec === 'garcons') ? 'Garçons 👦' : (sec === 'primaire' ? 'Primaire & Maternelle 👶🎒' : 'Filles 👧');

          if (countEl) {
            countEl.textContent = `${weeks.length} semaine(s) sélectionnée(s)`;
          }

          if (summaryEl) {
            if (weeks.length === 0) {
              summaryEl.innerHTML = `<span style="color:#EF4444;"><i class="fas fa-exclamation-triangle"></i> Aucune semaine sélectionnée</span> pour la Section <strong>${secLabel}</strong>.`;
            } else if (weeks.length === 1) {
              summaryEl.innerHTML = `L'import Excel s'appliquera uniquement à la <strong>Semaine ${weeks[0]}</strong> pour la Section <strong>${secLabel}</strong>.`;
            } else {
              const weeksList = weeks.length <= 8 ? weeks.map(w => `S${w}`).join(', ') : `S${weeks[0]}...S${weeks[weeks.length-1]} (${weeks.length} semaines)`;
              summaryEl.innerHTML = `L'import Excel sera <strong>propagé sur ${weeks.length} semaines</strong> (${weeksList}) pour la Section <strong>${secLabel}</strong>.`;
            }
          }
        }

        function populateMainWeekSelector() {
          const sel = document.getElementById('weekSelector');
          if (!sel) return;
          const currentVal = sel.value;
          const defaultText = t('select_week') || '-- Sélectionnez une semaine --';
          
          let html = `<option value="">${defaultText}</option>`;
          const sortedWeekNums = Object.keys(weeksConfig).map(n => parseInt(n, 10)).sort((a, b) => a - b);
          
          sortedWeekNums.forEach(wNum => {
            const label = formatWeekDateRangeText(wNum);
            html += `<option value="${wNum}">${label}</option>`;
          });
          
          sel.innerHTML = html;
          if (currentVal && weeksConfig[currentVal]) {
            sel.value = currentVal;
          }
        }

        function populateAdminWeekSelectToEdit() {
          const sel = document.getElementById('adminWeekSelectToEdit');
          if (!sel) return;
          const currentVal = sel.value || "1";
          let html = '';
          const sortedWeekNums = Object.keys(weeksConfig).map(n => parseInt(n, 10)).sort((a, b) => a - b);
          sortedWeekNums.forEach(wNum => {
            const w = weeksConfig[wNum];
            html += `<option value="${wNum}">Semaine ${wNum} : ${w?.title || ''} (${w?.start || ''} au ${w?.end || ''})</option>`;
          });
          sel.innerHTML = html;
          sel.value = weeksConfig[currentVal] ? currentVal : (sortedWeekNums[0] || "1");
          onAdminSelectWeekToEdit();
        }

        function onAdminSelectWeekToEdit() {
          const sel = document.getElementById('adminWeekSelectToEdit');
          if (!sel) return;
          const wNum = sel.value;
          const w = weeksConfig[wNum];
          if (w) {
            const titleInput = document.getElementById('adminWeekTitleInput');
            const titleArInput = document.getElementById('adminWeekTitleArInput');
            const startInput = document.getElementById('adminWeekStartDateInput');
            const endInput = document.getElementById('adminWeekEndDateInput');
            if (titleInput) titleInput.value = w.title || `Semaine ${wNum}`;
            if (titleArInput) titleArInput.value = w.titleAr || `الأسبوع ${wNum}`;
            if (startInput) startInput.value = w.start || '';
            if (endInput) endInput.value = w.end || '';
          }
        }

        async function adminSaveSingleWeekConfig() {
          const sel = document.getElementById('adminWeekSelectToEdit');
          const statusDiv = document.getElementById('adminWeekConfigStatus');
          const wNum = sel?.value;
          if (!wNum) return;

          const title = document.getElementById('adminWeekTitleInput')?.value?.trim();
          const titleAr = document.getElementById('adminWeekTitleArInput')?.value?.trim();
          const start = document.getElementById('adminWeekStartDateInput')?.value?.trim();
          const end = document.getElementById('adminWeekEndDateInput')?.value?.trim();

          if (!title || !start || !end) {
            if (statusDiv) statusDiv.innerHTML = '<span style="color:#EF4444;"><i class="fas fa-exclamation-circle"></i> Veuillez renseigner le titre et les deux dates (du ... au ...).</span>';
            return;
          }

          if (statusDiv) statusDiv.innerHTML = '<span style="color:#2563EB;"><i class="fas fa-spinner fa-spin"></i> Enregistrement en cours...</span>';

          try {
            const res = await fetch('/api/admin/weeks-config', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ week: wNum, title, titleAr, start, end })
            });
            const data = await res.json();
            if (res.ok && data.success) {
              weeksConfig[wNum] = {
                title: title,
                titleAr: titleAr || `الأسبوع ${wNum}`,
                start: start,
                end: end
              };
              specificWeekDateRanges[wNum] = { start, end };
              
              if (statusDiv) {
                statusDiv.innerHTML = `<span style="color:#10B981;"><i class="fas fa-check-circle"></i> Semaine ${wNum} mise à jour avec succès ! (${start} au ${end})</span>`;
                setTimeout(() => { if (statusDiv) statusDiv.innerHTML = ''; }, 4000);
              }
              
              populateMainWeekSelector();
              populateParentWeekSelector();
              populateAdminWeekSelectToEdit();
              renderAdminWeeksTable();
              if (currentWeek && String(currentWeek) === String(wNum)) {
                updateDynamicUIElements();
              }
              displayAlert(`Semaine ${wNum} mise à jour avec succès !`, false);
            } else {
              throw new Error(data.message || 'Erreur enregistrement');
            }
          } catch (err) {
            console.error('Erreur adminSaveSingleWeekConfig:', err);
            if (statusDiv) statusDiv.innerHTML = `<span style="color:#EF4444;"><i class="fas fa-times-circle"></i> Erreur: ${err.message}</span>`;
          }
        }

        async function adminResetWeeksToDefault() {
          const confirmReset = confirm('Êtes-vous sûr de vouloir réinitialiser toutes les 38 semaines aux dates officielles du calendrier scolaire 2026/2027 ?');
          if (!confirmReset) return;

          const statusDiv = document.getElementById('adminWeekConfigStatus');
          if (statusDiv) statusDiv.innerHTML = '<span style="color:#2563EB;"><i class="fas fa-spinner fa-spin"></i> Réinitialisation du calendrier...</span>';

          try {
            const res = await fetch('/api/admin/weeks-config', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ resetToDefault: true })
            });
            const data = await res.json();
            if (res.ok && data.success) {
              if (data.weeks) {
                weeksConfig = { ...data.weeks };
                for (const [wNum, wData] of Object.entries(weeksConfig)) {
                  specificWeekDateRanges[wNum] = { start: wData.start, end: wData.end };
                }
              }
              if (statusDiv) {
                statusDiv.innerHTML = '<span style="color:#10B981;"><i class="fas fa-check-circle"></i> Calendrier scolaire 2026/2027 réinitialisé avec succès !</span>';
                setTimeout(() => { if (statusDiv) statusDiv.innerHTML = ''; }, 4000);
              }
              populateMainWeekSelector();
              populateParentWeekSelector();
              populateAdminWeekSelectToEdit();
              renderAdminWeeksTable();
              if (currentWeek) updateDynamicUIElements();
              displayAlert('Calendrier réinitialisé avec succès !', false);
            } else {
              throw new Error(data.message || 'Erreur réinitialisation');
            }
          } catch (err) {
            console.error('Erreur adminResetWeeksToDefault:', err);
            if (statusDiv) statusDiv.innerHTML = `<span style="color:#EF4444;"><i class="fas fa-times-circle"></i> Erreur: ${err.message}</span>`;
          }
        }

        function renderAdminWeeksTable() {
          const container = document.getElementById('weeksTableContainer');
          if (!container) return;

          const sortedWeekNums = Object.keys(weeksConfig).map(n => parseInt(n, 10)).sort((a, b) => a - b);
          if (sortedWeekNums.length === 0) {
            container.innerHTML = '<p style="text-align:center; padding:15px; color:#64748B;">Aucune semaine configurée.</p>';
            return;
          }

          let html = `
            <table class="users-table" style="width:100%; border-collapse:collapse; font-size:0.88rem;">
              <thead>
                <tr style="background:#F1F5F9; color:#1E293B; border-bottom:2px solid #CBD5E1; text-align:left;">
                  <th style="padding:8px 12px; width:60px;">#</th>
                  <th style="padding:8px 12px;">Titre (Français)</th>
                  <th style="padding:8px 12px;">Titre (Arabe)</th>
                  <th style="padding:8px 12px;">Date Début (Du)</th>
                  <th style="padding:8px 12px;">Date Fin (Au)</th>
                  <th style="padding:8px 12px; text-align:center; width:90px;">Action</th>
                </tr>
              </thead>
              <tbody>
          `;

          sortedWeekNums.forEach(wNum => {
            const w = weeksConfig[wNum];
            html += `
              <tr style="border-bottom:1px solid #E2E8F0; hover:background:#F8FAFC;">
                <td style="padding:8px 12px; font-weight:700; color:#2563EB;">S${wNum}</td>
                <td style="padding:8px 12px; font-weight:600; color:#1E1B4B;">${w.title || `Semaine ${wNum}`}</td>
                <td style="padding:8px 12px; font-weight:600; color:#4338CA;" dir="rtl">${w.titleAr || `الأسبوع ${wNum}`}</td>
                <td style="padding:8px 12px; color:#0F766E;"><i class="far fa-calendar-alt"></i> ${w.start || '-'}</td>
                <td style="padding:8px 12px; color:#0F766E;"><i class="far fa-calendar-check"></i> ${w.end || '-'}</td>
                <td style="padding:8px 12px; text-align:center;">
                  <button type="button" class="pro-button primary-button" onclick="selectWeekForEditing(${wNum})" style="padding:4px 8px; font-size:0.8rem;">
                    <i class="fas fa-edit"></i> Modifier
                  </button>
                </td>
              </tr>
            `;
          });

          html += `
              </tbody>
            </table>
          `;
          container.innerHTML = html;
        }

        function selectWeekForEditing(wNum) {
          const sel = document.getElementById('adminWeekSelectToEdit');
          if (sel) {
            sel.value = String(wNum);
            onAdminSelectWeekToEdit();
            sel.scrollIntoView({ behavior: 'smooth', block: 'center' });
            sel.focus();
          }
        }

        // --- Utilitaires ---
        function escapeHtml(str) {
            if (str === null || str === undefined) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }
        function showProgressBar() { document.getElementById('progress-bar-container').style.display='block'; document.getElementById('progress-bar').style.width='0%'; document.getElementById('progress-bar').textContent='0%'; }
        function updateProgressBar(p) { const clampedP = Math.min(100, Math.max(0, p)); document.getElementById('progress-bar').style.width=clampedP+'%'; document.getElementById('progress-bar').textContent=clampedP+'%'; }
        function hideProgressBar() { setTimeout(() => { document.getElementById('progress-bar-container').style.display='none'; }, 500); }
        function displayAlert(msgKey, isErr = false, params = {}) { if (!msgKey) { const div=document.getElementById('message-alerte'); div.style.display='none'; div.textContent=''; div.className=''; if(alertTimeoutId) clearTimeout(alertTimeoutId); alertTimeoutId = null; return; } const msg = t(msgKey, params); console.log(`Alert:${isErr?'ERR':'OK'}-${msg}`); const div=document.getElementById('message-alerte'); div.textContent=msg; div.className = isErr ? 'alert-error' : (msgKey.includes('warn') || msgKey.includes('partial') ? 'alert-warning' : 'alert-success'); div.classList.add('message-alert-base'); div.style.display='block'; if(alertTimeoutId) clearTimeout(alertTimeoutId); alertTimeoutId=setTimeout(()=>{ if(div.textContent===msg){div.style.display='none'; div.textContent=''; div.className='';} alertTimeoutId=null; }, isErr ? 8000 : 5000); }
        function setButtonLoading(btnId, isLoading, iconClass) { const btn=document.getElementById(btnId); if(!btn) return; btn.disabled=isLoading; const icon=btn.querySelector('i'); if(icon) icon.className=isLoading ? 'fas fa-spinner fa-spin' : iconClass; }
        function containsArabic(text) { if (typeof text !== 'string') return false; const arabicRegex = /[\u0600-\u06FF]/; return arabicRegex.test(text); }
        function applyRTLToElement(element, content) { if (containsArabic(content)) { element.classList.add('arabic-content'); } else { element.classList.remove('arabic-content'); } }
        function formatDateForDisplay(d) { if (!d || isNaN(d.getTime())) return "Invalid Date"; const dayIndex = d.getUTCDay(); if (dayIndex === 5) { console.warn(`⚠️ Vendredi détecté (${d.toISOString().split('T')[0]}), remplacement par Jeudi`); d.setUTCDate(d.getUTCDate() - 1); } else if (dayIndex === 6) { console.warn(`⚠️ Samedi détecté (${d.toISOString().split('T')[0]}), remplacement par Dimanche suivant`); d.setUTCDate(d.getUTCDate() + 1); } const days = translations[currentUserLanguage].fullDays || translations.fr.fullDays; const months = translations[currentUserLanguage].months || translations.fr.months; const correctedDayIndex = d.getUTCDay(); const dayName = days[correctedDayIndex] || `Jour ${correctedDayIndex}`; const dayOfMonth = String(d.getUTCDate()).padStart(2, '0'); const monthName = months[d.getUTCMonth()]; const year = d.getUTCFullYear(); if (currentUserLanguage === 'en') { return `${dayName}, ${monthName} ${dayOfMonth}, ${year}`; } else { return `${dayName} ${dayOfMonth} ${monthName} ${year}`; } }
        
        const fieldKeyAliases = {
            'classe': ['classe', 'class', 'الفصل', 'الصف', 'صف', 'فصل', 'classes'],
            'jour': ['jour', 'day', 'اليوم', 'يوم', 'jours'],
            'periode': ['periode', 'période', 'period', 'الحصة', 'حصة', 'seance', 'séance'],
            'matiere': ['matiere', 'matière', 'subject', 'المادة', 'مادة'],
            'enseignant': ['enseignant', 'professeur', 'teacher', 'المعلم', 'الأستاذ', 'الاستاذ', 'prof', 'professeur(e)'],
            'lecon': ['lecon', 'leçon', 'lesson', 'الدرس', 'درس', 'titre', 'titre de la leçon'],
            'travaux de classe': ['travaux de classe', 'travaux', 'classwork', 'العمل الصفي', 'أعمال الفصل', 'اعمال الفصل', 'activites', 'activités'],
            'devoirs': ['devoirs', 'devoir', 'homework', 'الواجبات', 'الواجب', 'واجب', 'واجبات', 'devoir a la maison'],
            'support': ['support', 'supports', 'ressources', 'الدعم', 'المرفقات', 'lien', 'liens']
        };

        const findHKey = (targetHeader) => {
            if (!targetHeader) return null;
            const targetLower = targetHeader.trim().toLowerCase();
            const targetNorm = targetLower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            if (headers && headers.length > 0) {
                const direct = headers.find(h => h && h.trim().toLowerCase() === targetLower);
                if (direct) return direct;
                const normH = headers.find(h => h && h.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === targetNorm);
                if (normH) return normH;
                const aliases = fieldKeyAliases[targetNorm] || [];
                const aliasH = headers.find(h => {
                    if (!h) return false;
                    const hNorm = h.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                    return aliases.includes(hNorm);
                });
                if (aliasH) return aliasH;
            }
            return targetHeader;
        };

        function getRowField(row, fieldName, fallback = '') {
            if (!row || typeof row !== 'object') return fallback;
            if (row[fieldName] !== undefined && row[fieldName] !== null) return row[fieldName];
            
            const targetLower = String(fieldName).trim().toLowerCase();
            const targetNorm = targetLower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const keys = Object.keys(row);
            
            // 1. Direct match case-insensitive
            const directKey = keys.find(k => k.trim().toLowerCase() === targetLower);
            if (directKey && row[directKey] !== undefined && row[directKey] !== null) return row[directKey];
            
            // 2. Normalized match
            const normKey = keys.find(k => k.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === targetNorm);
            if (normKey && row[normKey] !== undefined && row[normKey] !== null) return row[normKey];
            
            // 3. Aliases
            const aliases = fieldKeyAliases[targetNorm] || [];
            for (const k of keys) {
                const kNorm = k.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                if (aliases.includes(kNorm) && row[k] !== undefined && row[k] !== null) {
                    return row[k];
                }
            }
            return fallback;
        }

        function normalizeDayName(dayStr) {
            if (!dayStr || typeof dayStr !== 'string') return null;
            const trimmed = dayStr.trim();
            const dayMap = {
                'dimanche': 'Dimanche', 'sun': 'Dimanche', 'sunday': 'Dimanche', 'الأحد': 'Dimanche', 'الاحد': 'Dimanche',
                'lundi': 'Lundi', 'mon': 'Lundi', 'monday': 'Lundi', 'الإثنين': 'Lundi', 'الاثنين': 'Lundi',
                'mardi': 'Mardi', 'tue': 'Mardi', 'tuesday': 'Mardi', 'الثلاثاء': 'Mardi',
                'mercredi': 'Mercredi', 'wed': 'Mercredi', 'wednesday': 'Mercredi', 'الأربعاء': 'Mercredi', 'الاربعاء': 'Mercredi',
                'jeudi': 'Jeudi', 'thu': 'Jeudi', 'thursday': 'Jeudi', 'الخميس': 'Jeudi'
            };
            const lower = trimmed.toLowerCase();
            if (dayMap[lower]) return dayMap[lower];
            for (const [k, v] of Object.entries(dayMap)) {
                if (lower.startsWith(k.toLowerCase())) return v;
            }
            const parsed = parseDateFromJourColumn(trimmed);
            if (parsed) {
                const dayNames = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
                return dayNames[parsed.getUTCDay()];
            }
            return null;
        }

        function getDateForDayName(dayNameFrench) { if(!weekStartDate || isNaN(weekStartDate.getTime())) return null; const dayMapFr = {"Dimanche":0, "Lundi":1, "Mardi":2, "Mercredi":3, "Jeudi":4}; const offset = dayMapFr[dayNameFrench]; if(offset === undefined) return null; const dt = new Date(Date.UTC(weekStartDate.getUTCFullYear(), weekStartDate.getUTCMonth(), weekStartDate.getUTCDate())); dt.setUTCDate(dt.getUTCDate() + offset); return dt; }
        function parseDateFromJourColumn(jourValue) { if (!jourValue || typeof jourValue !== 'string') return null; const trimmed = jourValue.trim(); const dayMapFr = {"Dimanche":0, "Lundi":1, "Mardi":2, "Mercredi":3, "Jeudi":4}; if (dayMapFr.hasOwnProperty(trimmed)) { return getDateForDayName(trimmed); } const frenchDateRegex = /^(Dimanche|Lundi|Mardi|Mercredi|Jeudi)\s+(\d{1,2})\s+(Janvier|Février|Mars|Avril|Mai|Juin|Juillet|Août|Septembre|Octobre|Novembre|Décembre)\s+(\d{4})$/i; const frenchMatch = trimmed.match(frenchDateRegex); if (frenchMatch) { const day = parseInt(frenchMatch[2], 10); const monthNames = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"]; const month = monthNames.findIndex(m => m.toLowerCase() === frenchMatch[3].toLowerCase()); const year = parseInt(frenchMatch[4], 10); if (month !== -1) { return new Date(Date.UTC(year, month, day)); } } const frenchDateNoDay = /^(\d{1,2})\s+(Janvier|Février|Mars|Avril|Mai|Juin|Juillet|Août|Septembre|Octobre|Novembre|Décembre)\s+(\d{4})$/i; const noDayMatch = trimmed.match(frenchDateNoDay); if (noDayMatch) { const day = parseInt(noDayMatch[1], 10); const monthNames = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"]; const month = monthNames.findIndex(m => m.toLowerCase() === noDayMatch[2].toLowerCase()); const year = parseInt(noDayMatch[3], 10); if (month !== -1) { return new Date(Date.UTC(year, month, day)); } } const isoRegex = /^(\d{4})-(\d{2})-(\d{2})$/; const isoMatch = trimmed.match(isoRegex); if (isoMatch) { const year = parseInt(isoMatch[1], 10); const month = parseInt(isoMatch[2], 10) - 1; const day = parseInt(isoMatch[3], 10); return new Date(Date.UTC(year, month, day)); } const dmyRegex = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/; const dmyMatch = trimmed.match(dmyRegex); if (dmyMatch) { const day = parseInt(dmyMatch[1], 10); const month = parseInt(dmyMatch[2], 10) - 1; const year = parseInt(dmyMatch[3], 10); return new Date(Date.UTC(year, month, day)); } const numValue = parseFloat(trimmed); if (!isNaN(numValue) && numValue > 0) { const excelEpoch = new Date(Date.UTC(1899, 11, 30)); const date = new Date(excelEpoch.getTime() + numValue * 86400000); if (!isNaN(date.getTime())) { return date; } } try { const attemptDate = new Date(trimmed); if (!isNaN(attemptDate.getTime())) { return attemptDate; } } catch (e) {} return null; }
        function extractDayName(jourValue) { if (!jourValue || typeof jourValue !== 'string') return null; const trimmed = jourValue.trim(); const dayNames = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi"]; if (dayNames.includes(trimmed)) { return trimmed; } const frenchDateRegex = /^(Dimanche|Lundi|Mardi|Mercredi|Jeudi)\s+/i; const match = trimmed.match(frenchDateRegex); if (match) { return match[1]; } const parsed = parseDateFromJourColumn(trimmed); if (parsed) { return dayNames[parsed.getUTCDay()]; } return null; }
        function formatUpdatedAt(dS) { if(!dS) return ''; try{const d=new Date(dS); if(isNaN(d.getTime())) return ''; return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; } catch(e){return '';} }

        // --- Fonctions Admin ---
        function handleFileUpload(event) { const file = event.target.files[0]; const statusSpan = document.getElementById('file-upload-status'); const saveBtn = document.getElementById('saveUploadedDataBtn'); uploadedPlanData = null; saveBtn.disabled = true; statusSpan.textContent = ''; if (!file) { statusSpan.textContent = t('no_file_selected'); return; } console.log(`[Admin Upload] Fichier: ${file.name}`); statusSpan.textContent = t('reading_file', { fileName: file.name }); if (!/\.(xlsx|xls)$/i.test(file.name)) { displayAlert("invalid_file_type", true); statusSpan.textContent = "Type invalide."; event.target.value = ''; return; } const reader = new FileReader(); reader.onload = function(e) { try { const data = e.target.result; const workbook = XLSX.read(data, { type: 'array' }); const firstSheetName = workbook.SheetNames[0]; const worksheet = workbook.Sheets[firstSheetName]; const jsonDataRaw = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null, raw: false }); if (!jsonDataRaw || jsonDataRaw.length < 1) throw new Error("Feuille Excel vide."); const headersRaw = jsonDataRaw[0]; if (!headersRaw || !Array.isArray(headersRaw) || headersRaw.length === 0) throw new Error("En-têtes non trouvés."); const extractedHeaders = headersRaw.map(h => h ? String(h).trim().replace(/\s+/g, ' ') : null).filter(Boolean); if (extractedHeaders.length === 0) throw new Error("Aucun en-tête valide."); const dataRows = jsonDataRaw.slice(1); uploadedPlanData = dataRows.map((row) => { if (!Array.isArray(row)) return null; const obj = {}; extractedHeaders.forEach((header, index) => { obj[header] = (row && index < row.length) ? row[index] : null; }); return Object.values(obj).some(val => val != null && String(val).trim() !== '') ? obj : null; }).filter(Boolean); console.log(`[Admin Upload] ${uploadedPlanData.length} lignes extraites.`); statusSpan.textContent = t('file_read_success', { count: uploadedPlanData.length }).replace(file.name, ''); displayAlert('file_read_success', false, { fileName: file.name, count: uploadedPlanData.length }); saveBtn.disabled = false; } catch (error) { console.error("Erreur lecture Excel:", error); displayAlert('file_error', true, { error: error.message }); statusSpan.textContent = t('file_error', { error: '' }).replace(': {error}', '.'); uploadedPlanData = null; saveBtn.disabled = true; event.target.value = ''; } }; reader.onerror = function(e) { console.error("Erreur FileReader:", e); displayAlert('file_error', true, { error: "Erreur FileReader" }); statusSpan.textContent = t('file_error', { error: '' }).replace(': {error}', '.'); uploadedPlanData = null; saveBtn.disabled = true; event.target.value = ''; }; reader.readAsArrayBuffer(file); }
        async function saveUploadedData() {
            const targetWeeks = (typeof getUploadTargetWeeks === 'function') ? getUploadTargetWeeks() : [];
            const adminSectionSelect = document.getElementById('adminUploadSectionSelect');
            const targetSection = (adminSectionSelect && adminSectionSelect.value) ? adminSectionSelect.value : (currentSection || 'garcons');
            const statusSpan = document.getElementById('file-upload-status');

            if (!targetWeeks || targetWeeks.length === 0) {
                displayAlert("please_select_week", true);
                if (statusSpan) statusSpan.innerHTML = '<span style="color:#EF4444;"><i class="fas fa-exclamation-circle"></i> Veuillez sélectionner au moins une semaine.</span>';
                return;
            }
            if (!uploadedPlanData || uploadedPlanData.length === 0) {
                displayAlert("no_data_to_save", true);
                if (statusSpan) statusSpan.innerHTML = '<span style="color:#EF4444;"><i class="fas fa-exclamation-circle"></i> Aucun fichier Excel chargé ou fichier vide.</span>';
                return;
            }

            const secLabel = targetSection === 'garcons' ? 'Garçons 👦' : (targetSection === 'primaire' ? 'Primaire & Maternelle 👶🎒' : 'Filles 👧');
            const isMulti = targetWeeks.length > 1;
            const weeksStr = isMulti ? `${targetWeeks.length} semaines (${targetWeeks.map(w => `S${w}`).join(', ')})` : `Semaine S${targetWeeks[0]}`;

            console.log(`[Admin Save] Enregistrement ${uploadedPlanData.length} lignes pour ${weeksStr} (Section ${targetSection}).`);
            displayAlert(`Enregistrement en cours pour ${weeksStr} (${secLabel})...`, false);
            setButtonLoading('saveUploadedDataBtn', true, 'fas fa-database');
            showProgressBar();
            updateProgressBar(15);

            try {
                let response, result;
                if (isMulti) {
                    response = await fetch('/api/save-multiple-weeks', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ weeks: targetWeeks, data: uploadedPlanData, section: targetSection })
                    });
                } else {
                    response = await fetch('/api/save-plan', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ week: targetWeeks[0], data: uploadedPlanData, section: targetSection })
                    });
                }

                updateProgressBar(85);
                result = await response.json();
                if (!response.ok) throw new Error(result.message || `Erreur serveur ${response.status}`);
                updateProgressBar(100);

                const successMsg = isMulti 
                    ? `Données appliquées avec succès sur ${targetWeeks.length} semaines pour la section ${secLabel} !`
                    : `Données de la semaine S${targetWeeks[0]} pour la section ${secLabel} enregistrées avec succès !`;

                displayAlert(successMsg, false);
                if (statusSpan) statusSpan.innerHTML = `<span style="color:#10B981;"><i class="fas fa-check-circle"></i> ${successMsg}</span>`;
                
                uploadedPlanData = null;
                const fileInputEl = document.getElementById('excelFileInput');
                if (fileInputEl) fileInputEl.value = '';
                const saveBtn = document.getElementById('saveUploadedDataBtn');
                if (saveBtn) saveBtn.disabled = true;
                
                if (targetSection === currentSection && targetWeeks.map(String).includes(String(currentWeek))) {
                    console.log("[Admin Save] Rechargement automatique de la semaine courante...");
                    await fetchPlanData(currentWeek);
                }
            } catch (error) {
                console.error("Erreur enregistrement upload:", error);
                displayAlert('uploaded_data_error', true, { error: error.message });
                if (statusSpan) statusSpan.innerHTML = `<span style="color:#EF4444;"><i class="fas fa-times-circle"></i> Erreur: ${error.message}</span>`;
                updateProgressBar(0);
            } finally {
                hideProgressBar();
                setButtonLoading('saveUploadedDataBtn', false, 'fas fa-database');
            }
        }
        async function populateAdminReportClassSelector() { const select = document.getElementById('adminReportClassSelector'); if (!select) return; select.innerHTML = `<option value="">${t('loading_classes')}</option>`; select.disabled = true; try { const response = await fetch(`/api/all-classes?section=${currentSection}`); if (!response.ok) throw new Error(`Erreur serveur ${response.status}`); const classes = await response.json(); if (classes && classes.length > 0) { select.innerHTML = `<option value="">${t('select_report_class')}</option>`; classes.sort(compareClasses).forEach(cls => { const opt = document.createElement('option'); opt.value = cls; const ar = classTranslations[cls]; opt.textContent = ar ? `${ar} (${cls})` : cls; select.appendChild(opt); }); select.disabled = false; } else { select.innerHTML = `<option value="">${t('no_classes_found')}</option>`; } } catch (error) { console.error("Erreur chargement des classes pour le rapport:", error); select.innerHTML = `<option value="">Erreur chargement</option>`; displayAlert('error', true, { error: 'Erreur chargement des classes.' }); } }
        async function generateFullReportByClass() { const classSelector = document.getElementById('adminReportClassSelector'); const selectedClass = classSelector.value; if (!selectedClass) { displayAlert('please_select_class_for_report', true); return; } console.log(`Demande de rapport complet pour la classe : ${selectedClass}`); displayAlert('generating_full_report', false, { classe: selectedClass }); setButtonLoading('generateFullReportBtn', true, 'fas fa-file-invoice'); showProgressBar(); updateProgressBar(10); try { const response = await fetch('/api/full-report-by-class', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ classe: selectedClass }) }); updateProgressBar(80); if (response.ok) { const blob = await response.blob(); const contentDisposition = response.headers.get('content-disposition'); let filename = `Rapport_Complet_${selectedClass}.xlsx`; if (contentDisposition) { const filenameMatch = contentDisposition.match(/filename="?(.+?)"?(;|$)/i); if (filenameMatch && filenameMatch[1]) { filename = filenameMatch[1]; } } saveAs(blob, filename); updateProgressBar(100); displayAlert('generating_full_report_success', false, { classe: selectedClass }); } else { const errorResult = await response.json().catch(() => ({ message: "Erreur inconnue du serveur." })); throw new Error(errorResult.message || `Erreur serveur ${response.status}`); } } catch (error) { console.error('Erreur lors de la génération du rapport complet:', error); displayAlert('generating_full_report_error', true, { classe: selectedClass, error: error.message }); updateProgressBar(0); } finally { hideProgressBar(); setButtonLoading('generateFullReportBtn', false, 'fas fa-file-invoice'); } }
        
        function populateNotesClassSelector() {
            const sel = document.getElementById('notesClassSelector');
            const txt = document.getElementById('notesInput');
            const btn = document.getElementById('saveNotesBtn');
            if (!sel) return;
            sel.innerHTML = `<option value="">${t('select_class')}</option>`;
            const clsK = findHKey('Classe');
            const ensK = findHKey('Enseignant');
            if (!clsK || !planData || planData.length === 0) {
                if (txt) { txt.disabled = true; txt.placeholder = t('no_data'); }
                if (btn) btn.disabled = true;
                return;
            }
            let teacherData = planData;
            const isTeacherOnly = loggedInUser && !isUserAdminOrSupervisor(loggedInUser, currentUserRole);
            if (isTeacherOnly && ensK) {
                teacherData = planData.filter(i => {
                    if (!i || !i[ensK]) return false;
                    return isRowForLoggedInTeacher(i[ensK], loggedInUser, loggedInTeacherTable);
                });
            }
            const uniqueCls = [...new Set(teacherData.map(i => i[clsK]).filter(Boolean))].sort(compareClasses);
            uniqueCls.forEach(cls => {
                const opt = document.createElement('option');
                opt.value = cls;
                const ar = classTranslations[cls];
                opt.textContent = ar ? `${ar} (${cls})` : cls;
                sel.appendChild(opt);
            });
            if (txt) { txt.value = ''; txt.disabled = true; txt.placeholder = t('select_class_placeholder'); }
            if (btn) btn.disabled = true;
        }
        function displayClassNotes() { const sel=document.getElementById('notesClassSelector'); const txt=document.getElementById('notesInput'); const btn=document.getElementById('saveNotesBtn'); const selCls=sel.value; if(selCls && weeklyClassNotes) { const note=weeklyClassNotes[selCls]; txt.value=note||''; txt.disabled=false; btn.disabled=false; applyRTLToElement(txt, note||""); const selText = sel.options[sel.selectedIndex].text; txt.placeholder = t('notes_placeholder', { classText: selText }); } else { txt.value=''; txt.disabled=true; btn.disabled=true; txt.placeholder=selCls ? t('no_data') : t('select_class_placeholder'); } document.getElementById('notes-save-status').textContent=''; }
        async function saveNotes() { const statusEl=document.getElementById('notes-save-status'); const classSel=document.getElementById('notesClassSelector'); const selCls=classSel.value; if(!selCls){displayAlert("select_class",true); return;} if(!currentWeek){displayAlert("please_select_week",true); return;} statusEl.textContent = t('saving'); displayAlert(''); setButtonLoading('saveNotesBtn',true,'fas fa-save'); const notesVal=document.getElementById('notesInput').value; console.log(t('saving_notes_for', { class: selCls, week: currentWeek })); try{ const response=await fetch('/api/save-notes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({week:currentWeek,classe:selCls,notes:notesVal,section:currentSection})}); const result=await response.json(); if(!response.ok){throw new Error(result.message||`Erreur ${response.status}`);} weeklyClassNotes[selCls]=notesVal; displayAlert('notes_saved_success', false, { class: selCls, week: currentWeek }); statusEl.textContent = t('saved'); setTimeout(()=>{statusEl.textContent='';},3000); } catch(error){ console.error('Err saveNotes:',error); displayAlert('error_saving_notes', true, { error: error.message }); statusEl.textContent=`${t('error_saving_notes',{error:''}).replace(': {error}','')}: ${error.message}`; } finally{setButtonLoading('saveNotesBtn',false,'fas fa-save');} }
        function getCurrentWeekNumber() {
            const today = new Date();
            const y = today.getFullYear();
            const m = String(today.getMonth() + 1).padStart(2, '0');
            const d = String(today.getDate()).padStart(2, '0');
            const todayStr = `${y}-${m}-${d}`;

            const config = (typeof weeksConfig !== 'undefined' && weeksConfig && Object.keys(weeksConfig).length > 0)
                ? weeksConfig
                : (typeof specificWeekDateRanges !== 'undefined' ? specificWeekDateRanges : {});

            const sortedWeeks = Object.keys(config)
                .map(k => parseInt(k, 10))
                .filter(n => !isNaN(n))
                .sort((a, b) => a - b);

            if (sortedWeeks.length === 0) return 1;

            const firstWeekStart = config[sortedWeeks[0]]?.start;
            if (firstWeekStart && todayStr < firstWeekStart) {
                return sortedWeeks[0];
            }

            for (let i = 0; i < sortedWeeks.length; i++) {
                const currentWeekNum = sortedWeeks[i];
                const nextWeekNum = sortedWeeks[i + 1];
                const currentStart = config[currentWeekNum]?.start;
                const nextStart = nextWeekNum ? config[nextWeekNum]?.start : null;

                if (currentStart) {
                    if (nextStart) {
                        if (todayStr >= currentStart && todayStr < nextStart) {
                            return currentWeekNum;
                        }
                    } else {
                        if (todayStr >= currentStart) {
                            return currentWeekNum;
                        }
                    }
                }
            }

            return sortedWeeks[0] || 1;
        }

        // Pour les enseignants : sélectionne automatiquement par défaut la SEMAINE PROCHAINE (N+1) pour préparer les cours
        function getTeacherDefaultWeekNumber() {
            const currentW = getCurrentWeekNumber();
            const maxWeek = (typeof weeksConfig !== 'undefined' && Object.keys(weeksConfig).length > 0)
                ? Math.max(...Object.keys(weeksConfig).map(Number))
                : 38;
            if (typeof currentW === 'number' && !isNaN(currentW)) {
                return Math.min(currentW + 1, maxWeek);
            }
            return 1;
        }

        // Détermine le jour scolaire actif d'aujourd'hui (Dimanche à Jeudi) pour les parents
        function getTodaySchoolDayName() {
            const today = new Date();
            const dayIdx = today.getDay(); // 0=Dimanche, 1=Lundi, 2=Mardi, 3=Mercredi, 4=Jeudi, 5=Vendredi, 6=Samedi
            const schoolDays = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi"];
            if (dayIdx >= 0 && dayIdx <= 4) {
                return schoolDays[dayIdx];
            }
            return "Dimanche";
        }

        // Fonction pour envoyer des notifications push aux enseignants incomplets
        async function notifyIncompleteTeachers(week, incompleteTeachersInfo) {
            if (!week || !incompleteTeachersInfo || Object.keys(incompleteTeachersInfo).length === 0) {
                return;
            }

            try {
                // Convertir Set en Array pour l'API
                const teachersData = {};
                for (const [teacher, classesSet] of Object.entries(incompleteTeachersInfo)) {
                    teachersData[teacher] = Array.from(classesSet);
                }

                console.log(`🔔 Envoi de notifications aux enseignants incomplets:`, teachersData);

                const response = await fetch('/api/notify-incomplete-teachers', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        week: week,
                        incompleteTeachers: teachersData
                    })
                });

                if (response.ok) {
                    const result = await response.json();
                    console.log(`✅ Notifications envoyées: ${result.notificationsSent}/${result.totalIncomplete}`);
                } else {
                    console.warn(`⚠️ Erreur envoi notifications:`, await response.text());
                }
            } catch (error) {
                console.error('❌ Erreur lors de l\'envoi des notifications:', error);
            }
        }

        function checkAndDisplayIncompleteTeachers() { console.log("checkIncomplete"); incompleteTeachersInfo={}; const list=document.getElementById('incompleteList'); list.innerHTML=''; if(!planData||planData.length===0){list.innerHTML=`<li>${t('no_data')}</li>`; return;} const teacherKey=findHKey('Enseignant'); const classKey=findHKey('Classe'); const leconKey=findHKey('Leçon'); const taskKey=findHKey('Travaux de classe'); const supportKey=findHKey('Support'); const devoirsKey=findHKey('Devoirs'); if(!teacherKey||!classKey){console.warn("Manque cols Ens/Cls"); list.innerHTML=`<li>${t('error_config_columns')}</li>`; return;} planData.forEach(item=>{const teacher=item[teacherKey]; const clsName=item[classKey]; if(!teacher||!clsName) return; const leconVal=item[leconKey]; const taskVal=item[taskKey]; const supportVal=item[supportKey]; const devoirsVal=item[devoirsKey]; const isLeconEmpty=(leconVal==null||String(leconVal).trim()===''); const isTaskEmpty=(taskVal==null||String(taskVal).trim()===''); const isSupportEmpty=(supportVal==null||String(supportVal).trim()===''); const isDevoirsEmpty=(devoirsVal==null||String(devoirsVal).trim()===''); if(isLeconEmpty&&isTaskEmpty&&isSupportEmpty&&isDevoirsEmpty){if(!incompleteTeachersInfo[teacher]){incompleteTeachersInfo[teacher]=new Set();} incompleteTeachersInfo[teacher].add(clsName);}}); let teachers=Object.keys(incompleteTeachersInfo); const isAdmin=(isUserAdminOrSupervisor(loggedInUser, currentUserRole) || loggedInUser==='Mohamed'||loggedInUser==='Zohra'||loggedInUser==='Imad'); if(!isAdmin&&loggedInUser){teachers=teachers.filter(t=>t===loggedInUser);} if(teachers.length===0){list.innerHTML=`<li>${t('all_complete')}</li>`;} else { teachers.sort().forEach(teacher=>{ const classes=[...incompleteTeachersInfo[teacher]].sort().join(', '); const li=document.createElement('li'); li.innerHTML = `<span class="incomplete-teacher-name">${teacher}</span> (<span class="incomplete-class-list">${classes}</span>)`; list.appendChild(li); }); } }
        function toggleIncompleteList() { const listDiv=document.getElementById('incompleteTeachersDisplay'); const btn=document.getElementById('toggleIncompleteBtn'); const btnTextSpan = btn.querySelector('.btn-text'); if(listDiv.style.display==='none'||listDiv.style.display===''){ listDiv.style.display='block'; btn.querySelector('i').className = 'fas fa-xmark'; if(btnTextSpan) btnTextSpan.textContent = t('hide_incomplete'); } else { listDiv.style.display='none'; btn.querySelector('i').className = 'fas fa-list-check'; if(btnTextSpan) btnTextSpan.textContent = t('display_incomplete'); } }
        async function fetchPlanData(week) { if (!week || isNaN(parseInt(week, 10))) { console.warn("fetchPlanData sans semaine valide."); displayPlanTable([]); document.getElementById('weekDateRange').textContent = t('please_select_week'); return; } if (!loggedInUser) { console.warn("Tentative chargement non connecté."); displayAlert("login_title", true); return; } console.log(`fetchPlanData S${week} (${currentSection}) pour ${loggedInUser}`); displayAlert('loading_data_week', false, { week: week }); showProgressBar(); updateProgressBar(10); currentWeek = week; const weekNum=parseInt(week,10); const dateRangeEl=document.getElementById('weekDateRange'); weekStartDate=null; planData=[]; headers=[]; weeklyClassNotes={}; dateRangeEl.textContent=`${t('week_label')} ${week}: ${t('loading')}`; displayPlanTable([]); updateActionButtonsState(false); const dates=specificWeekDateRanges[weekNum]; if(dates?.start&&dates?.end){try{const s=new Date(dates.start+'T00:00:00Z'); const e=new Date(dates.end+'T00:00:00Z'); if(!isNaN(s.getTime())&&!isNaN(e.getTime())){ weekStartDate=s; dateRangeEl.textContent = `${t('week_label')} ${week} : ${isArabicUser() ? 'من' : (currentUserLanguage === 'en' ? 'from' : 'du')} ${formatDateForDisplay(s)} ${isArabicUser() ? 'إلى' : (currentUserLanguage === 'en' ? 'to' : 'à')} ${formatDateForDisplay(e)}`;} else throw new Error();}catch(e){dateRangeEl.textContent=`S ${week} (Err dates)`; weekStartDate=null;}} else {dateRangeEl.textContent=`${t('week_label')} ${week} (${t('no_data')}: dates non définies)`; weekStartDate=null;} updateProgressBar(30); try{const r=await fetch(`/api/plans/${week}?section=${currentSection}`); updateProgressBar(70); if(!r.ok){const d=await r.json().catch(()=>null); throw new Error(d?.message || `Err ${r.status}`);} const fetched=await r.json(); if(fetched&&typeof fetched==='object'){planData=fetched.planData||[]; weeklyClassNotes=fetched.classNotes||{}; window.availableWeeklyPlans = fetched.availableWeeklyPlans || [];} else {planData=[]; weeklyClassNotes={}; window.availableWeeklyPlans = [];} updateProgressBar(90); if(planData.length>0){headers=Object.keys(planData[0]).filter(h=>h!=='_id'&&h!=='id'&&h!=='_originalCopy'&&h!=='lessonPlanId'&&h!=='__v'&&!h.startsWith('_')); if(loggedInUser==='Imad'){const enseignantKey=findHKey('Enseignant');const originalCount=planData.length;if(enseignantKey){planData=planData.filter(row=>arabicTeachers.includes(row[enseignantKey]));console.log(`[Imad Admin] Data filtered for Arabic teachers. ${planData.length}/${originalCount} rows remain.`)}} displayAlert('data_loaded_week', false, { week: week });} else {headers=[]; displayAlert('no_data_found_week', false, { week: week });} createTableHeader(); populateFilterOptions(); populateNotesClassSelector(); sortAndDisplay(); displayClassNotes(); checkAndDisplayIncompleteTeachers(); updateActionButtonsState(planData.length > 0); updateProgressBar(100); } catch(e){ console.error("Err fetchPlanData:",e); displayAlert('error_loading_week', true, { week: week, error: e.message }); planData=[]; headers=[]; weeklyClassNotes={}; createTableHeader(); populateFilterOptions(); populateNotesClassSelector(); sortAndDisplay(); displayClassNotes(); checkAndDisplayIncompleteTeachers(); updateProgressBar(0); updateActionButtonsState(false); } finally{hideProgressBar();} }
        
        function makeTableColumnsResizable() {
            const table = document.getElementById('planTable');
            if (!table) return;
            const ths = table.querySelectorAll('thead th');
            ths.forEach(th => {
                const existing = th.querySelector('.col-resizer');
                if (existing) existing.remove();

                const resizer = document.createElement('div');
                resizer.className = 'col-resizer';
                th.appendChild(resizer);

                resizer.addEventListener('mousedown', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    const startX = e.pageX;
                    const startWidth = th.offsetWidth;
                    resizer.classList.add('resizing');
                    document.body.style.cursor = 'col-resize';
                    document.body.style.userSelect = 'none';

                    function onMouseMove(e) {
                        const diffX = e.pageX - startX;
                        const newWidth = Math.max(50, startWidth + diffX);
                        th.style.width = newWidth + 'px';
                        th.style.minWidth = newWidth + 'px';
                    }

                    function onMouseUp() {
                        resizer.classList.remove('resizing');
                        document.body.style.cursor = '';
                        document.body.style.userSelect = '';
                        document.removeEventListener('mousemove', onMouseMove);
                        document.removeEventListener('mouseup', onMouseUp);
                    }

                    document.addEventListener('mousemove', onMouseMove);
                    document.addEventListener('mouseup', onMouseUp);
                });
            });
        }

        function createTableHeader() {
            const tHead = document.querySelector('#planTable thead tr');
            tHead.innerHTML = '';
            const curH = headers || [];
            const hDisp = curH.filter(h => h !== '_id' && h !== 'id' && h.toLowerCase() !== 'updatedat' && h !== '_originalCopy' && h !== 'lessonPlanId' && h !== '__v' && !h.startsWith('_'));
            const headerTranslations = translations[currentUserLanguage].headers || translations.fr.headers;
            
            const isAr = (currentUserLanguage === 'ar' || arabicTeachers.includes(loggedInUser));
            const supportKey = findHKey('Support');

            if (hDisp.length > 0) {
                hDisp.forEach(h => {
                    // Pour l'Arabe : afficher uniquement Leçon, Travaux de classe et Devoirs pour la saisie (masquer Support)
                    if (isAr && h === supportKey) {
                        return;
                    }
                    
                    const th = document.createElement('th');
                    th.textContent = headerTranslations[h] || h;
                    tHead.appendChild(th);
                });
                
                const actTh = document.createElement('th');
                actTh.textContent = t('actions');
                actTh.classList.add('actions-column');
                tHead.appendChild(actTh);
                
                if (curH.some(h => h.toLowerCase() === 'updatedat')) {
                    const updTh = document.createElement('th');
                    updTh.textContent = t('updated_at');
                    updTh.classList.add('updated-at-column');
                    tHead.appendChild(updTh);
                }
            }
            const tBody = document.querySelector('#planTable tbody');
            tBody.innerHTML = '';
            makeTableColumnsResizable();
        }

        function updateFilterOptionDefaultTexts() { const filters = [ { selId: 'filterEnseignant', defaultKey: 'all' }, { selId: 'filterClasse', defaultKey: 'all_f' }, { selId: 'filterMatiere', defaultKey: 'all_f' }, { selId: 'filterPeriode', defaultKey: 'all_f' }, { selId: 'filterJour', defaultKey: 'all' }, { selId: 'weekSelector', defaultKey: 'select_week' }, { selId: 'notesClassSelector', defaultKey: 'select_class' } ]; filters.forEach(f => { const select = document.getElementById(f.selId); if (select) { const defaultOption = select.querySelector('option[value=""]'); if (defaultOption) { defaultOption.textContent = t(f.defaultKey); } } }); const jSel = document.getElementById('filterJour'); if (jSel) { const dayOptions = jSel.querySelectorAll('option'); const dayValues = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi"]; const dayTransKeys = ["day_sun", "day_mon", "day_tue", "day_wed", "day_thu"]; dayOptions.forEach(opt => { if (opt.value !== "") { const idx = dayValues.indexOf(opt.value); if (idx !== -1) opt.textContent = t(dayTransKeys[idx]); } }); } const weekSel = document.getElementById('weekSelector'); if (weekSel) { const weekOptions = weekSel.querySelectorAll('option'); weekOptions.forEach(opt => { if (opt.value && opt.value.match(/^\d+$/)) { const weekLabel = t('week_label'); opt.textContent = `${weekLabel.replace(':', '')} ${opt.value}`; } }); } }
        
        function populateFilterOptions() { 
            const allData = planData || []; 
            let data = allData;
            const ensK = findHKey('Enseignant'); 
            const clsK = findHKey('Classe'); 
            const perK = findHKey('Période'); 
            const matK = findHKey('Matière'); 
            const isTeacherOnly = loggedInUser && !isUserAdminOrSupervisor(loggedInUser, currentUserRole);

            // Si l'utilisateur est un enseignant connecté (non admin/superviseur), n'extraire les options (matières, classes, etc.) QUE de ses propres séances
            if (isTeacherOnly && ensK) { 
                data = allData.filter(i => { 
                    const iE = i && i[ensK] ? String(i[ensK]) : ''; 
                    return isRowForLoggedInTeacher(iE, loggedInUser, loggedInTeacherTable);
                }); 
            } 

            const getUniq = (k) => { 
                const uniq = new Set(); 
                data.forEach(i => { 
                    if (i && i[k] != null && String(i[k]).trim() !== '') { 
                        uniq.add(String(i[k]).trim()); 
                    } 
                }); 
                if (k?.trim().toLowerCase() === 'classe') { 
                    return [...uniq].sort(compareClasses); 
                } else { 
                    return [...uniq].sort((a, b) => String(a).localeCompare(String(b))); 
                } 
            }; 

            let ens = ensK ? getUniq(ensK) : []; 
            if (isTeacherOnly) {
                if (ens.length === 0) {
                    ens = [loggedInTeacherTable || loggedInUser];
                }
            }
            const cls = clsK ? getUniq(clsK) : []; 
            const per = perK ? getUniq(perK) : []; 
            const mat = matK ? getUniq(matK) : []; 
            const updateSel = (id, opts, isCls = false) => { 
                const sel = document.getElementById(id); 
                if (!sel) return;
                const curV = sel.value; 
                const defaultOptHTML = sel.querySelector('option[value=""]')?.outerHTML || `<option value="">${t(isCls ? 'all_f' : 'all')}</option>`; 
                sel.innerHTML = defaultOptHTML; 
                opts.forEach(o => { 
                    const opt = document.createElement('option'); 
                    opt.value = o; 
                    if (isCls) { 
                        const ar = classTranslations[o]; 
                        opt.textContent = ar ? `${ar} (${o})` : o; 
                    } else { 
                        opt.textContent = o; 
                    } 
                    sel.appendChild(opt); 
                }); 
                if (opts.includes(curV)) { 
                    sel.value = curV; 
                } else { 
                    sel.value = ""; 
                } 
            }; 
            updateSel('filterEnseignant', ens); 
            updateSel('filterClasse', cls, true); 
            updateSel('filterPeriode', per); 
            updateSel('filterMatiere', mat); 
            updateFilterOptionDefaultTexts(); 
            const filterEnsSelect = document.getElementById('filterEnseignant'); 
            if (filterEnsSelect) {
                if (isTeacherOnly) { 
                    const matchingOption = Array.from(filterEnsSelect.options).find(o => 
                        (o.value && isRowForLoggedInTeacher(o.value, loggedInUser, loggedInTeacherTable))
                    );
                    if (matchingOption) {
                        filterEnsSelect.value = matchingOption.value;
                    } else if (filterEnsSelect.options.length > 1) {
                        filterEnsSelect.selectedIndex = 1;
                    } else {
                        const opt = document.createElement('option');
                        opt.value = loggedInTeacherTable || loggedInUser;
                        opt.textContent = loggedInTeacherTable || loggedInUser;
                        filterEnsSelect.appendChild(opt);
                        filterEnsSelect.value = opt.value;
                    }
                    filterEnsSelect.disabled = true; 
                } else { 
                    filterEnsSelect.disabled = false; 
                } 
            }
        }

        function sortAndDisplay() { 
            const isTeacherOnly = loggedInUser && !isUserAdminOrSupervisor(loggedInUser, currentUserRole);
            const filterEnsSelect = document.getElementById('filterEnseignant'); 
            if (filterEnsSelect) {
                if (isTeacherOnly) { 
                    const matchingOption = Array.from(filterEnsSelect.options).find(o => 
                        (o.value && isRowForLoggedInTeacher(o.value, loggedInUser, loggedInTeacherTable))
                    );
                    if (matchingOption) {
                        filterEnsSelect.value = matchingOption.value;
                    } else if (filterEnsSelect.options.length > 1) {
                        filterEnsSelect.selectedIndex = 1;
                    } else {
                        filterEnsSelect.value = loggedInTeacherTable || loggedInUser; 
                    }
                    filterEnsSelect.disabled = true; 
                } else { 
                    filterEnsSelect.disabled = false; 
                } 
            }
            const ensF = filterEnsSelect ? filterEnsSelect.value : ''; 
            const clsF = document.getElementById('filterClasse')?.value || ''; 
            const matF = document.getElementById('filterMatiere')?.value || ''; 
            const perF = document.getElementById('filterPeriode')?.value || ''; 
            const jF = document.getElementById('filterJour')?.value || ''; 
            const ensK = findHKey('Enseignant'); 
            const clsK = findHKey('Classe'); 
            const matK = findHKey('Matière'); 
            const perK = findHKey('Période'); 
            const jK = findHKey('Jour'); 
            
            filteredAndSortedData = planData.filter(i => { 
                if (!i) return false; 
                const iE = ensK && i.hasOwnProperty(ensK) ? String(i[ensK]) : null; 
                const iC = clsK && i.hasOwnProperty(clsK) ? String(i[clsK]) : null; 
                const iM = matK && i.hasOwnProperty(matK) ? String(i[matK]) : null; 
                const iP = perK && i.hasOwnProperty(perK) ? String(i[perK]) : null; 
                const iJ = jK && i.hasOwnProperty(jK) ? String(i[jK]) : null; 
                
                // Si l'utilisateur est un enseignant (non admin/superviseur), n'afficher STRICTEMENT que ses séances
                if (isTeacherOnly) {
                    if (!isRowForLoggedInTeacher(iE, loggedInUser, loggedInTeacherTable)) {
                        return false;
                    }
                }
                
                const pE = !ensF || iE === ensF || isRowForLoggedInTeacher(iE, ensF, null); 
                const pC = !clsF || iC === clsF; 
                const pM = !matF || iM === matF; 
                const pP = !perF || iP === perF; 
                const dayNameFromData = iJ ? extractDayName(iJ) : null; 
                const pJ = !jF || dayNameFromData === jF; 
                return pE && pC && pM && pP && pJ; 
            }); 
            
            const dayValuesFr = { "Dimanche": 1, "Lundi": 2, "Mardi": 3, "Mercredi": 4, "Jeudi": 5 }; 
            filteredAndSortedData.sort((a, b) => { 
                const classA = (clsK && a.hasOwnProperty(clsK)) ? a[clsK] : null; 
                const classB = (clsK && b.hasOwnProperty(clsK)) ? b[clsK] : null; 
                const classComp = compareClasses(classA, classB); 
                if (classComp !== 0) return classComp; 
                const jA_fr = (jK && a.hasOwnProperty(jK)) ? extractDayName(String(a[jK])) : null; 
                const jB_fr = (jK && b.hasOwnProperty(jK)) ? extractDayName(String(b[jK])) : null; 
                const dayOrdA = dayValuesFr[jA_fr] || 99; 
                const dayOrdB = dayValuesFr[jB_fr] || 99; 
                const dC = dayOrdA - dayOrdB; 
                if (dC !== 0) return dC; 
                const pA = (perK && a.hasOwnProperty(perK)) ? a[perK] : null; 
                const pB = (perK && b.hasOwnProperty(perK)) ? b[perK] : null; 
                const piA = parseInt(pA, 10); 
                const piB = parseInt(pB, 10); 
                if (!isNaN(piA) && !isNaN(piB)) { 
                    return piA - piB; 
                } else { 
                    const sA = pA == null ? '' : String(pA); 
                    const sB = pB == null ? '' : String(pB); 
                    return sA.localeCompare(sB); 
                } 
            }); 
            displayPlanTable(filteredAndSortedData); 
            updateActionButtonsState(filteredAndSortedData.length > 0); 
        }
        
        function displayPlanTable(data) {
            const tBody = document.querySelector('#planTable tbody');
            const tHead = document.querySelector('#planTable thead tr');
            tBody.innerHTML = '';
            const actualHdrCount = tHead ? tHead.querySelectorAll('th').length : 0;
            const colspanVal = actualHdrCount > 0 ? actualHdrCount : 10;
            const curH = headers || [];
            const hDisp = curH.filter(h => h !== '_id' && h.toLowerCase() !== 'updatedat' && h !== 'id' && h !== '_originalCopy' && h !== 'lessonPlanId' && h !== '__v' && !h.startsWith('_'));
            const jK = findHKey('Jour');
            const clsK = findHKey('Classe');
            const updK = findHKey('updatedAt');
            
            const isAdmin = isUserAdminOrSupervisor(loggedInUser, currentUserRole);
            let allowedEditNames = ['Leçon', 'Travaux de classe', 'Support', 'Devoirs'];
            if (isAdmin) {
                allowedEditNames = ['Enseignant', 'Jour', 'Période', 'Classe', 'Matière', 'Leçon', 'Travaux de classe', 'Support', 'Devoirs'];
            }
            const editHdrKeys = allowedEditNames.map(k => findHKey(k)).filter(Boolean);

            const isAr = (currentUserLanguage === 'ar' || arabicTeachers.includes(loggedInUser));
            const supportKey = findHKey('Support');
            const initialRow = document.getElementById('initial-table-row');
            if(initialRow) initialRow.remove();
            if (!currentWeek) {
                tBody.innerHTML = `<tr id="initial-table-row"><td colspan="${colspanVal}" class="table-message">${t('select_week_to_display')}</td></tr>`;
                return;
            }
            if (curH.length === 0 && currentWeek) {
                tBody.innerHTML = `<tr id="initial-table-row"><td colspan="${colspanVal}" class="table-message">${t('error_structure')}</td></tr>`;
                return;
            }
            if (!data || data.length === 0) {
                tBody.innerHTML = `<tr id="initial-table-row"><td colspan="${colspanVal}" class="table-message">${t('no_data_to_display_filters')}</td></tr>`;
                return;
            }
            data.forEach((rowObj, rIdx) => {
                if (rowObj && !rowObj._originalCopy) {
                    rowObj._originalCopy = { ...rowObj };
                }
                const tr = document.createElement('tr');
                tr.dataset.rowIndex = rIdx;
                hDisp.forEach(header => {
                    if (isAr && header === supportKey) {
                        return;
                    }
                    
                    const td = document.createElement('td');
                    let content = rowObj ? (rowObj[header] ?? '') : '';
                    td.setAttribute('dir', 'auto');
                    const isEditable = editHdrKeys.includes(header);

                    if (header === jK && content && !isAdmin) {
                        const dt = parseDateFromJourColumn(content);
                        td.textContent = dt ? formatDateForDisplay(dt) : content;
                    } else if (header === clsK && content && !isAdmin) {
                        const ar = classTranslations[content];
                        td.textContent = ar ? `${ar} (${content})` : content;
                    } else if (isEditable) {
                        td.contentEditable = true;
                        td.classList.add('editable');
                        td.textContent = content;
                        td.spellcheck = true;
                        applyRTLToElement(td, content);
                        
                        td.addEventListener('paste', (e) => {
                            e.preventDefault();
                            const text = (e.clipboardData || window.clipboardData).getData('text');
                            const cleanedText = text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
                            document.execCommand('insertText', false, cleanedText);
                        });
                        
                        td.addEventListener('input', (e) => {
                            if (rowObj) {
                                rowObj[header] = e.target.textContent;
                                applyRTLToElement(e.target, e.target.textContent);
                            }
                            const parentTR = e.target.closest('tr');
                            if (parentTR) {
                                parentTR.classList.add('modified');
                                const indicator = parentTR.querySelector('.save-indicator');
                                if (indicator) indicator.style.display = 'none';
                            }
                        });
                    } else {
                        td.textContent = content;
                    }
                    tr.appendChild(td);
                });
                const actTd = document.createElement('td');
                actTd.classList.add('actions-column');
                const saveBtn = document.createElement('button');
                saveBtn.innerHTML = '<i class="fas fa-check"></i>';
                saveBtn.title = t('save_row_title');
                saveBtn.classList.add('save-row-button');
                saveBtn.onclick = () => saveRow(rowObj, tr);
                actTd.appendChild(saveBtn);
                const indicatorSpan = document.createElement('span');
                indicatorSpan.className = 'save-indicator';
                indicatorSpan.innerHTML = '<i class="fas fa-check-circle"></i>';
                indicatorSpan.style.display = rowObj && updK && rowObj[updK] ? 'inline-block' : 'none';
                actTd.appendChild(indicatorSpan);
                
                // Bouton disquette pour générer le plan de leçon IA pour cette ligne
                const teacherKey = findHKey('Enseignant');
                const rowTeacher = teacherKey ? rowObj[teacherKey] : null;
                const canGenerate = (isUserAdminOrSupervisor(loggedInUser, currentUserRole) || loggedInUser === rowTeacher);
                
                if (canGenerate) {
                    const aiGenBtn = document.createElement('button');
                    aiGenBtn.innerHTML = '<i class="fas fa-save"></i>';
                    aiGenBtn.title = 'Générer Plan de Leçon de cette séance';
                    aiGenBtn.classList.add('ai-lesson-plan-button');
                    aiGenBtn.style.marginLeft = '5px';
                    
                    if (rowObj && rowObj.lessonPlanId) {
                        aiGenBtn.classList.add('lesson-plan-exists');
                        aiGenBtn.title = 'Plan de Leçon déjà généré - Régénérer';
                    }
                    
                    aiGenBtn.onclick = () => generateAILessonPlan(rowObj, tr);
                    actTd.appendChild(aiGenBtn);
                }
                
                // Bouton pour télécharger le plan de leçon
                if (rowObj && rowObj.lessonPlanId) {
                    const teacherKey = findHKey('Enseignant');
                    const rowTeacher = teacherKey ? rowObj[teacherKey] : null;
                    const canDownload = (isUserAdminOrSupervisor(loggedInUser, currentUserRole) || loggedInUser === rowTeacher);
                    
                    if (canDownload) {
                        const lessonBtn = document.createElement('button');
                        lessonBtn.innerHTML = '<i class="fas fa-file-download"></i>';
                        lessonBtn.title = 'Télécharger Plan de Leçon';
                        lessonBtn.classList.add('lesson-plan-button');
                        lessonBtn.style.marginLeft = '5px';
                        lessonBtn.onclick = () => downloadLessonPlan(rowObj);
                        actTd.appendChild(lessonBtn);
                    }
                }
                tr.appendChild(actTd);
                if (updK && tHead && tHead.querySelector('.updated-at-column')) {
                    const updTd = document.createElement('td');
                    updTd.classList.add('updated-at-column');
                    const updContent = rowObj && rowObj.hasOwnProperty(updK) ? (rowObj[updK] ?? '') : '';
                    updTd.textContent = formatUpdatedAt(updContent);
                    tr.appendChild(updTd);
                }
                tBody.appendChild(tr);
            });
            makeTableColumnsResizable();
        }
        
        async function generateAILessonPlan(rowData, tableRowElement) {
            if (!rowData || typeof rowData !== 'object') {
                displayAlert('invalid_row', true);
                return;
            }
            if (!currentWeek) {
                displayAlert("please_select_week", true);
                return;
            }
            
            console.log("Generating AI Lesson Plan for:", rowData);
            displayAlert('generating_ai_lesson_plan', false);
            
            const aiButton = tableRowElement?.querySelector('.ai-lesson-plan-button');
            let originalButtonHtml = '';
            let originalButtonDisabledState = false;
            
            if (aiButton) {
                originalButtonHtml = aiButton.innerHTML;
                originalButtonDisabledState = aiButton.disabled;
                aiButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                aiButton.disabled = true;
            }
            
            try {
                const response = await fetch('/api/generate-ai-lesson-plan', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ week: currentWeek, rowData: rowData })
                });
                
                if (response.ok) {
                    const blob = await response.blob();
                    const contentDisposition = response.headers.get('content-disposition');
                    let filename = `plan_lecon_S${currentWeek}_AI_genere.docx`;
                    
                    if (contentDisposition) {
                        const filenameMatch = contentDisposition.match(/filename="?(.+?)"?(;|$)/i);
                        if (filenameMatch && filenameMatch[1]) {
                            filename = filenameMatch[1];
                        }
                    }
                    
                    saveAs(blob, filename);
                    displayAlert('ai_lesson_plan_generated', false);
                    
                    // Mettre à jour le bouton disquette en VERT (plan généré)
                    if (aiButton) {
                        aiButton.classList.add('lesson-plan-exists');
                        aiButton.title = 'Plan de Leçon déjà généré - Régénérer';
                    }
                    
                    // Marquer dans rowData qu'un plan existe (pour réaffichage)
                    if (rowData) {
                        rowData.lessonPlanId = 'generated';
                    }
                } else {
                    const errorResult = await response.json().catch(() => ({ message: "Erreur inconnue du serveur." }));
                    throw new Error(errorResult.message || `Erreur serveur ${response.status}`);
                }
            } catch (error) {
                console.error('Error generating AI lesson plan:', error);
                // Détecter si c'est une erreur de quota épuisé
                if (error.message && (error.message.includes('QUOTA') || error.message.includes('429') || error.message.includes('Limite') || error.message.includes('quota'))) {
                    displayAlert('quota_exceeded', true);
                } else {
                    displayAlert('error_generating_ai_lesson_plan', true, { error: error.message });
                }
            } finally {
                if (aiButton) {
                    aiButton.innerHTML = originalButtonHtml;
                    aiButton.disabled = originalButtonDisabledState;
                }
            }
        }
        
        // ==================== GÉNÉRATION PLANS DE LEÇON IA ====================
        


        // Fonction pour générer tous les plans de leçon des lignes affichées dans le tableau
        async function generateAllDisplayedLessonPlans() {
            if (!currentWeek) {
                displayAlert("Veuillez d'abord sélectionner une semaine.", true);
                return;
            }
            if (!filteredAndSortedData || filteredAndSortedData.length === 0) {
                displayAlert("Aucune donnée à afficher. Utilisez les filtres pour afficher des données.", true);
                return;
            }
            
            const confirmation = confirm(`Générer ${filteredAndSortedData.length} plan(s) de leçon IA pour les leçons affichées ?\n\nSemaine: ${currentWeek}\nTemps estimé: ~${filteredAndSortedData.length * 5} secondes\n\nUn fichier ZIP sera téléchargé automatiquement.`);
            if (!confirmation) {
                return;
            }
            
            console.log(`Génération de ${filteredAndSortedData.length} plans de leçon IA pour la semaine ${currentWeek}`);
            displayAlert(`🤖 Génération de ${filteredAndSortedData.length} plans de leçon IA en cours... Veuillez patienter.`, false);
            
            const btn = document.getElementById('generateAllDisplayedPlansBtn');
            const originalHTML = btn ? btn.innerHTML : '';
            if (btn) {
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span class="btn-text">Génération...</span>';
                btn.disabled = true;
            }
            
            showProgressBar();
            updateProgressBar(10);
            
            try {
                const response = await fetch('/api/generate-multiple-ai-lesson-plans', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        week: currentWeek,
                        rowsData: filteredAndSortedData
                    })
                });
                
                updateProgressBar(80);
                
                if (response.ok) {
                    const blob = await response.blob();
                    const contentDisposition = response.headers.get('content-disposition');
                    let filename = `Plans_Lecon_IA_S${currentWeek}_${filteredAndSortedData.length}_fichiers.zip`;
                    
                    if (contentDisposition) {
                        const filenameMatch = contentDisposition.match(/filename="?(.+?)"?(;|$)/i);
                        if (filenameMatch && filenameMatch[1]) {
                            filename = filenameMatch[1];
                        }
                    }
                    
                    // Télécharger le ZIP automatiquement
                    if (typeof saveAs === 'function') {
                        saveAs(blob, filename);
                    } else {
                        const link = document.createElement('a');
                        link.href = window.URL.createObjectURL(blob);
                        link.download = filename;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        window.URL.revokeObjectURL(link.href);
                    }
                    
                    updateProgressBar(100);
                    displayAlert(`✅ ${filteredAndSortedData.length} plans de leçon IA générés avec succès!\n\nFichier: ${filename}\n\nOuvrez le ZIP pour voir tous vos plans de leçon Word.`, false);
                } else {
                    const errorResult = await response.json().catch(() => ({ message: "Erreur inconnue du serveur." }));
                    throw new Error(errorResult.message || `Erreur serveur ${response.status}`);
                }
            } catch (error) {
                console.error("Erreur lors de la génération des plans de leçon IA:", error);
                displayAlert(`❌ Erreur lors de la génération: ${error.message}`, true);
                updateProgressBar(0);
            } finally {
                hideProgressBar();
                if (btn) {
                    btn.innerHTML = originalHTML;
                    btn.disabled = false;
                    updateActionButtonsState(filteredAndSortedData.length > 0);
                }
            }
        }
        
        async function generateWeeklyLessonPlans() { if (!currentWeek) { displayAlert("please_select_week", true); return; } if (!filteredAndSortedData || filteredAndSortedData.length === 0) { displayAlert("no_data_to_display_filters", true); return; } const confirmation = confirm(t("Voulez-vous générer les plans de leçons pour toutes les données affichées de la semaine " + currentWeek + " ?")); if (!confirmation) return; console.log("Generating Weekly Lesson Plans for week:", currentWeek); displayAlert("generating_weekly_lessons", false); setButtonLoading("generateWeeklyLessonsBtn", true, "fas fa-robot"); showProgressBar(); updateProgressBar(10); try { const response = await fetch("/api/generate-weekly-lesson-plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ week: currentWeek, data: filteredAndSortedData }) }); updateProgressBar(80); if (response.ok) { const blob = await response.blob(); const contentDisposition = response.headers.get("content-disposition"); let filename = `plans_lecons_semaine_${currentWeek}.zip`; if (contentDisposition) { const filenameMatch = contentDisposition.match(/filename="?(.+?)"?(;|$)/i); if (filenameMatch && filenameMatch[1]) { filename = filenameMatch[1]; } } saveAs(blob, filename); updateProgressBar(100); displayAlert("weekly_lessons_generated", false); } else { const errorResult = await response.json().catch(() => ({ message: "Erreur inconnue du serveur." })); throw new Error(errorResult.message || `Erreur serveur ${response.status}`); } } catch (error) { console.error("Error generating weekly lesson plans:", error); displayAlert("error_generating_ai_lesson_plan", true, { error: error.message }); updateProgressBar(0); } finally { hideProgressBar(); setButtonLoading("generateWeeklyLessonsBtn", false, "fas fa-robot"); } }
        function updateActionButtonsState(isEnabled) { document.getElementById('generateWordBtn').disabled = !isEnabled; document.getElementById('generateExcelBtn').disabled = !isEnabled; const saveAllBtn = document.getElementById('saveAllDisplayedBtn'); if (saveAllBtn) { saveAllBtn.disabled = !isEnabled || !filteredAndSortedData || filteredAndSortedData.length === 0; } const generateAllDisplayedPlansBtn = document.getElementById('generateAllDisplayedPlansBtn'); if (generateAllDisplayedPlansBtn) { generateAllDisplayedPlansBtn.disabled = !isEnabled || !filteredAndSortedData || filteredAndSortedData.length === 0; generateAllDisplayedPlansBtn.style.display = ''; } }
        async function saveRow(rowData, tableRowElement) { 
            if(!rowData||typeof rowData!=='object'){displayAlert('invalid_row',true); return;} 
            console.log("saveRow:",JSON.stringify(rowData).substring(0,100)+'...'); 
            displayAlert(''); 
            const btn=tableRowElement?.querySelector('.save-row-button'); 
            const indicator=tableRowElement?.querySelector('.save-indicator'); 
            const origBtnIcon = btn ? btn.querySelector('i')?.className || 'fas fa-check' : 'fas fa-check'; 
            if(indicator) indicator.style.display='none'; 
            if(btn){btn.innerHTML='<i class="fas fa-spinner fa-spin"></i>'; btn.disabled=true;} 
            try{ 
                if(!currentWeek){throw new Error(t('please_select_week'));} 
                const response=await fetch('/api/save-row',{
                    method:'POST',
                    headers:{'Content-Type':'application/json'},
                    body:JSON.stringify({
                        week:currentWeek,
                        data:rowData,
                        originalData: rowData._originalCopy || null,
                        section:currentSection
                    })
                }); 
                const result=await response.json(); 
                if(!response.ok){throw new Error(result.message||`Erreur ${response.status}`);} 
                rowData._originalCopy = { ...rowData };
                if(tableRowElement){tableRowElement.classList.remove('modified');} 
                if(indicator) indicator.style.display='inline-block'; 
                if(result.updatedData?.updatedAt&&tableRowElement){ 
                    const updK=findHKey('updatedAt'); 
                    if(updK){ 
                        rowData[updK]=result.updatedData.updatedAt; 
                        const updCell=tableRowElement.querySelector('.updated-at-column'); 
                        if(updCell){updCell.textContent=formatUpdatedAt(result.updatedData.updatedAt);} 
                    } 
                } 
            } catch(e){ 
                console.error('Erreur saveRow:',e); 
                displayAlert('error_saving_row', true, { error: e.message }); 
                if(indicator) indicator.style.display='none'; 
            } finally{
                if(btn){btn.innerHTML=`<i class="${origBtnIcon}"></i>`; btn.disabled=false;} 
                checkAndDisplayIncompleteTeachers();
            } 
        }
        async function saveAllDisplayedRows() { 
            if (!filteredAndSortedData || filteredAndSortedData.length === 0) { displayAlert('no_rows_to_save', true); return; } 
            if (!currentWeek) { displayAlert("please_select_week", true); return; } 
            const totalRows = filteredAndSortedData.length; 
            const confirmation = confirm(t('confirm_save_all', { count: totalRows, week: currentWeek })); 
            if (!confirmation) { displayAlert('save_all_cancelled', false); return; } 
            displayAlert('saving_all_displayed', false, { count: totalRows }); 
            setButtonLoading('saveAllDisplayedBtn', true, 'fas fa-save'); 
            showProgressBar(); 
            updateProgressBar(0); 
            let successCount = 0; 
            let errorCount = 0; 
            const tableBody = document.querySelector('#planTable tbody'); 
            for (let i = 0; i < totalRows; i++) { 
                const rowData = filteredAndSortedData[i]; 
                const rowIndex = i; 
                updateProgressBar(Math.round(((i + 1) / totalRows) * 95)); 
                try { 
                    const response = await fetch('/api/save-row', { 
                        method: 'POST', 
                        headers: { 'Content-Type': 'application/json' }, 
                        body: JSON.stringify({ 
                            week: currentWeek, 
                            data: rowData, 
                            originalData: rowData._originalCopy || null,
                            section: currentSection 
                        }) 
                    }); 
                    const result = await response.json(); 
                    if (!response.ok) { throw new Error(result.message || `Erreur ${response.status} L${rowIndex + 1}`); } 
                    rowData._originalCopy = { ...rowData };
                    successCount++; 
                    const tr = tableBody?.querySelector(`tr[data-row-index="${rowIndex}"]`); 
                    if (tr) { 
                        tr.classList.remove('modified'); 
                        const indicator = tr.querySelector('.save-indicator'); 
                        if (indicator) indicator.style.display = 'inline-block'; 
                        if (result.updatedData?.updatedAt) { 
                            const updK = findHKey('updatedAt'); 
                            if (updK) { 
                                rowData[updK] = result.updatedData.updatedAt; 
                                const updCell = tr.querySelector('.updated-at-column'); 
                                if (updCell) updCell.textContent = formatUpdatedAt(result.updatedData.updatedAt); 
                            } 
                        } 
                    } 
                } catch (error) { 
                    console.error(`Err L${rowIndex + 1}:`, error); 
                    errorCount++; 
                    const tr = tableBody?.querySelector(`tr[data-row-index="${rowIndex}"]`); 
                    if(tr) { 
                        tr.style.backgroundColor = '#f8d7da'; 
                        tr.classList.add('modified'); 
                        const indicator = tr.querySelector('.save-indicator'); 
                        if(indicator) indicator.style.display = 'none'; 
                    } 
                } 
            } 
            updateProgressBar(100); 
            hideProgressBar(); 
            setButtonLoading('saveAllDisplayedBtn', false, 'fas fa-save'); 
            if (errorCount === 0) { displayAlert('save_all_success', false, { count: successCount }); } 
            else { displayAlert('save_all_partial', true, { success: successCount, error: errorCount }); } 
            checkAndDisplayIncompleteTeachers(); 
        }
        async function generateWordByClasse() { const dataGen = filteredAndSortedData; if(!dataGen || dataGen.length === 0){ displayAlert("no_data_to_display_filters", true); return; } if(!currentWeek){displayAlert("please_select_week",true); return;} setButtonLoading('generateWordBtn', true, 'fas fa-file-word'); const dataCls = {}; const clsK = findHKey('Classe'); if (!clsK) { displayAlert("error_config_columns", true); setButtonLoading('generateWordBtn', false, 'fas fa-file-word'); return; } dataGen.forEach(i => { if (!i || !i[clsK]) return; const cl = i[clsK]; if (!dataCls[cl]) { dataCls[cl] = []; } dataCls[cl].push(i); }); const clsGen = Object.keys(dataCls); if (clsGen.length === 0) { displayAlert("no_data", true); setButtonLoading('generateWordBtn', false, 'fas fa-file-word'); return; } displayAlert('generating_word', false, { count: clsGen.length }); showProgressBar(); updateProgressBar(0); let ok = 0, err = 0; const total = clsGen.length; for (let i = 0; i < total; i++) { const cl = clsGen[i]; const clData = dataCls[cl]; const clNote = weeklyClassNotes[cl] || ""; updateProgressBar(Math.round(((i + 1) / total) * 100)); try { const payload = { week: currentWeek, classe: cl, data: clData, notes: clNote }; const r = await fetch('/api/generate-word', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); if (r.ok) { const blob = await r.blob(); const cd = r.headers.get('content-disposition'); let filename = `plan_s${currentWeek}_${cl.replace(/[^a-z0-9]/gi, '_')}.docx`; if (cd) { const m = cd.match(/filename="?(.+?)"?(;|$)/i); if (m && m[1]) filename = m[1]; } if (typeof saveAs === 'function') { try { saveAs(blob, filename); ok++; } catch (e) { err++; console.error(`SaveAs ${cl}:`, e); displayAlert(t('error', {error: `Err sauvegarde ${cl}: ${e.message}`}), true); } } else { err++; console.error("saveAs non défini!"); displayAlert(t('error', {error: "saveAs non trouvé."}), true); break; } } else { const d = await r.json().catch(() => ({ message: `Erreur ${r.status}` })); console.error(`Err Word ${cl}:`, r.status, d); if (d.message && d.message.includes('Dates non trouvées côté serveur')) { displayAlert('no_word_dates', true, {week: currentWeek}); err++; } else { displayAlert('error_generating_word_for', true, {classe: cl, error: (d.message || 'Inconnue')}); err++; } } } catch (e) { err++; console.error(`Err Fetch Word ${cl}:`, e); displayAlert('error', true, { error: `Erreur réseau Word ${cl}: ${e.message}` }); } } hideProgressBar(); setButtonLoading('generateWordBtn', false, 'fas fa-file-word'); if (ok > 0 && err === 0) { displayAlert('generating_word_success', false, { count: ok }); } else if (ok > 0 && err > 0) { displayAlert('generating_word_partial', true, { ok: ok, err: err }); } else if (ok === 0 && err > 0) { if (err > 1) { displayAlert('generating_word_failed', true, {err: err}); } } else if (ok === 0 && err === 0) { displayAlert("no_data", true); } }
        async function generateExcelWorkbook() {
            if (!currentWeek) { displayAlert("please_select_week", true); return; }
            const section = currentSection || 'garcons';
            const selClass = document.getElementById('filterClasse')?.value || '';

            setButtonLoading('generateExcelBtn', true, 'fas fa-file-excel');
            displayAlert('generating_excel', false, { week: currentWeek });
            showProgressBar();
            updateProgressBar(10);
            let err = 0;
            try {
                const payload = {
                    week: Number(currentWeek),
                    section: section,
                    classe: selClass || undefined,
                    data: (filteredAndSortedData && filteredAndSortedData.length > 0) ? filteredAndSortedData : undefined,
                    notes: weeklyClassNotes
                };
                const r = await fetch('/api/generate-excel-workbook', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                updateProgressBar(70);
                if (r.ok) {
                    const blob = await r.blob();
                    const cd = r.headers.get('content-disposition');
                    let filename = `Plan_Hebdomadaire_S${currentWeek}_${section}${selClass ? '_' + selClass : '_Complet'}.xlsx`;
                    if (cd) {
                        const m = cd.match(/filename="?(.+?)"?(;|$)/i);
                        if (m && m[1]) filename = m[1];
                    }
                    if (typeof saveAs === 'function') {
                        try {
                            saveAs(blob, filename);
                            updateProgressBar(100);
                            displayAlert('generating_excel_success', false, { filename: filename });
                        } catch (e) {
                            err++;
                            console.error(`SaveAs Excel:`, e);
                            displayAlert(t('error', { error: `Err sauvegarde Excel: ${e.message}` }), true);
                            updateProgressBar(0);
                        }
                    } else {
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.style.display = 'none';
                        a.href = url;
                        a.download = filename;
                        document.body.appendChild(a);
                        a.click();
                        window.URL.revokeObjectURL(url);
                        document.body.removeChild(a);
                        updateProgressBar(100);
                        displayAlert('generating_excel_success', false, { filename: filename });
                    }
                } else {
                    const d = await r.json().catch(() => ({ message: `Err ${r.status}` }));
                    console.error(`Err Excel Wb:`, r.status, d);
                    displayAlert('error_generating_excel', true, { error: (d.message || 'Inconnue') });
                    updateProgressBar(0);
                    err++;
                }
            } catch (e) {
                err++;
                console.error(`Err Fetch Excel Wb:`, e);
                displayAlert('error', { error: `Err réseau Excel: ${e.message}` }, true);
                updateProgressBar(0);
            } finally {
                hideProgressBar();
                setButtonLoading('generateExcelBtn', false, 'fas fa-file-excel');
            }
        }
        async function loadPlanForWeek() { const sel = document.getElementById('weekSelector'); if (sel) { const wk = sel.value; if (wk) { await fetchPlanData(wk); } else { currentWeek = null; planData = []; headers = []; weeklyClassNotes = {}; filteredAndSortedData = []; createTableHeader(); displayPlanTable([]); document.getElementById('weekDateRange').textContent = ""; updateActionButtonsState(false); populateFilterOptions(); populateNotesClassSelector(); checkAndDisplayIncompleteTeachers(); displayAlert(''); } } else { console.error("#weekSelector absent"); displayAlert("error_structure", true); } }
        function applyLanguageSettings() { console.log(`Applying language: ${currentUserLanguage}`); document.documentElement.lang = currentUserLanguage; document.body.dir = (currentUserLanguage === 'ar') ? 'rtl' : 'ltr'; updateStaticUIElements(); if (currentWeek) { updateDynamicUIElements(); } else { document.getElementById('weekDateRange').textContent = ""; const initialTableMsg = document.getElementById('initial-table-message'); if (initialTableMsg) { initialTableMsg.textContent = t('select_week_to_display'); } else { const tBody = document.querySelector('#planTable tbody'); const colspanVal = document.querySelector('#planTable thead tr')?.querySelectorAll('th').length || 10; if (tBody) { tBody.innerHTML = `<tr id="initial-table-row"><td colspan="${colspanVal}" class="table-message">${t('select_week_to_display')}</td></tr>`; } } } if (document.getElementById('login-form').style.display !== 'none') { updateLoginUIElements(); } }
        function updateStaticUIElements() { console.log("Updating static UI for lang:", currentUserLanguage); if (document.getElementById('main-content').style.display !== 'none') { document.title = t('main_page_title'); } else { document.title = t('login_title'); } updateLoginUIElements(); const mainTitle = document.getElementById('main-title'); if(mainTitle) mainTitle.textContent = t('main_page_title'); const logoutBtnText = document.querySelector('#logout-button .btn-text'); if(logoutBtnText) logoutBtnText.textContent = t('logout_button'); const toggleBtn = document.getElementById('toggleIncompleteBtn'); if (toggleBtn) { const btnTextSpan = toggleBtn.querySelector('.btn-text'); const listDiv=document.getElementById('incompleteTeachersDisplay'); if (btnTextSpan) { btnTextSpan.textContent = (listDiv && listDiv.style.display !== 'none') ? t('hide_incomplete') : t('display_incomplete'); } } const incompleteH4 = document.querySelector('#incompleteTeachersDisplay h4'); if(incompleteH4) incompleteH4.textContent = t('incomplete_teachers_title'); const incompleteLi = document.querySelector('#incompleteList li'); if(incompleteLi && incompleteLi.textContent.match(/(Chargement|Loading|جاري التحميل)/)) incompleteLi.textContent = t('loading'); const weekLabel = document.querySelector('label[for="weekSelector"]'); if(weekLabel) weekLabel.innerHTML = `<i class="fas fa-calendar-week"></i> ${t('week_label')}`; const adminTitle = document.getElementById('admin-title'); if(adminTitle) adminTitle.textContent = t('admin_actions_title'); const adminExcelLabel = document.getElementById('admin-excel-label'); if(adminExcelLabel) adminExcelLabel.innerHTML = `<i class="fas fa-file-excel"></i> ${t('admin_excel_label')}`; const saveUploadedDataBtnText = document.querySelector('#saveUploadedDataBtn .btn-text'); if(saveUploadedDataBtnText) saveUploadedDataBtnText.textContent = t('admin_save_button'); const genWordBtnText = document.querySelector('#generateWordBtn .btn-text'); if(genWordBtnText) genWordBtnText.textContent = t('generate_word_button'); const genExcelBtnText = document.querySelector('#generateExcelBtn .btn-text'); if(genExcelBtnText) genExcelBtnText.textContent = t('generate_excel_button'); const saveAllBtnText = document.querySelector('#saveAllDisplayedBtn .btn-text'); if(saveAllBtnText) saveAllBtnText.textContent = t('save_all_button'); const weeklyLessonsBtnText = document.querySelector('#generateWeeklyLessonsBtn .btn-text'); if(weeklyLessonsBtnText) weeklyLessonsBtnText.textContent = t('generate_weekly_lessons_button'); const filterEnsLabel = document.getElementById('filter-enseignant-label'); if(filterEnsLabel) filterEnsLabel.innerHTML = `<i class="fas fa-user-tie"></i> ${t('filter_teacher_label')}`; const filterClsLabel = document.getElementById('filter-classe-label'); if(filterClsLabel) filterClsLabel.innerHTML = `<i class="fas fa-chalkboard-user"></i> ${t('filter_class_label')}`; const filterMatLabel = document.getElementById('filter-matiere-label'); if(filterMatLabel) filterMatLabel.innerHTML = `<i class="fas fa-book"></i> ${t('filter_material_label')}`; const filterPerLabel = document.getElementById('filter-periode-label'); if(filterPerLabel) filterPerLabel.innerHTML = `<i class="fas fa-clock"></i> ${t('filter_period_label')}`; const filterJourLabel = document.getElementById('filter-jour-label'); if(filterJourLabel) filterJourLabel.innerHTML = `<i class="fas fa-calendar-day"></i> ${t('filter_day_label')}`; const notesClsLabel = document.getElementById('notes-class-label'); if(notesClsLabel) notesClsLabel.innerHTML = `<i class="fas fa-sticky-note"></i> ${t('notes_for_class')}`; const notesInput = document.getElementById('notesInput'); if(notesInput && notesInput.placeholder.match(/(Sélectionnez|اختر|Select)/)){ notesInput.placeholder = t('select_class_placeholder'); } const saveNotesBtnText = document.querySelector('#saveNotesBtn .btn-text'); if(saveNotesBtnText) saveNotesBtnText.textContent = t('save_notes_button'); updateFilterOptionDefaultTexts(); const adminReportLabel = document.getElementById('admin-report-class-label'); if (adminReportLabel) adminReportLabel.innerHTML = `<i class="fas fa-school"></i> ${t('admin_report_class_label')}`; const adminReportBtnText = document.querySelector('#generateFullReportBtn .btn-text'); if (adminReportBtnText) adminReportBtnText.textContent = t('generate_full_report_button'); }
        function updateLoginUIElements() { const loginH1 = document.querySelector('#login-form h1'); if(loginH1) loginH1.textContent = t('login_title'); const userLabel = document.querySelector('label[for="username"]'); if(userLabel) userLabel.textContent = t('login_username_label'); const passLabel = document.querySelector('label[for="password"]'); if(passLabel) passLabel.textContent = t('login_password_label'); const rememberLabel = document.getElementById('remember-me-label'); if(rememberLabel) rememberLabel.textContent = t('remember_me'); const loginBtnText = document.querySelector('#login-button .btn-text'); if(loginBtnText) loginBtnText.textContent = t('login_button_text'); if (document.getElementById('login-form').style.display !== 'none') { document.title = t('login_title'); } }
        function updateDynamicUIElements() { console.log("Updating dynamic UI for lang:", currentUserLanguage); const dateRangeEl=document.getElementById('weekDateRange'); const weekNum = parseInt(currentWeek, 10); const dates = specificWeekDateRanges[weekNum]; if(weekStartDate && dates?.end){ const s = weekStartDate; const e = new Date(dates.end+'T00:00:00Z'); if(!isNaN(s.getTime())&&!isNaN(e.getTime())){ dateRangeEl.textContent = `${t('week_label')} ${currentWeek} : ${isArabicUser() ? 'من' : (currentUserLanguage === 'en' ? 'From' : 'Du')} ${formatDateForDisplay(s)} ${isArabicUser() ? 'إلى' : (currentUserLanguage === 'en' ? 'to' : 'à')} ${formatDateForDisplay(e)}`; } else { dateRangeEl.textContent=`${t('week_label')} ${currentWeek} (Err dates)`; } } else { dateRangeEl.textContent=`${t('week_label')} ${currentWeek} (${t('no_data')}: dates non définies)`; } createTableHeader(); displayPlanTable(filteredAndSortedData); const notesInput = document.getElementById('notesInput'); const notesClassSel = document.getElementById('notesClassSelector'); if (notesInput && notesClassSel) { if (notesClassSel.value) { const selText = notesClassSel.options[notesClassSel.selectedIndex].text; notesInput.placeholder = t('notes_placeholder', { classText: selText }); } else { notesInput.placeholder = t('select_class_placeholder'); } } }

        function switchAdminTab(tabName) {
            const tabs = ['upload', 'teachers', 'calendar', 'students', 'reports', 'messages', 'publication', 'special_days'];
            tabs.forEach(t => {
                const contentEl = document.getElementById(`adminTab_${t}`);
                const btnEl = document.getElementById(`tabBtn_${t}`);
                if (contentEl) contentEl.style.display = (t === tabName) ? 'block' : 'none';
                if (btnEl) btnEl.classList.toggle('active', t === tabName);
            });
            if (tabName === 'teachers') {
                loadAdminUsersList();
            } else if (tabName === 'calendar') {
                populateAdminWeekSelectToEdit();
                renderAdminWeeksTable();
            } else if (tabName === 'students') {
                if (typeof loadAdminStudentsList === 'function') loadAdminStudentsList();
            } else if (tabName === 'reports') {
                populateAdminReportClassSelector();
            } else if (tabName === 'upload') {
                populateAdminUploadWeekSelector();
            } else if (tabName === 'messages') {
                if (typeof loadAdminAllMessages === 'function') loadAdminAllMessages();
            } else if (tabName === 'publication') {
                if (typeof loadAdminPublicationStatus === 'function') loadAdminPublicationStatus();
            } else if (tabName === 'special_days') {
                if (typeof populateAdminSpecialDaysForm === 'function') populateAdminSpecialDaysForm();
                if (typeof loadAdminSpecialDaysList === 'function') loadAdminSpecialDaysList();
            }
        }

        function initializeApp(username, customLang, role, tableTeacherName) {
            loggedInUser = username;
            if (typeof tableTeacherName !== 'undefined') {
                loggedInTeacherTable = tableTeacherName || '';
                localStorage.setItem('tableTeacherName', loggedInTeacherTable);
            } else {
                loggedInTeacherTable = localStorage.getItem('tableTeacherName') || '';
            }
            currentUserRole = role || localStorage.getItem('userRole') || (username === 'Med01' ? 'admin' : (username === 'Racha' ? 'supervisor' : 'teacher'));
            localStorage.setItem('userRole', currentUserRole);
            
            if (customLang && ['fr', 'ar', 'en'].includes(customLang)) {
                currentUserLanguage = customLang;
            } else {
                const storedLang = localStorage.getItem('userLanguage');
                if (storedLang && ['fr', 'ar', 'en'].includes(storedLang)) {
                    currentUserLanguage = storedLang;
                } else if (arabicTeachers.includes(loggedInUser)) {
                    currentUserLanguage = 'ar';
                } else if (englishTeachers.includes(loggedInUser)) {
                    currentUserLanguage = 'en';
                } else {
                    currentUserLanguage = 'fr';
                }
            }
            
            if (isDualSectionTeacher(loggedInUser)) {
                if (currentSection !== 'filles' && currentSection !== 'primaire') {
                    currentSection = 'filles';
                    localStorage.setItem('selectedSection', 'filles');
                    localStorage.setItem('currentSection', 'filles');
                }
            }

            console.log(`Initialisation pour ${loggedInUser} (Role: ${currentUserRole}, Section: ${currentSection}, Lang: ${currentUserLanguage})`);
            
            // Mode enseignant/admin actif (verrouillage de la section choisie et restriction espace parent)
            applyParentUIMode(false);
            
            const sectionSel = document.getElementById('section-selection');
            if (sectionSel) sectionSel.style.display = 'none';
            document.getElementById('login-form').style.display = 'none';
            document.getElementById('main-content').style.display = 'block';
            
            updateSectionBadges();
            updateDualTeacherSectionButtons();
            applyLanguageSettings();
            
            const roleBadge = currentUserRole === 'admin' ? ' [Administrateur Principal]' : (currentUserRole === 'supervisor' ? ' [Superviseur Direction]' : '');
            document.getElementById('loggedInUserInfo').textContent = t('connected_as', { user: loggedInUser }) + roleBadge;
            
            const isAdminUser = (currentUserRole === 'admin' || loggedInUser === 'Med01');
            const isSupervisorUser = (currentUserRole === 'supervisor' || loggedInUser === 'Racha');
            const hasAdminAccess = isAdminUser || isSupervisorUser;

            if (hasAdminAccess) { 
                const adminActionsEl = document.getElementById('admin-actions');
                if (adminActionsEl) adminActionsEl.style.display = 'block';

                const tabUpload = document.getElementById('tabBtn_upload');
                const tabTeachers = document.getElementById('tabBtn_teachers');
                const tabCalendar = document.getElementById('tabBtn_calendar');
                const tabStudents = document.getElementById('tabBtn_students');
                const tabReports = document.getElementById('tabBtn_reports');
                const tabMessages = document.getElementById('tabBtn_messages');
                const tabPublication = document.getElementById('tabBtn_publication');

                if (isSupervisorUser && !isAdminUser) {
                    // Masquer pour Racha les 5 boutons spécifiés
                    if (tabUpload) tabUpload.style.display = 'none';
                    if (tabTeachers) tabTeachers.style.display = 'none';
                    if (tabCalendar) tabCalendar.style.display = 'none';
                    if (tabStudents) tabStudents.style.display = 'none';
                    if (tabReports) tabReports.style.display = 'none';
                    if (tabMessages) tabMessages.style.display = 'inline-flex';
                    if (tabPublication) tabPublication.style.display = 'inline-flex';

                    switchAdminTab('messages');
                } else {
                    // Admin Med01 voit l'ensemble des 7 onglets
                    if (tabUpload) tabUpload.style.display = 'inline-flex';
                    if (tabTeachers) tabTeachers.style.display = 'inline-flex';
                    if (tabCalendar) tabCalendar.style.display = 'inline-flex';
                    if (tabStudents) tabStudents.style.display = 'inline-flex';
                    if (tabReports) tabReports.style.display = 'inline-flex';
                    if (tabMessages) tabMessages.style.display = 'inline-flex';
                    if (tabPublication) tabPublication.style.display = 'inline-flex';

                    populateAdminUploadWeekSelector();
                    switchAdminTab('upload');
                }

                const lessonPlanGen = document.getElementById('lesson-plan-generator');
                if (lessonPlanGen) lessonPlanGen.style.display = isAdminUser ? 'flex' : 'none';
            } else {
                const adminActionsEl = document.getElementById('admin-actions');
                if (adminActionsEl) adminActionsEl.style.display = 'none';
                const lessonPlanGen = document.getElementById('lesson-plan-generator');
                if (lessonPlanGen) lessonPlanGen.style.display = 'none';
            }
            
            currentWeek = null;
            planData = [];
            headers = [];
            weeklyClassNotes = {};
            filteredAndSortedData = [];
            document.getElementById('weekSelector').value = "";
            
            createTableHeader();
            displayPlanTable([]);
            populateFilterOptions();
            populateNotesClassSelector();
            checkAndDisplayIncompleteTeachers();
            updateActionButtonsState(false);
            
            displayAlert('welcome_user', false, { user: loggedInUser });
            
            // Charger automatiquement la SEMAINE PROCHAINE par défaut pour les enseignants (pour qu'ils préparent les cours à l'avance)
            const defaultWeekNum = getTeacherDefaultWeekNumber();
            if (defaultWeekNum) {
                const weekToLoad = defaultWeekNum;
                
                console.log(`📅 Espace Enseignant - Semaine par défaut (Semaine prochaine): Semaine ${weekToLoad} (L'enseignant peut toujours changer de semaine)`);
                document.getElementById('weekSelector').value = weekToLoad;
                setTimeout(async () => {
                    await loadPlanForWeek();
                    if (Object.keys(incompleteTeachersInfo).length > 0) {
                        const listDiv = document.getElementById('incompleteTeachersDisplay');
                        const btn = document.getElementById('toggleIncompleteBtn');
                        if (listDiv && btn) {
                            listDiv.style.display = 'block';
                            btn.querySelector('i').className = 'fas fa-xmark';
                            const btnTextSpan = btn.querySelector('.btn-text');
                            if (btnTextSpan) btnTextSpan.textContent = t('hide_incomplete');
                        }
                        displayAlert(`⚠️ Attention: ${Object.keys(incompleteTeachersInfo).length} enseignant(s) n'ont pas encore terminé leurs travaux de classe pour cette semaine!`, true);
                        await notifyIncompleteTeachers(weekToLoad, incompleteTeachersInfo);
                    }
                }, 500);
            }
            
            if (typeof window.NotificationManager !== 'undefined') {
                console.log('🔔 Initialisation des notifications push...');
                setTimeout(() => {
                    window.NotificationManager.initialize(loggedInUser).catch(err => {
                        console.error('❌ Erreur initialisation notifications:', err);
                    });
                }, 1000);
            }
        }
        
        async function handleLogin() {
            const usernameInput = document.getElementById('username');
            const passwordInput = document.getElementById('password');
            const loginButton = document.getElementById('login-button');
            const errorDiv = document.getElementById('login-error');
            const username = usernameInput.value.trim();
            const password = passwordInput.value;
            
            if (!username || !password) {
                errorDiv.textContent = "Entrez nom d'utilisateur et mot de passe.";
                errorDiv.style.display = 'block';
                return;
            }
            
            errorDiv.style.display = 'none';
            setButtonLoading('login-button', true, 'fas fa-sign-in-alt');
            
            try {
                console.log(`Tentative de connexion pour ${username} (Section: ${currentSection})`);
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000);
                
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password, section: currentSection }),
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                const result = await response.json();
                console.log("Réponse serveur:", response.status, result);
                
                if (response.ok && result.success) {
                    localStorage.setItem('loggedInUser', result.username);
                    localStorage.setItem('tableTeacherName', result.tableTeacherName || '');
                    loggedInTeacherTable = result.tableTeacherName || '';
                    localStorage.setItem('authVersion', AUTH_VERSION.toString());
                    if (result.role) {
                        localStorage.setItem('userRole', result.role);
                    }
                    if (result.language) {
                        localStorage.setItem('userLanguage', result.language);
                    }
                    if (result.section) {
                        currentSection = result.section;
                        localStorage.setItem('selectedSection', result.section);
                    }
                    initializeApp(result.username, result.language, result.role, result.tableTeacherName);
                } else {
                    errorDiv.textContent = result.message || "Échec connexion.";
                    errorDiv.style.display = 'block';
                    localStorage.removeItem('loggedInUser');
                    localStorage.removeItem('tableTeacherName');
                    loggedInTeacherTable = '';
                    localStorage.removeItem('userRole');
                }
            } catch (error) {
                console.error("Erreur connexion fetch:", error);
                
                if (error.name === 'AbortError') {
                    errorDiv.textContent = "Délai d'attente dépassé. Le serveur ne répond pas. Vérifiez votre connexion Internet ou contactez l'administrateur.";
                } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                    errorDiv.textContent = "Erreur réseau. Impossible de contacter le serveur. Vérifiez votre connexion Internet ou que le serveur est déployé correctement.";
                } else {
                    errorDiv.textContent = "Erreur communication serveur: " + error.message;
                }
                errorDiv.style.display = 'block';
            } finally {
                setButtonLoading('login-button', false, 'fas fa-sign-in-alt');
            }
        }

        function handleLogout() {
            console.log("Déconnexion par:", loggedInUser);
            localStorage.removeItem('loggedInUser');
            localStorage.removeItem('tableTeacherName');
            localStorage.removeItem('userRole');
            localStorage.removeItem('authVersion');
            localStorage.removeItem('userLanguage');
            
            loggedInUser = null;
            loggedInTeacherTable = '';
            currentUserRole = null;
            currentWeek = null;
            planData = [];
            headers = [];
            weeklyClassNotes = {};
            filteredAndSortedData = [];
            incompleteTeachersInfo = {};
            uploadedPlanData = null;
            
            document.getElementById('main-content').style.display = 'none';
            document.getElementById('login-form').style.display = 'none';
            const sectionSel = document.getElementById('section-selection');
            if (sectionSel) sectionSel.style.display = 'flex';
            
            document.getElementById('username').value = '';
            document.getElementById('password').value = '';
            document.getElementById('login-error').textContent = '';
            document.getElementById('login-error').style.display = 'none';
            
            currentUserLanguage = 'fr';
            applyLanguageSettings();
            displayAlert('');
            hideProgressBar();
            
            console.log("État appli réinitialisé après logout.");
        }

        // --- Fonctions Admin de Gestion des Onglets et Supervision ---
        function switchAdminTab(tabName) {
            const tabs = ['upload', 'teachers', 'calendar', 'students', 'reports', 'messages', 'publication'];
            tabs.forEach(t => {
                const contentEl = document.getElementById(`adminTab_${t}`);
                const btnEl = document.getElementById(`tabBtn_${t}`);
                if (contentEl) {
                    contentEl.style.display = (t === tabName) ? 'block' : 'none';
                }
                if (btnEl) {
                    if (t === tabName) {
                        btnEl.classList.add('active');
                    } else {
                        btnEl.classList.remove('active');
                    }
                }
            });

            if (tabName === 'teachers') {
                const filterEl = document.getElementById('adminSectionFilter');
                if (filterEl && (!filterEl.value || filterEl.value === '')) {
                    filterEl.value = currentSection || 'garcons';
                }
                loadAdminUsersList();
            } else if (tabName === 'calendar') {
                populateAdminWeekSelectToEdit();
                renderAdminWeeksTable();
            } else if (tabName === 'students') {
                if (typeof loadAdminStudentsList === 'function') loadAdminStudentsList();
            } else if (tabName === 'reports') {
                populateAdminReportClassSelector();
            } else if (tabName === 'upload') {
                populateAdminUploadWeekSelector();
            } else if (tabName === 'messages') {
                loadAdminAllMessages();
            } else if (tabName === 'publication') {
                loadAdminPublicationStatus();
            }
        }

        let allAdminUsersCache = [];

        async function loadAdminUsersList() {
            const filterEl = document.getElementById('adminSectionFilter');
            const targetSection = (filterEl && filterEl.value) ? filterEl.value : (currentSection || 'garcons');
            const container = document.getElementById('usersTableContainer');
            if (!container) return;
            
            container.innerHTML = '<p style="text-align:center; padding:15px;"><i class="fas fa-spinner fa-spin"></i> Chargement de la liste des enseignants...</p>';
            
            try {
                const response = await fetch(`/api/admin/users?section=${targetSection}`);
                if (!response.ok) throw new Error(`Erreur ${response.status}`);
                const users = await response.json();
                allAdminUsersCache = users || [];
                renderAdminUsersTable(allAdminUsersCache);
            } catch (err) {
                console.error("Erreur chargement utilisateurs:", err);
                container.innerHTML = `<p style="color:red; padding:15px; text-align:center;">Erreur: ${err.message}</p>`;
            }
        }

        function renderAdminUsersTable(users) {
            const container = document.getElementById('usersTableContainer');
            if (!container) return;

            if (!users || users.length === 0) {
                container.innerHTML = '<p class="table-message" style="text-align:center; padding:15px;">Aucun enseignant trouvé pour cette section.</p>';
                return;
            }
            
            const langLabels = {
                fr: { flag: '🇫🇷', label: 'Français', cls: 'lang-badge-fr' },
                ar: { flag: '🇸🇦', label: 'العربية', cls: 'lang-badge-ar' },
                en: { flag: '🇬🇧', label: 'English', cls: 'lang-badge-en' }
            };

            let html = `
                <table class="users-table">
                    <thead>
                        <tr>
                            <th>Nom d'utilisateur (Accès)</th>
                            <th>Nom de l'Enseignant (Tableau & Tri)</th>
                            <th>Mot de passe</th>
                            <th>Section</th>
                            <th>Langue par défaut</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            
            users.forEach(u => {
                const secLabel = u.section === 'garcons' ? '👦 Garçons' : (u.section === 'primaire' ? '👶🎒 Primaire' : '👧 Filles');
                const userLang = u.language || (arabicTeachers.includes(u.username) ? 'ar' : (englishTeachers.includes(u.username) ? 'en' : 'fr'));
                const langInfo = langLabels[userLang] || langLabels.fr;
                const safeUsername = (u.username || '').replace(/'/g, "\\'");
                const safeTableTeacher = (u.tableTeacherName || '').replace(/'/g, "\\'");
                const safePassword = (u.password || '').replace(/'/g, "\\'");
                
                const hasCustomTableTeacher = u.tableTeacherName && u.tableTeacherName.trim() !== '' && u.tableTeacherName.trim().toLowerCase() !== u.username.trim().toLowerCase();
                const tableTeacherBadge = hasCustomTableTeacher
                    ? `<span style="background:#EEF2FF; color:#3730A3; border:1px solid #C7D2FE; font-weight:700; padding:4px 9px; border-radius:6px; display:inline-flex; align-items:center; gap:5px;"><i class="fas fa-chalkboard-teacher" style="color:#4F46E5;"></i> ${escapeHtml(u.tableTeacherName)} <span style="font-size:0.72rem; background:#4F46E5; color:white; padding:1px 5px; border-radius:4px; margin-left:3px;">Tableau</span></span>`
                    : `<span style="color:#475569; font-size:0.88rem; display:inline-flex; align-items:center; gap:4px;"><i class="fas fa-check-circle" style="color:#10B981;"></i> ${escapeHtml(u.username)} <span style="color:#64748B; font-size:0.75rem;">(Même nom)</span></span>`;
                
                html += `
                    <tr>
                        <td><strong><i class="fas fa-id-badge" style="color:#2563EB; margin-right:6px;"></i>${escapeHtml(u.username)}</strong></td>
                        <td>${tableTeacherBadge}</td>
                        <td><code style="background:#F1F5F9; padding:3px 8px; border-radius:6px; font-weight:700; color:#0F172A;">${escapeHtml(u.password || 'Non défini')}</code></td>
                        <td><span style="font-weight:600;">${secLabel}</span></td>
                        <td>
                            <span class="lang-badge ${langInfo.cls}">
                                ${langInfo.flag} ${langInfo.label}
                            </span>
                        </td>
                        <td>
                            <button type="button" class="pro-button primary-button" onclick="adminEditUserPrefill('${safeUsername}', '${safePassword}', '${u.section}', '${userLang}', '${safeTableTeacher}')" style="padding:4px 9px; font-size:0.8rem; margin-right:5px;">
                                <i class="fas fa-edit"></i> Modifier
                            </button>
                            <button type="button" class="btn-sm-delete" onclick="adminDeleteUser('${safeUsername}', '${u.section}')" style="padding:4px 9px; font-size:0.8rem;">
                                <i class="fas fa-trash-alt"></i> Supprimer
                            </button>
                        </td>
                    </tr>
                `;
            });
            
            html += `</tbody></table>`;
            container.innerHTML = html;
        }

        function filterAdminTeachersTable() {
            const searchInput = document.getElementById('adminTeacherSearchInput');
            const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
            if (!query) {
                renderAdminUsersTable(allAdminUsersCache);
                return;
            }
            const filtered = allAdminUsersCache.filter(u => 
                (u.username && u.username.toLowerCase().includes(query)) ||
                (u.tableTeacherName && u.tableTeacherName.toLowerCase().includes(query)) ||
                (u.language && u.language.toLowerCase().includes(query)) ||
                (u.password && u.password.toLowerCase().includes(query))
            );
            renderAdminUsersTable(filtered);
        }

        function adminEditUserPrefill(username, password, section, language, tableTeacherName) {
            const userInput = document.getElementById('adminNewUsername');
            const tableTeacherInput = document.getElementById('adminNewTableTeacherName');
            const passInput = document.getElementById('adminNewPassword');
            const langSelect = document.getElementById('adminNewUserLanguage');
            const filterEl = document.getElementById('adminSectionFilter');
            
            if (userInput) userInput.value = username;
            if (tableTeacherInput) {
                tableTeacherInput.value = tableTeacherName || username;
                tableTeacherInput.dataset.customized = (tableTeacherName && tableTeacherName.trim().toLowerCase() !== username.trim().toLowerCase()) ? "true" : "";
            }
            if (passInput) passInput.value = password;
            if (langSelect) langSelect.value = language || 'fr';
            if (filterEl && section) filterEl.value = section;
            
            if (userInput) {
                userInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                if (passInput) passInput.focus();
            }
            const statusDiv = document.getElementById('adminUsersStatus');
            if (statusDiv) {
                const diffInfo = (tableTeacherName && tableTeacherName !== username) ? ` (Nom de tableau pour le tri: <strong>${tableTeacherName}</strong>)` : '';
                statusDiv.innerHTML = `<span style="color:#2563EB;"><i class="fas fa-info-circle"></i> Modification du compte pour <strong>${username}</strong>${diffInfo}. Modifiez les informations puis cliquez sur 'Enregistrer Compte'.</span>`;
            }
        }

        async function adminAddOrUpdateUser() {
            const userInput = document.getElementById('adminNewUsername');
            const tableTeacherInput = document.getElementById('adminNewTableTeacherName');
            const passInput = document.getElementById('adminNewPassword');
            const langSelect = document.getElementById('adminNewUserLanguage');
            const filterEl = document.getElementById('adminSectionFilter');
            const statusDiv = document.getElementById('adminUsersStatus');
            
            let username = userInput ? userInput.value.trim() : '';
            let tableTeacherName = tableTeacherInput ? tableTeacherInput.value.trim() : '';
            const password = passInput ? passInput.value.trim() : '';
            const language = langSelect ? langSelect.value : 'fr';
            const section = filterEl ? filterEl.value : currentSection;
            
            // Si l'un des deux noms est renseigné, l'autre prend la même valeur par défaut s'il est vide
            if (!username && tableTeacherName) {
                username = tableTeacherName;
                if (userInput) userInput.value = username;
            }
            if (!tableTeacherName && username) {
                tableTeacherName = username;
            }
            
            if (!username || !password) {
                if (statusDiv) {
                    statusDiv.innerHTML = '<span style="color:#EF4444;"><i class="fas fa-exclamation-circle"></i> Veuillez renseigner le nom d\'utilisateur (ou enseignant) et le mot de passe.</span>';
                }
                return;
            }
            
            if (statusDiv) statusDiv.innerHTML = '<span style="color:#2563EB;"><i class="fas fa-spinner fa-spin"></i> Enregistrement en cours...</span>';
            
            try {
                const response = await fetch('/api/admin/users', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password, section, language, tableTeacherName })
                });
                const res = await response.json();
                if (response.ok) {
                    if (statusDiv) {
                        statusDiv.innerHTML = `<span style="color:#10B981;"><i class="fas fa-check-circle"></i> ${res.message}</span>`;
                        setTimeout(() => { if (statusDiv) statusDiv.innerHTML = ''; }, 4000);
                    }
                    if (userInput) userInput.value = '';
                    if (tableTeacherInput) {
                        tableTeacherInput.value = '';
                        tableTeacherInput.dataset.customized = "";
                    }
                    if (passInput) passInput.value = '';
                    loadAdminUsersList();
                } else {
                    throw new Error(res.message);
                }
            } catch (err) {
                if (statusDiv) {
                    statusDiv.innerHTML = `<span style="color:#EF4444;"><i class="fas fa-times-circle"></i> Erreur: ${err.message}</span>`;
                }
            }
        }

        async function adminDeleteUser(username, section) {
            if (!confirm(`Voulez-vous vraiment supprimer l'enseignant '${username}' de la section ${section} ?`)) return;
            
            try {
                const response = await fetch('/api/admin/users', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, section })
                });
                const res = await response.json();
                if (response.ok) {
                    loadAdminUsersList();
                } else {
                    alert(`Erreur: ${res.message}`);
                }
            } catch (err) {
                alert(`Erreur: ${err.message}`);
            }
        }

        function togglePasswordVisibility() { const passwordInput = document.getElementById('password'); const toggleIcon = document.getElementById('togglePassword'); if (!passwordInput || !toggleIcon) return; const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password'; passwordInput.setAttribute('type', type); toggleIcon.className = (type === 'password') ? 'fas fa-eye password-toggle-icon' : 'fas fa-eye-slash password-toggle-icon'; }

        // --- Initialisation ---
        document.addEventListener('DOMContentLoaded', () => {
            console.log("DOM chargé.");
            fetchWeeksConfiguration();
            updateSectionBadges();

            const loginButton = document.getElementById('login-button');
            const passwordInput = document.getElementById('password');
            const usernameInput = document.getElementById('username');
            const logoutButton = document.getElementById('logout-button');
            const togglePasswordIcon = document.getElementById('togglePassword');
            
            if (loginButton) {
                loginButton.addEventListener('click', handleLogin);
                if (passwordInput) { passwordInput.addEventListener('keypress', function(e) { if (e.key === 'Enter') { loginButton.click(); } }); }
                if (usernameInput) { usernameInput.addEventListener('keypress', function(e) { if (e.key === 'Enter') { loginButton.click(); } }); }
            } else { console.error("Btn connexion absent!"); }
            
            if (logoutButton) { logoutButton.addEventListener('click', handleLogout); } else { console.error("Btn déconnexion absent!"); }
            if (togglePasswordIcon) { togglePasswordIcon.addEventListener('click', togglePasswordVisibility); } else { console.error("Icone pwd absente!"); }
            
            // Support RTL pour les notes
            const notesInput = document.getElementById("notesInput");
            if (notesInput) {
                notesInput.addEventListener("input", function(e) {
                    applyRTLToElement(e.target, e.target.value);
                });
            }

            // Synchronisation automatique par défaut entre Nom d'utilisateur et Nom de l'Enseignant dans le formulaire Admin
            const adminUserField = document.getElementById('adminNewUsername');
            const adminTeacherField = document.getElementById('adminNewTableTeacherName');
            if (adminUserField && adminTeacherField) {
                adminUserField.addEventListener('input', () => {
                    if (!adminTeacherField.dataset.customized || adminTeacherField.dataset.customized !== "true") {
                        adminTeacherField.value = adminUserField.value;
                    }
                });
                adminTeacherField.addEventListener('input', () => {
                    if (adminTeacherField.value.trim() !== '' && adminTeacherField.value !== adminUserField.value) {
                        adminTeacherField.dataset.customized = "true";
                    } else if (adminTeacherField.value.trim() === '') {
                        adminTeacherField.dataset.customized = "";
                    }
                });
            }
            
            // Vérifier la version d'authentification
            const savedUser = localStorage.getItem('loggedInUser');
            const savedAuthVersion = localStorage.getItem('authVersion');
            
            if (savedUser && savedAuthVersion && parseInt(savedAuthVersion) === AUTH_VERSION) {
                console.log(`Utilisateur trouvé dans la session : '${savedUser}'. Connexion automatique.`);
                initializeApp(savedUser);
            } else {
                if (savedUser) {
                    console.log('🔴 Version d\'authentification obsolète. Déconnexion automatique pour mise à jour du mot de passe.');
                    localStorage.removeItem('loggedInUser');
                    localStorage.removeItem('authVersion');
                    
                    const errorDiv = document.getElementById('login-error');
                    if (errorDiv) {
                        errorDiv.textContent = '⚠️ Mise à jour de sécurité : Veuillez vous reconnecter avec le nouveau mot de passe.';
                        errorDiv.style.display = 'block';
                        errorDiv.style.backgroundColor = '#fff3cd';
                        errorDiv.style.color = '#856404';
                        errorDiv.style.borderColor = '#ffc107';
                    }
                }
                console.log("Affichage de la sélection de section.");
                const sectionSel = document.getElementById('section-selection');
                if (sectionSel) sectionSel.style.display = 'flex';
                document.getElementById('login-form').style.display = 'none';
                document.getElementById('main-content').style.display = 'none';
                currentUserLanguage = 'fr';
                applyLanguageSettings();
            }

            updateActionButtonsState(false);
            const saveAllBtn = document.getElementById('saveAllDisplayedBtn');
            if (saveAllBtn) saveAllBtn.disabled = true;
            const saveAdminBtn = document.getElementById('saveUploadedDataBtn');
            if (saveAdminBtn) saveAdminBtn.disabled = true;
            const saveNotesBtn = document.getElementById('saveNotesBtn');
            if (saveNotesBtn) saveNotesBtn.disabled = true;
        });

        // ==================== FONCTIONS POUR PLANS DE LEÇON (COORDINATEUR) ====================
        
        // Download lesson plan for a specific row
        async function downloadLessonPlan(rowData) {
            if (!rowData || !rowData.lessonPlanId) {
                displayAlert('Aucun plan de leçon disponible pour cette ligne.', true);
                return;
            }
            
            console.log("Téléchargement du plan de leçon:", rowData.lessonPlanId);
            displayAlert('Téléchargement du plan de leçon...', false);
            
            try {
                // Télécharger depuis MongoDB
                const response = await fetch(`/api/download-lesson-plan/${rowData.lessonPlanId}`);
                
                if (response.ok) {
                    const blob = await response.blob();
                    const contentDisposition = response.headers.get('content-disposition');
                    let filename = `plan_lecon_S${currentWeek}.docx`;
                    if (contentDisposition) {
                        const filenameMatch = contentDisposition.match(/filename="?(.+?)"?(;|$)/i);
                        if (filenameMatch && filenameMatch[1]) {
                            filename = filenameMatch[1];
                        }
                    }
                    
                    if (typeof saveAs === 'function') {
                        saveAs(blob, filename);
                        displayAlert('Plan de leçon téléchargé avec succès !', false);
                    }
                } else {
                    const errorResult = await response.json().catch(() => ({ message: "Erreur inconnue" }));
                    throw new Error(errorResult.message || `Erreur serveur ${response.status}`);
                }
            } catch (error) {
                console.error('Erreur téléchargement plan de leçon:', error);
                displayAlert('Erreur lors du téléchargement du plan de leçon: ' + error.message, true);
            }
        }
        
        console.log("Script principal terminé.");

// ============================================================================
// FONCTIONS DU PORTAIL DEVOIRS ET GESTION DES ÉLÈVES
// ============================================================================

let homeworkLang = 'fr';
let selectedStudentObj = null;
let currentHomeworkDate = new Date().toISOString().split('T')[0];
let activeParentAccount = JSON.parse(localStorage.getItem('parentAccount') || 'null');

let isParentMode = false;

function getStudentFallbackAvatar(section) {
    const isGirls = (section === 'filles' || currentSection === 'filles');
    const isPrimaire = (section === 'primaire' || currentSection === 'primaire');
    const colorBg = isGirls ? '#FDF2F8' : (isPrimaire ? '#ECFDF5' : '#EFF6FF');
    const colorFill = isGirls ? '#F472B6' : (isPrimaire ? '#34D399' : '#60A5FA');
    const colorStroke = isGirls ? '#DB2777' : (isPrimaire ? '#059669' : '#2563EB');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="100" height="100">
        <rect width="120" height="120" rx="60" fill="${colorBg}"/>
        <circle cx="60" cy="45" r="22" fill="${colorFill}"/>
        <circle cx="60" cy="43" r="16" fill="#FED7AA"/>
        <path d="M46 32 L60 22 L74 32 L60 38 Z" fill="#1E293B"/>
        <circle cx="74" cy="33" r="3" fill="#F59E0B"/>
        <path d="M26 102 C26 78, 42 70, 60 70 C78 70, 94 78, 94 102 Z" fill="${colorStroke}"/>
    </svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function applyParentUIMode(enabled) {
    isParentMode = enabled;
    
    const plansTabBtn = document.getElementById('tab-plans-btn');
    const goToTeacherBtn = document.getElementById('go-to-teacher');
    const goToParentBtn = document.getElementById('go-to-parent');
    const loggedInInfo = document.getElementById('loggedInUserInfo');
    const logoutBtn = document.getElementById('logout-button');
    const mainTitle = document.getElementById('main-title');
    const switchSecBtn = document.querySelector('.switch-section-btn');
    
    if (enabled) {
        if (plansTabBtn) plansTabBtn.style.display = 'none'; // Masquer l'accès aux plans enseignants
        if (goToTeacherBtn) goToTeacherBtn.style.display = 'none'; // Masquer l'accès à l'espace enseignants
        if (goToParentBtn) goToParentBtn.style.display = 'inline-flex';
        if (switchSecBtn) switchSecBtn.style.display = 'none';
        if (loggedInInfo) loggedInInfo.textContent = 'Espace Parent 👨‍👩‍👧‍👦';
        if (logoutBtn) {
            logoutBtn.innerHTML = '<i class="fas fa-arrow-left"></i> <span class="btn-text">Retour Accueil</span>';
            logoutBtn.onclick = resetSectionChoice;
        }
        if (mainTitle) mainTitle.textContent = 'Espace Parents - Portail Suivi & Devoirs';
    } else {
        if (plansTabBtn) plansTabBtn.style.display = 'inline-block';
        if (goToTeacherBtn) goToTeacherBtn.style.display = 'inline-flex';
        if (goToParentBtn) goToParentBtn.style.display = 'none'; // L'enseignant ne voit pas l'espace parent
        if (switchSecBtn) {
            if (isUserAdminOrSupervisor(loggedInUser, currentUserRole)) {
                switchSecBtn.style.display = 'inline-flex';
                switchSecBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Changer Section';
                switchSecBtn.onclick = cycleAdminSection;
                switchSecBtn.title = "Basculer vers une autre section sans vous déconnecter";
            } else {
                switchSecBtn.style.display = 'none'; // Verrouillage de la section pour l'enseignant
            }
        }
        if (mainTitle) mainTitle.textContent = 'Plans Hebdomadaires';
        if (logoutBtn) {
            logoutBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i> <span class="btn-text">Déconnecter</span>';
            logoutBtn.onclick = handleLogout;
        }
    }
}

function switchMainTab(tab) {
    if (isParentMode && tab === 'plans') {
        tab = 'devoirs';
    }
    const plansTab = document.getElementById('plans-tab-content');
    const devoirsTab = document.getElementById('devoirs-tab-content');
    const plansBtn = document.getElementById('tab-plans-btn');
    const devoirsBtn = document.getElementById('tab-devoirs-btn');

    if (tab === 'devoirs') {
        if (plansTab) plansTab.style.display = 'none';
        if (devoirsTab) devoirsTab.style.display = 'block';
        if (plansBtn) plansBtn.classList.remove('active');
        if (devoirsBtn) devoirsBtn.classList.add('active');
        if (isParentMode) {
            showHomeworkView('parent-selection');
        } else {
            // L'enseignant accède DIRECTEMENT à son espace enseignant
            showHomeworkView('homework-teacher');
        }
    } else {
        if (plansTab) plansTab.style.display = 'block';
        if (devoirsTab) devoirsTab.style.display = 'none';
        if (plansBtn) plansBtn.classList.add('active');
        if (devoirsBtn) devoirsBtn.classList.remove('active');
    }
}

function showHomeworkView(viewName) {
    if (isParentMode && viewName === 'homework-teacher') {
        displayAlert("Accès réservé uniquement aux enseignants.", true);
        viewName = 'parent-selection';
    }
    if (!isParentMode && (viewName === 'parent-plan' || viewName === 'parent-selection' || viewName === 'student-dashboard' || viewName === 'parent-contacts')) {
        // Un enseignant connecté ne navigue pas dans les vues réservées aux parents
        viewName = 'homework-teacher';
    }
    const views = ['homework-home', 'parent-selection', 'student-dashboard', 'homework-teacher', 'parent-plan', 'parent-contacts'];
    views.forEach(v => {
        const el = document.getElementById(v + '-view');
        if (el) el.style.display = (v === viewName) ? 'block' : 'none';
    });

    // Mettre à jour l'état actif des 4 onglets dans tous les conteneurs de navigation
    const activeTabMap = {
        'parent-selection': 'students',
        'student-dashboard': 'students',
        'parent-plan': 'plan',
        'parent-contacts': 'teachers',
        'homework-home': 'photos'
    };
    const activeType = activeTabMap[viewName] || 'students';
    document.querySelectorAll('.parent-nav-tabs').forEach(tabGroup => {
        tabGroup.querySelectorAll('button').forEach(btn => {
            const isTarget = btn.classList.contains(`tab-btn-${activeType}`);
            if (isTarget) {
                btn.classList.add('primary-button', 'active');
            } else {
                btn.classList.remove('primary-button', 'active');
            }
        });
    });

    if (viewName === 'parent-plan') {
        populateParentWeekSelector();
        loadParentWeeklyPlan();
    } else if (viewName === 'parent-contacts') {
        loadTeachersContactGrid();
    } else if (viewName === 'homework-home') {
        loadHomeworkShowcase();
    } else if (viewName === 'homework-teacher') {
        loadTeacherHomeworksDashboard();
    } else if (viewName === 'parent-selection') {
        const activeClassBtn = document.querySelector('#parent-class-buttons button.active');
        const defaultClass = activeClassBtn ? (activeClassBtn.getAttribute('onclick')?.match(/'([^']+)'/)?.[1] || 'PEI1') : 'PEI1';
        loadClassStudents(defaultClass || 'PEI1');
    }
}

// ============================================================================
// LOGIQUE ESPACE PARENTS (SUR LA PREMIÈRE PAGE ET EN PORTAIL DÉDIÉ)
// ============================================================================

function openParentSectionModal() {
    const modal = document.getElementById('parent-section-modal');
    if (modal) modal.style.display = 'flex';
}

function closeParentSectionModal() {
    const modal = document.getElementById('parent-section-modal');
    if (modal) modal.style.display = 'none';
}

function enterParentSpaceWithSection(section) {
    currentSection = section;
    localStorage.setItem('selectedSection', section);
    localStorage.setItem('currentSection', section);
    closeParentSectionModal();
    
    // Réinitialiser le cache pour éviter tout mélange entre filles et garçons
    parentRawPlanData = [];
    parentRawClassNotes = {};
    if (typeof studentsClientCache !== 'undefined') studentsClientCache.clear();
    const studentsGrid = document.getElementById('students-grid');
    if (studentsGrid) studentsGrid.innerHTML = '';
    
    // Activer le mode restriction Parent
    applyParentUIMode(true);
    
    // Afficher l'application principale
    const secSel = document.getElementById('section-selection');
    const loginForm = document.getElementById('login-form');
    const mainContent = document.getElementById('main-content');
    
    if (secSel) secSel.style.display = 'none';
    if (loginForm) loginForm.style.display = 'none';
    if (mainContent) mainContent.style.display = 'block';
    
    updateSectionBadges();
    applyParentLanguageUI();
    
    // Basculer vers le portail devoirs/parents sur l'écran d'accueil du Suivi des Élèves
    switchMainTab('devoirs');
    showHomeworkView('parent-selection');
}

function toggleParentSection() {
    let newSection = 'garcons';
    if (currentSection === 'garcons') newSection = 'filles';
    else if (currentSection === 'filles') newSection = 'primaire';
    else newSection = 'garcons';
    
    currentSection = newSection;
    localStorage.setItem('selectedSection', newSection);
    localStorage.setItem('currentSection', newSection);
    updateSectionBadges();
    
    // Réinitialiser le cache pour la nouvelle section
    parentRawPlanData = [];
    parentRawClassNotes = {};
    if (typeof studentsClientCache !== 'undefined') studentsClientCache.clear();
    const studentsGrid = document.getElementById('students-grid');
    if (studentsGrid) studentsGrid.innerHTML = '';
    
    const classes = getSectionClasses(currentSection);
    const defaultClass = classes[0];
    
    // Recharger la classe active
    loadClassStudents(defaultClass);
}

function populateParentWeekSelector() {
    const select = document.getElementById('parentWeekSelector');
    if (!select) return;
    
    const currentVal = select.value;
    // Pour les parents : la semaine par défaut est TOUJOURS la SEMAINE COURANTE
    const activeWeek = currentVal ? parseInt(currentVal, 10) : (getCurrentWeekNumber() || 1);
    select.innerHTML = '';
    
    const sortedWeekNums = Object.keys(weeksConfig).map(n => parseInt(n, 10)).sort((a, b) => a - b);
    sortedWeekNums.forEach(wNum => {
        const option = document.createElement('option');
        option.value = String(wNum);
        option.textContent = formatWeekDateRangeText(wNum);
        if (wNum === activeWeek) {
            option.selected = true;
        }
        select.appendChild(option);
    });
    
    select.value = String(activeWeek);
}

let parentRawPlanData = [];
let parentRawClassNotes = {};
let parentActiveDay = (typeof getTodaySchoolDayName === 'function') ? getTodaySchoolDayName() : 'Dimanche';
const schoolDaysList = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi"];

function setParentActiveDay(dayName) {
    parentActiveDay = dayName;
    const classSelect = document.getElementById('parentClassSelector');
    if (!classSelect || !parentRawPlanData) return;
    
    const selectedClass = classSelect.value || 'PEI1';
    const norm = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();
    const classRows = parentRawPlanData.filter(row => {
        const classVal = getRowField(row, 'Classe');
        return classVal && norm(classVal) === norm(selectedClass);
    });
    renderParentPlanCards(classRows);
}

function changeParentActiveDay(offset) {
    let idx = schoolDaysList.indexOf(parentActiveDay);
    if (idx === -1) idx = 0;
    idx = (idx + offset + schoolDaysList.length) % schoolDaysList.length;
    setParentActiveDay(schoolDaysList[idx]);
}

let parentSpecialDays = [];
let adminSpecialPhotosList = [];
let quickSpecialPhotosList = [];

async function loadParentWeeklyPlan() {
    try {
        const weekSelect = document.getElementById('parentWeekSelector');
        const classSelect = document.getElementById('parentClassSelector');
        const container = document.getElementById('parentPlanDisplayContainer');
        const statusBanner = document.getElementById('parentPlanStatusBanner');
        const notesBox = document.getElementById('parentClassNotesBox');
        const sectionToggleBtnText = document.getElementById('parentSectionToggleText');
        
        if (!weekSelect || !classSelect || !container) return;
        
        // Par défaut pour les parents : la semaine courante
        const selectedWeek = weekSelect.value || (getCurrentWeekNumber() || 1);
        const curW = getCurrentWeekNumber();
        // Si les parents consultent la semaine courante, positionner automatiquement sur le jour d'aujourd'hui
        if (Number(selectedWeek) === Number(curW) && typeof getTodaySchoolDayName === 'function') {
            parentActiveDay = getTodaySchoolDayName();
        }
        const classes = getSectionClasses(currentSection);
        const selectedClass = classSelect.value || classes[0];
        const section = currentSection || 'garcons';
        
        if (sectionToggleBtnText) {
            sectionToggleBtnText.textContent = section === 'garcons' ? 'Section Garçons 👦' : (section === 'filles' ? 'Section Filles 👧' : 'Primaire & Maternelle 👶🎒');
        }
        
        const secLabel = section === 'garcons' ? 'Garçons' : (section === 'filles' ? 'Filles' : 'Primaire');
        container.innerHTML = `
            <div style="text-align:center; padding:40px; background:white; border-radius:16px; box-shadow:0 4px 15px rgba(0,0,0,0.05);">
                <i class="fas fa-spinner fa-spin fa-2x" style="color:#10B981; margin-bottom:12px;"></i>
                <p style="color:#4B5563; font-size:1.05rem; font-weight:600; margin:0;">Chargement du plan hebdomadaire pour la classe ${selectedClass} (${secLabel})...</p>
            </div>
        `;
        
        const [res, specRes] = await Promise.all([
            fetch(`/api/plans/${selectedWeek}?section=${section}`),
            fetch(`/api/special-days?week=${selectedWeek}&section=${section}`).catch(() => null)
        ]);

        if (specRes && specRes.ok) {
            parentSpecialDays = await specRes.json();
        } else {
            parentSpecialDays = [];
        }

        if (!res.ok) {
            container.innerHTML = `<div class="alert-error">Impossible de charger le plan hebdomadaire pour le moment.</div>`;
            return;
        }
        
        const data = await res.json();

        // Contrôle de publication admin : si non publié, afficher le message officiel aux parents
        if (data.isPublishedToParents === false) {
            container.innerHTML = `
                <div style="background:white; border:2px solid #F59E0B; border-radius:18px; padding:35px 25px; text-align:center; box-shadow:0 6px 20px rgba(0,0,0,0.06); max-width:700px; margin:20px auto;">
                    <div style="width:70px; height:70px; background:#FEF3C7; color:#D97706; border-radius:50%; display:flex; align-items:center; justify-content:center; margin:0 auto 16px auto; font-size:2rem;">
                        <i class="fas fa-clock"></i>
                    </div>
                    <h3 style="color:#1E1B4B; margin:0 0 10px 0; font-size:1.35rem; font-weight:800;">
                        Plan Hebdomadaire en Cours de Validation
                    </h3>
                    <p style="color:#64748B; font-size:0.98rem; line-height:1.6; margin:0 0 16px 0;">
                        Le plan hebdomadaire de la <strong>Semaine ${selectedWeek}</strong> pour la <strong>Section ${secLabel}</strong> est en cours de révision et de finalisation par la direction pédagogique.<br>
                        Il sera consultable dès sa publication officielle par l'administration.
                    </p>
                    <div style="display:inline-flex; align-items:center; gap:8px; background:#EFF6FF; border:1px solid #BFDBFE; color:#1D4ED8; padding:8px 16px; border-radius:10px; font-weight:600; font-size:0.9rem;">
                        <i class="fas fa-info-circle"></i> Vous pouvez consulter les semaines précédentes déjà publiées via le sélecteur ci-dessus.
                    </div>
                </div>
            `;
            if (statusBanner) statusBanner.innerHTML = '';
            if (notesBox) notesBox.style.display = 'none';
            return;
        }

        let fetchedData = data.planData || [];
        
        // Double sécurité : filtrer les enseignants des autres sections
        if (section === 'garcons') {
            fetchedData = fetchedData.filter(row => {
                const ens = (getRowField(row, 'Enseignant') || '').trim();
                return !femaleTeachersList.some(f => f.toLowerCase() === ens.toLowerCase()) &&
                       !primaireTeachersList.some(p => p.toLowerCase() === ens.toLowerCase()) &&
                       !isDualSectionTeacher(ens);
            });
        } else if (section === 'filles') {
            fetchedData = fetchedData.filter(row => {
                const ens = (getRowField(row, 'Enseignant') || '').trim();
                if (isDualSectionTeacher(ens)) return true;
                return !maleTeachersList.some(m => m.toLowerCase() === ens.toLowerCase()) &&
                       !primaireTeachersList.some(p => p.toLowerCase() === ens.toLowerCase());
            });
        } else if (section === 'primaire') {
            fetchedData = fetchedData.filter(row => {
                const ens = (getRowField(row, 'Enseignant') || '').trim();
                if (isDualSectionTeacher(ens)) return true;
                return !maleTeachersList.some(m => m.toLowerCase() === ens.toLowerCase()) &&
                       !femaleTeachersList.some(f => f.toLowerCase() === ens.toLowerCase());
            });
        }
        
        parentRawPlanData = fetchedData;
        parentRawClassNotes = data.classNotes || {};

        if (parentRawPlanData.length > 0 && (!headers || headers.length === 0)) {
            headers = Object.keys(parentRawPlanData[0]);
        }
        
        // Filtrer les lignes pour la classe sélectionnée
        const norm = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();
        const classRows = parentRawPlanData.filter(row => {
            const classVal = getRowField(row, 'Classe');
            return classVal && norm(classVal) === norm(selectedClass);
        });
        
        // Vérifier si la saisie est complète pour cette classe
        let emptyCount = 0;
        classRows.forEach(row => {
            const leconVal = getRowField(row, 'Leçon');
            const taskVal = getRowField(row, 'Travaux de classe');
            if ((!leconVal || String(leconVal).trim() === '') && (!taskVal || String(taskVal).trim() === '')) {
                emptyCount++;
            }
        });
        
        const isComplete = (classRows.length > 0 && emptyCount === 0);
        const t = parentI18n[currentUserLanguage] || parentI18n.fr;
        
        if (statusBanner) {
            if (classRows.length === 0) {
                statusBanner.innerHTML = `
                    <div style="background:#F3F4F6; border:1px solid #D1D5DB; border-radius:14px; padding:16px 20px; color:#4B5563; font-weight:600; display:flex; align-items:center; gap:12px;">
                        <i class="fas fa-info-circle" style="font-size:1.5rem; color:#6B7280;"></i>
                        <span>${t.noPlanPublished} (${selectedClass} - Semaine ${selectedWeek})</span>
                    </div>
                `;
            } else if (isComplete) {
                statusBanner.innerHTML = `
                    <div style="background:#ECFDF5; border:2px solid #10B981; border-radius:14px; padding:16px 22px; color:#065F46; font-weight:700; box-shadow:0 4px 12px rgba(16,185,129,0.15); display:flex; align-items:center; gap:14px;">
                        <i class="fas fa-check-circle" style="font-size:1.8rem; color:#10B981;"></i>
                        <div>
                            <div style="font-size:1.1rem; color:#065F46;">${t.planCompletedTitle}</div>
                            <div style="font-size:0.88rem; font-weight:500; color:#047857; margin-top:2px;">${t.planCompletedDesc} (${selectedClass} - Semaine ${selectedWeek})</div>
                        </div>
                    </div>
                `;
            } else {
                statusBanner.innerHTML = `
                    <div style="background:#FFFBEB; border:2px solid #F59E0B; border-radius:14px; padding:16px 22px; color:#92400E; font-weight:700; box-shadow:0 4px 12px rgba(245,158,11,0.15); display:flex; align-items:center; gap:14px;">
                        <i class="fas fa-hourglass-half" style="font-size:1.8rem; color:#F59E0B;"></i>
                        <div>
                            <div style="font-size:1.1rem; color:#92400E;">${t.planInProgressTitle}</div>
                            <div style="font-size:0.88rem; font-weight:500; color:#B45309; margin-top:2px;">${t.planInProgressDesc} (${selectedClass} - Semaine ${selectedWeek})</div>
                        </div>
                    </div>
                `;
            }
        }
        
        // Remarques Générales de la Classe
        if (notesBox) {
            const classNote = parentRawClassNotes[selectedClass];
            if (classNote && classNote.trim() !== '') {
                notesBox.style.display = 'block';
                notesBox.innerHTML = `
                    <div style="background:#FEF3C7; border-left:6px solid #D97706; padding:16px 20px; border-radius:12px; color:#78350F; font-weight:600; box-shadow:0 2px 8px rgba(0,0,0,0.04);">
                        <div style="font-size:1.05rem; margin-bottom:4px; display:flex; align-items:center; gap:8px;">
                            <i class="fas fa-sticky-note" style="color:#D97706;"></i> ${currentUserLanguage === 'ar' ? 'ملاحظات عامة للصف' : 'Remarques Générales de la Classe'} (${selectedClass}) :
                        </div>
                        <p style="margin:0; font-weight:400; font-size:0.95rem; white-space:pre-wrap;">${escapeHtml(classNote)}</p>
                    </div>
                `;
            } else {
                notesBox.style.display = 'none';
            }
        }
        
        renderParentPlanCards(classRows);
        
    } catch (e) {
        console.error('Erreur loadParentWeeklyPlan:', e);
    }
}

function renderParentPlanCards(rows) {
    const container = document.getElementById('parentPlanDisplayContainer');
    const t = parentI18n[currentUserLanguage] || parentI18n.fr;
    const selectedClass = document.getElementById('parentClassSelector')?.value || 'PEI1';
    const selectedWeek = document.getElementById('parentWeekSelector')?.value || (currentWeek || 1);
    const norm = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();
    
    if (!container) return;
    
    // Grouper les cours par jour
    const grouped = {};
    (rows || []).forEach(r => {
        const dayVal = getRowField(r, 'Jour');
        const standardDay = normalizeDayName(dayVal) || extractDayName(dayVal) || dayVal;
        if (standardDay && schoolDaysList.includes(standardDay)) {
            if (!grouped[standardDay]) grouped[standardDay] = [];
            grouped[standardDay].push(r);
        } else {
            const fallbackDay = schoolDaysList.find(d => String(dayVal).toLowerCase().includes(d.toLowerCase())) || "Dimanche";
            if (!grouped[fallbackDay]) grouped[fallbackDay] = [];
            grouped[fallbackDay].push(r);
        }
    });
    
    if (!schoolDaysList.includes(parentActiveDay)) {
        parentActiveDay = 'Dimanche';
    }
    
    // Barre de navigation des 5 jours
    let daysNavHtml = `
        <div style="background:white; border-radius:16px; padding:14px 18px; box-shadow:0 4px 18px rgba(0,0,0,0.06); border:1px solid #E2E8F0; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:20px;">
            <button type="button" class="pro-button" onclick="changeParentActiveDay(-1)" style="padding:10px 18px; font-weight:700;">
                <i class="fas fa-chevron-left"></i> <span>${t.prevDay}</span>
            </button>
            <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:center;">
    `;
    
    schoolDaysList.forEach(day => {
        const isActive = (day === parentActiveDay);
        const dayLabel = (currentUserLanguage === 'ar') ? (t.daysMap[day] || day) : day;
        const count = (grouped[day] || []).length;
        
        // Vérifier si ce jour a une fusion spéciale
        const hasSpecial = (parentSpecialDays || []).some(s => {
            const dNorm = normalizeDayName(s.day) || s.day;
            const matchesDay = (dNorm.toLowerCase() === day.toLowerCase());
            const matchesClass = (!s.classe || s.classe === 'ALL' || norm(s.classe) === norm(selectedClass));
            return matchesDay && matchesClass;
        });

        daysNavHtml += `
            <button type="button" class="pro-button ${isActive ? 'primary-button active' : ''}" onclick="setParentActiveDay('${day}')" style="padding:10px 18px; font-size:1rem; font-weight:700; border-radius:12px; transition:all 0.2s ease; ${isActive ? 'box-shadow:0 4px 12px rgba(59,130,246,0.35); transform:scale(1.03);' : 'background:#F8FAFC; color:#334155; border:1px solid #CBD5E1;'}">
                <span>${dayLabel}</span>
                ${hasSpecial ? `<span style="font-size:0.8rem; margin-left:4px;">🌟</span>` : `<span style="font-size:0.75rem; padding:2px 7px; border-radius:10px; margin-left:6px; margin-right:6px; background:${isActive ? 'rgba(255,255,255,0.25)' : '#E2E8F0'}; color:${isActive ? 'white' : '#475569'};">${count}</span>`}
            </button>
        `;
    });
    
    daysNavHtml += `
            </div>
            <button type="button" class="pro-button" onclick="changeParentActiveDay(1)" style="padding:10px 18px; font-weight:700;">
                <span>${t.nextDay}</span> <i class="fas fa-chevron-right"></i>
            </button>
        </div>
    `;
    
    // Récupérer et trier les cours du jour sélectionné
    const currentDayRows = grouped[parentActiveDay] || [];
    currentDayRows.sort((a, b) => {
        const pA = parseInt(getRowField(a, 'Période'), 10) || 0;
        const pB = parseInt(getRowField(b, 'Période'), 10) || 0;
        return pA - pB;
    });
    
    const weekStartDateNode = getDateForDayName(parentActiveDay);
    let formattedDayDate = weekStartDateNode ? formatDateForDisplay(weekStartDateNode) : parentActiveDay;
    if (currentUserLanguage === 'ar') {
        const arDay = t.daysMap[parentActiveDay] || parentActiveDay;
        formattedDayDate = `${arDay} ${weekStartDateNode ? `(${weekStartDateNode.getUTCDate()}/${weekStartDateNode.getUTCMonth() + 1})` : ''}`;
    }
    
    // Vérifier si une fusion de jour spéciale est active pour ce jour
    const activeSpecialDay = (parentSpecialDays || []).find(s => {
        const dNorm = normalizeDayName(s.day) || s.day;
        const pNorm = normalizeDayName(parentActiveDay) || parentActiveDay;
        const matchesDay = (dNorm.toLowerCase() === pNorm.toLowerCase());
        const matchesClass = (!s.classe || s.classe === 'ALL' || norm(s.classe) === norm(selectedClass));
        return matchesDay && matchesClass;
    });

    let tableHtml = '';
    const isAdminUser = (loggedInUser === 'Med01' || currentUserRole === 'admin');

    if (activeSpecialDay) {
        // AFFICHAGE DU JOUR FUSIONNÉ (PAS DE COURS / PHOTOS / ÉVÉNEMENT)
        const typeLabels = {
            'no_courses': { label: 'Pas de cours', icon: 'fas fa-calendar-times', color: '#EF4444', bg: '#FEF2F2', border: '#FECACA' },
            'holiday': { label: 'Vacances / Jour Férié', icon: 'fas fa-umbrella-beach', color: '#F59E0B', bg: '#FFFBEB', border: '#FDE68A' },
            'event': { label: 'Événement / Célébration', icon: 'fas fa-award', color: '#8B5CF6', bg: '#F5F3FF', border: '#DDD6FE' },
            'activity': { label: 'Activité / Sortie Scolaire', icon: 'fas fa-futbol', color: '#10B981', bg: '#ECFDF5', border: '#A7F3D0' }
        };
        const typeCfg = typeLabels[activeSpecialDay.type] || typeLabels['no_courses'];
        const photos = activeSpecialDay.photos || [];

        let photosGalleryHtml = '';
        if (photos.length > 0) {
            photosGalleryHtml = `
                <div style="margin-top:25px; padding-top:20px; border-top:1px solid #E2E8F0;">
                    <div style="font-weight:800; color:#1E1B4B; font-size:1.1rem; margin-bottom:14px; display:flex; align-items:center; gap:8px;">
                        <i class="fas fa-camera-retro" style="color:#3B82F6;"></i>
                        <span>${currentUserLanguage === 'ar' ? 'معرض صور هذا اليوم' : 'Photos & Souvenirs de la journée'} (${photos.length})</span>
                    </div>
                    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:16px;">
                        ${photos.map((p, pIdx) => `
                            <div class="special-photo-card" onclick="openImageLightbox('${escapeHtml(p.url).replace(/'/g, "\\'")}', '${escapeHtml(p.caption || '').replace(/'/g, "\\'")}')" style="background:white; border-radius:14px; overflow:hidden; border:1px solid #E2E8F0; box-shadow:0 4px 14px rgba(0,0,0,0.06); cursor:pointer; transition:transform 0.2s ease, box-shadow 0.2s ease;">
                                <div style="height:170px; overflow:hidden; position:relative; background:#F8FAFC;">
                                    <img src="${escapeHtml(p.url)}" alt="${escapeHtml(p.caption || 'Photo')}" loading="lazy" style="width:100%; height:100%; object-fit:cover; transition:transform 0.3s ease;">
                                    <div style="position:absolute; bottom:8px; right:8px; background:rgba(0,0,0,0.6); color:white; padding:4px 8px; border-radius:6px; font-size:0.75rem;">
                                        <i class="fas fa-search-plus"></i> Agrandir
                                    </div>
                                </div>
                                ${p.caption ? `
                                    <div style="padding:10px 12px; font-size:0.88rem; font-weight:600; color:#334155; line-height:1.4;">
                                        ${escapeHtml(p.caption)}
                                    </div>
                                ` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        tableHtml = `
            <div class="parent-special-day-merged-card" style="background:white; border-radius:20px; box-shadow:0 8px 30px rgba(0,0,0,0.08); border:2px solid ${typeCfg.border}; overflow:hidden;">
                <!-- Bannière En-tête Fusionné -->
                <div style="background:linear-gradient(135deg, #1E1B4B, #312E81); color:white; padding:22px 28px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:14px;">
                    <div>
                        <div style="font-size:1.35rem; font-weight:800; display:flex; align-items:center; gap:10px;">
                            <i class="${typeCfg.icon}" style="color:${typeCfg.color};"></i>
                            <span>${formattedDayDate}</span>
                        </div>
                        <div style="font-size:0.92rem; opacity:0.9; margin-top:3px;">
                            ${selectedClass === 'ALL' ? 'Toutes les classes' : `Classe : ${selectedClass}`} • Semaine ${selectedWeek}
                        </div>
                    </div>
                    <span style="background:${typeCfg.bg}; color:${typeCfg.color}; border:1px solid ${typeCfg.border}; padding:8px 18px; border-radius:30px; font-weight:800; font-size:0.95rem; display:inline-flex; align-items:center; gap:8px;">
                        <i class="${typeCfg.icon}"></i> ${typeCfg.label}
                    </span>
                </div>

                <!-- Corps de la Fusion -->
                <div style="padding:32px 28px;">
                    <div style="background:${typeCfg.bg}; border-left:6px solid ${typeCfg.color}; border-radius:14px; padding:20px 24px; margin-bottom:20px;">
                        <h3 style="color:#1E1B4B; font-size:1.4rem; font-weight:800; margin:0 0 10px 0;">
                            ${escapeHtml(activeSpecialDay.title)}
                        </h3>
                        <p style="color:#334155; font-size:1.05rem; line-height:1.7; margin:0; white-space:pre-wrap;">${escapeHtml(activeSpecialDay.message || "Aucune séance de cours n'est programmée pour ce jour.")}</p>
                    </div>

                    ${photosGalleryHtml}

                    ${isAdminUser ? `
                        <div style="margin-top:25px; padding-top:16px; border-top:1px dashed #CBD5E1; display:flex; gap:10px; justify-content:flex-end;">
                            <button type="button" class="pro-button" onclick="openSpecialDayQuickModal('${parentActiveDay}', '${selectedClass}')" style="background:#EEF2FF; color:#4338CA; border:1px solid #C7D2FE; padding:8px 16px; font-size:0.9rem; font-weight:700;">
                                <i class="fas fa-edit"></i> Modifier cette fusion
                            </button>
                            <button type="button" class="pro-button" onclick="deleteAdminSpecialDay('${activeSpecialDay._id}')" style="background:#FEF2F2; color:#DC2626; border:1px solid #FECACA; padding:8px 16px; font-size:0.9rem; font-weight:700;">
                                <i class="fas fa-trash-alt"></i> Annuler la fusion
                            </button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    } else if (currentDayRows.length === 0) {
        // AUCUN COURS RENSEIGNÉ
        tableHtml = `
            <div style="background:white; border-radius:18px; padding:45px 24px; text-align:center; border:1px dashed #CBD5E1; box-shadow:0 4px 18px rgba(0,0,0,0.04);">
                <div style="width:70px; height:70px; background:#F1F5F9; color:#94A3B8; border-radius:50%; display:flex; align-items:center; justify-content:center; margin:0 auto 16px auto; font-size:2rem;">
                    <i class="fas fa-calendar-day"></i>
                </div>
                <h4 style="font-size:1.25rem; color:#1E1B4B; margin:0 0 8px 0; font-weight:800;">${t.noCoursesFound}</h4>
                <p style="color:#64748B; font-size:1rem; margin:0 0 20px 0;">${currentUserLanguage === 'ar' ? `لا توجد حصص مجدولة ليوم ${formattedDayDate}.` : `Aucun cours planifié pour ${formattedDayDate}.`}</p>
                
                ${isAdminUser ? `
                    <button type="button" class="pro-button primary-button" onclick="openSpecialDayQuickModal('${parentActiveDay}', '${selectedClass}')" style="padding:10px 20px; font-weight:700; border-radius:12px; display:inline-flex; align-items:center; gap:8px;">
                        <i class="fas fa-object-group"></i> <span>Fusionner ce jour & Ajouter des photos</span>
                    </button>
                ` : ''}
            </div>
        `;
    } else {
        // TABLEAU STANDARD DES COURS DU JOUR
        tableHtml = `
            <div class="parent-day-table-card" style="background:white; border-radius:18px; box-shadow:0 6px 24px rgba(0,0,0,0.06); border:1px solid #E2E8F0; overflow:hidden;">
                <!-- En-tête du jour -->
                <div style="background:linear-gradient(135deg, #1E1B4B, #312E81); color:white; padding:18px 24px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
                    <div style="font-size:1.25rem; font-weight:800; display:flex; align-items:center; gap:10px;">
                        <i class="fas fa-calendar-check" style="color:#10B981;"></i>
                        <span>${currentUserLanguage === 'ar' ? 'جدول حصص يوم' : 'Tableau des cours du'} : ${formattedDayDate}</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span style="background:rgba(255,255,255,0.18); padding:6px 14px; border-radius:20px; font-size:0.9rem; font-weight:700;">
                            ${currentDayRows.length} ${t.sessionsCount}
                        </span>
                        ${isAdminUser ? `
                            <button type="button" class="pro-button" onclick="openSpecialDayQuickModal('${parentActiveDay}', '${selectedClass}')" title="Fusionner les cases de ce jour pour les parents (pas de cours / photos)" style="background:rgba(255,255,255,0.25); color:white; border:none; padding:6px 12px; border-radius:8px; font-size:0.85rem; font-weight:700; cursor:pointer;">
                                <i class="fas fa-object-group"></i> Fusionner ce jour
                            </button>
                        ` : ''}
                    </div>
                </div>
                
                <!-- Tableau des cours -->
                <div style="overflow-x:auto; padding:10px;">
                    <table style="width:100%; border-collapse:separate; border-spacing:0; min-width:850px;">
                        <thead>
                            <tr style="background:#F1F5F9; color:#1E1B4B; font-size:0.95rem; font-weight:700;">
                                <th style="padding:14px 12px; border-bottom:2px solid #CBD5E1; text-align:center; width:90px;">${t.colPeriod || 'Période'}</th>
                                <th style="padding:14px 14px; border-bottom:2px solid #CBD5E1; text-align:${currentUserLanguage === 'ar' ? 'right' : 'left'}; width:200px;">${t.colSubjectTeacher || 'Matière & Enseignant'}</th>
                                <th style="padding:14px 14px; border-bottom:2px solid #CBD5E1; text-align:${currentUserLanguage === 'ar' ? 'right' : 'left'};">${t.colLesson || 'Leçon & Sujet'}</th>
                                <th style="padding:14px 14px; border-bottom:2px solid #CBD5E1; text-align:${currentUserLanguage === 'ar' ? 'right' : 'left'};">${t.colClassWork || 'Travail de classe'}</th>
                                <th style="padding:14px 14px; border-bottom:2px solid #CBD5E1; text-align:${currentUserLanguage === 'ar' ? 'right' : 'left'}; width:240px; background:#ECFDF5; color:#065F46;">
                                    <i class="fas fa-pen-fancy"></i> ${t.colHomework || 'Devoirs à la maison'}
                                </th>
                                <th style="padding:14px 12px; border-bottom:2px solid #CBD5E1; text-align:center; width:100px;">${t.colSupport || 'Supports'}</th>
                            </tr>
                        </thead>
                        <tbody>
        `;
        
        currentDayRows.forEach((row, idx) => {
            const period = getRowField(row, 'Période') || (idx + 1);
            const matiere = getRowField(row, 'Matière') || 'Matière';
            const enseignant = getRowField(row, 'Enseignant') || '';
            const lecon = getRowField(row, 'Leçon') || '';
            const travaux = getRowField(row, 'Travaux de classe') || '';
            const devoirs = getRowField(row, 'Devoirs') || '';
            const support = getRowField(row, 'Support') || '';
            
            const isLessonEmpty = !lecon || String(lecon).trim() === '';
            const isHomeworkEmpty = !devoirs || String(devoirs).trim() === '';
            const bgRow = (idx % 2 === 0) ? '#FFFFFF' : '#F8FAFC';
            
            tableHtml += `
                <tr style="background:${bgRow}; border-bottom:1px solid #E2E8F0; vertical-align:middle; transition:background 0.2s ease;">
                    <!-- Période -->
                    <td style="padding:16px 12px; border-bottom:1px solid #E2E8F0; text-align:center;">
                        <span style="background:#EEF2FF; color:#4338CA; font-weight:800; padding:6px 12px; border-radius:10px; font-size:0.95rem; display:inline-block;">
                            ${period}
                        </span>
                    </td>
                    
                    <!-- Matière & Enseignant -->
                    <td style="padding:16px 14px; border-bottom:1px solid #E2E8F0;">
                        <div style="font-weight:800; color:#1E1B4B; font-size:1.05rem; margin-bottom:4px;">${escapeHtml(matiere)}</div>
                        ${enseignant ? `
                            <button type="button" onclick="openContactTeacherModal('${escapeHtml(enseignant).replace(/'/g, "\\'")}')" class="teacher-direct-msg-btn" style="background:#EEF2FF; color:#4338CA; border:1px solid #C7D2FE; padding:4px 10px; border-radius:8px; font-size:0.82rem; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:5px; margin-top:2px;">
                                <i class="fas fa-chalkboard-teacher"></i>
                                <span>${escapeHtml(enseignant)}</span>
                                <span style="background:#4338CA; color:white; padding:1px 5px; border-radius:4px; font-size:0.75rem;">✉️</span>
                            </button>
                        ` : ''}
                    </td>
                    
                    <!-- Leçon / Sujet -->
                    <td style="padding:16px 14px; border-bottom:1px solid #E2E8F0; font-size:0.98rem; line-height:1.5; color:${isLessonEmpty ? '#94A3B8' : '#1E293B'}; font-weight:${isLessonEmpty ? '400' : '600'};">
                        ${isLessonEmpty ? `<i>${currentUserLanguage === 'ar' ? 'غير مسجل' : 'Non renseigné'}</i>` : escapeHtml(lecon)}
                    </td>
                    
                    <!-- Travaux de classe -->
                    <td style="padding:16px 14px; border-bottom:1px solid #E2E8F0; font-size:0.95rem; line-height:1.5; color:#334155;">
                        ${travaux && String(travaux).trim() !== '' ? escapeHtml(travaux) : `<span style="color:#94A3B8;">-</span>`}
                    </td>
                    
                    <!-- Devoirs à la maison -->
                    <td style="padding:16px 14px; border-bottom:1px solid #E2E8F0; background:${isHomeworkEmpty ? 'inherit' : '#F0FDF4'};">
                        <div style="font-size:0.98rem; font-weight:${isHomeworkEmpty ? '400' : '700'}; color:${isHomeworkEmpty ? '#94A3B8' : '#065F46'}; line-height:1.4;">
                            ${isHomeworkEmpty ? `<span style="color:#94A3B8;">${t.noHomework}</span>` : `<div style="display:flex; align-items:flex-start; gap:6px;"><i class="fas fa-check" style="color:#10B981; margin-top:4px;"></i> <span>${escapeHtml(devoirs)}</span></div>`}
                        </div>
                    </td>
                    
                    <!-- Support / Liens -->
                    <td style="padding:16px 12px; border-bottom:1px solid #E2E8F0; text-align:center;">
                        ${support && String(support).trim() !== '' ? `
                            <a href="${support.startsWith('http') ? support : 'http://' + support}" target="_blank" style="background:#EFF6FF; color:#2563EB; border:1px solid #BFDBFE; padding:6px 10px; border-radius:8px; font-size:0.85rem; font-weight:700; text-decoration:none; display:inline-flex; align-items:center; gap:4px;">
                                <i class="fas fa-external-link-alt"></i> <span>Ouvrir</span>
                            </a>
                        ` : `<span style="color:#CBD5E1;">-</span>`}
                    </td>
                </tr>
            `;
        });
        
        tableHtml += `
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }
    
    container.innerHTML = daysNavHtml + tableHtml;
}

// ----------------------------------------------------
// GESTION ADMIN DES JOURS SPÉCIAUX & PHOTOS (FUSION)
// ----------------------------------------------------

function populateAdminSpecialDaysForm() {
    const weekSelect = document.getElementById('specialDayWeek');
    if (weekSelect) {
        const curWeek = currentWeek || 1;
        weekSelect.innerHTML = '';
        for (let w = 1; w <= 40; w++) {
            const opt = document.createElement('option');
            opt.value = w;
            opt.textContent = `Semaine ${w}`;
            if (Number(w) === Number(curWeek)) opt.selected = true;
            weekSelect.appendChild(opt);
        }
        weekSelect.value = curWeek;
    }
    updateAdminSpecialDaysClassDropdown();
}

function updateAdminSpecialDaysClassDropdown() {
    const classSelect = document.getElementById('specialDayClass');
    const secSelect = document.getElementById('specialDaySection');
    if (!classSelect) return;
    const sec = secSelect ? secSelect.value : (currentSection || 'garcons');
    
    let classes = [];
    if (sec === 'garcons') {
        classes = ['PEI1', 'PEI2', 'PEI3', 'PEI4', 'PEI5', 'DP1', 'DP2'];
    } else if (sec === 'filles') {
        classes = ['PEI1', 'PEI2', 'PEI3', 'PEI4', 'PEI5', 'DP1', 'DP2'];
    } else {
        classes = ['PS', 'MS', 'GS', 'CP', 'CE1', 'CE2', 'CM1', 'CM2', '1P', '2P', '3P', '4P', '5P'];
    }

    let html = `<option value="ALL">🌟 Toutes les classes de la section</option>`;
    classes.forEach(c => {
        html += `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`;
    });
    classSelect.innerHTML = html;
}

async function loadAdminSpecialDaysList() {
    const container = document.getElementById('adminSpecialDaysListContainer');
    const tbody = document.getElementById('adminSpecialDaysTableBody');
    if (!container && !tbody) return;

    if (container) {
        container.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding:25px; color:#6B7280;"><i class="fas fa-spinner fa-spin fa-2x"></i><p style="margin-top:8px;">Chargement des journées fusionnées...</p></div>`;
    }

    try {
        const sectionEl = document.getElementById('specialDaySection');
        const section = (sectionEl ? sectionEl.value : currentSection) || 'garcons';
        const res = await fetch(`/api/special-days?section=${section}`);
        if (!res.ok) throw new Error('Erreur lors du chargement');
        const list = await res.json();

        if (!list || list.length === 0) {
            if (container) {
                container.innerHTML = `
                    <div style="grid-column:1/-1; text-align:center; padding:35px 20px; background:white; border-radius:14px; border:1px dashed #CBD5E1;">
                        <i class="fas fa-calendar-check fa-2x" style="color:#94A3B8; margin-bottom:8px;"></i>
                        <p style="color:#64748B; font-weight:600; margin:0;">Aucune journée fusionnée pour cette section.</p>
                    </div>
                `;
            }
            if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px; color:#9CA3AF;">Aucune fusion enregistrée.</td></tr>`;
            return;
        }

        if (container) {
            container.innerHTML = list.map(item => {
                const photoCount = (item.photos && item.photos.length) || 0;
                return `
                    <div style="background:white; border:1.5px solid #E2E8F0; border-radius:14px; padding:16px; box-shadow:0 2px 8px rgba(0,0,0,0.04); display:flex; flex-direction:column; justify-content:space-between;">
                        <div>
                            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:10px;">
                                <div>
                                    <span style="background:#EDE9FE; color:#6D28D9; font-weight:800; font-size:0.8rem; padding:3px 8px; border-radius:6px;">Semaine ${item.week}</span>
                                    <span style="background:#F1F5F9; color:#334155; font-weight:700; font-size:0.8rem; padding:3px 8px; border-radius:6px; margin-left:4px;">${escapeHtml(item.day)}</span>
                                </div>
                                <span style="background:#FEF2F2; color:#DC2626; font-size:0.75rem; font-weight:700; padding:2px 8px; border-radius:10px;">Pas de cours</span>
                            </div>
                            <h5 style="margin:0 0 6px 0; color:#1E1B4B; font-size:1.05rem; font-weight:800;">
                                ${escapeHtml(item.title)}
                            </h5>
                            <div style="font-size:0.85rem; color:#475569; margin-bottom:8px; line-height:1.4;">
                                ${escapeHtml(item.description || item.message || '')}
                            </div>
                            <div style="font-size:0.8rem; color:#64748B; margin-bottom:10px;">
                                <i class="fas fa-users"></i> Classe : <strong>${item.classe === 'ALL' || item.classe === 'all' ? 'Toutes les classes' : escapeHtml(item.classe)}</strong>
                            </div>
                            ${photoCount > 0 ? `
                                <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:12px;">
                                    ${item.photos.slice(0, 3).map(p => `
                                        <img src="${escapeHtml(p.url)}" alt="Photo" style="width:48px; height:48px; border-radius:6px; object-fit:cover; border:1px solid #CBD5E1;">
                                    `).join('')}
                                    ${photoCount > 3 ? `<span style="font-size:0.75rem; color:#6D28D9; font-weight:700; align-self:center;">+${photoCount - 3}</span>` : ''}
                                </div>
                            ` : ''}
                        </div>
                        <div style="display:flex; justify-content:flex-end; border-top:1px solid #F1F5F9; padding-top:10px;">
                            <button type="button" class="pro-button" onclick="deleteAdminSpecialDay('${item._id}')" style="background:#FEF2F2; color:#DC2626; border:1px solid #FECACA; padding:5px 12px; font-size:0.8rem; font-weight:700; border-radius:8px;">
                                <i class="fas fa-trash-alt"></i> Supprimer
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        }
    } catch (e) {
        console.error('Erreur loadAdminSpecialDaysList:', e);
        if (container) container.innerHTML = `<div style="grid-column:1/-1; color:#DC2626; padding:20px;">Erreur: ${e.message}</div>`;
    }
}

function handleSpecialDayPhotosSelected(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const reader = new FileReader();
        reader.onload = (event) => {
            adminSpecialPhotosList.push({
                url: event.target.result,
                caption: file.name.replace(/\.[^/.]+$/, "")
            });
            renderAdminSpecialPhotosPreview();
        };
        reader.readAsDataURL(file);
    }
}

function addSpecialDayPhotoFromUrl() {
    const input = document.getElementById('specialDayPhotoUrlInput') || document.getElementById('specialPhotoUrlInput');
    const url = input ? input.value.trim() : '';
    if (!url) return;

    adminSpecialPhotosList.push({
        url: url,
        caption: 'Photo'
    });
    if (input) input.value = '';
    renderAdminSpecialPhotosPreview();
}

function removeAdminSpecialPhoto(index) {
    adminSpecialPhotosList.splice(index, 1);
    renderAdminSpecialPhotosPreview();
}

function renderAdminSpecialPhotosPreview() {
    const container = document.getElementById('specialDayPhotosPreviewContainer') || document.getElementById('specialPhotosPreviewContainer');
    if (!container) return;

    if (adminSpecialPhotosList.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = adminSpecialPhotosList.map((p, idx) => `
        <div style="position:relative; width:100px; height:100px; border-radius:10px; overflow:hidden; border:2px solid #CBD5E1; background:#F8FAFC;">
            <img src="${escapeHtml(p.url)}" alt="Photo ${idx + 1}" style="width:100%; height:100%; object-fit:cover;">
            <button type="button" onclick="removeAdminSpecialPhoto(${idx})" style="position:absolute; top:3px; right:3px; background:rgba(220,38,38,0.85); color:white; border:none; border-radius:50%; width:22px; height:22px; display:flex; align-items:center; justify-content:center; font-size:0.75rem; cursor:pointer;">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('');
}

async function saveAdminSpecialDay() {
    const section = document.getElementById('specialDaySection')?.value || currentSection || 'garcons';
    const week = document.getElementById('specialDayWeek')?.value;
    const day = document.getElementById('specialDayDay')?.value || document.getElementById('specialDayJour')?.value;
    const classe = document.getElementById('specialDayClass')?.value || document.getElementById('specialDayClasse')?.value || 'ALL';
    const title = document.getElementById('specialDayTitle')?.value?.trim();
    const description = (document.getElementById('specialDayDescription') || document.getElementById('specialDayMessage'))?.value?.trim() || '';

    if (!week) {
        alert('Veuillez sélectionner la semaine cible.');
        return;
    }
    if (!day) {
        alert('Veuillez sélectionner le jour.');
        return;
    }
    if (!title) {
        alert('Veuillez renseigner le titre de l\'événement.');
        return;
    }

    const payload = {
        section: section,
        week: Number(week),
        day: day,
        classe: classe,
        type: 'no_courses',
        title: title,
        description: description,
        message: description,
        photos: adminSpecialPhotosList,
        isNoSchool: true
    };

    try {
        const res = await fetch('/api/special-days', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || "Erreur lors de l'enregistrement");
        }

        displayAlert('✅ Journée spéciale / fusion enregistrée avec succès !', false);
        adminSpecialPhotosList = [];
        renderAdminSpecialPhotosPreview();
        if (document.getElementById('specialDayTitle')) document.getElementById('specialDayTitle').value = '';
        if (document.getElementById('specialDayDescription')) document.getElementById('specialDayDescription').value = '';
        loadAdminSpecialDaysList();
        if (typeof loadParentWeeklyPlan === 'function') loadParentWeeklyPlan();
    } catch (e) {
        console.error('Erreur saveAdminSpecialDay:', e);
        alert('Erreur: ' + e.message);
    }
}

async function deleteAdminSpecialDay(id) {
    if (!confirm('Voulez-vous vraiment supprimer cette fusion de jour / journée spéciale ?')) return;

    try {
        const res = await fetch(`/api/special-days/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Erreur lors de la suppression');
        displayAlert('Fusion supprimée avec succès.', false);
        loadAdminSpecialDaysList();
        if (typeof loadParentWeeklyPlan === 'function') loadParentWeeklyPlan();
    } catch (e) {
        console.error('Erreur deleteAdminSpecialDay:', e);
        alert('Erreur: ' + e.message);
    }
}

// Quick Modal de fusion depuis la vue des parents ou le bouton rapide
function openSpecialDayQuickModal(day, classe) {
    const modal = document.getElementById('specialDayQuickModal');
    if (!modal) return;

    const curWeek = document.getElementById('parentWeekSelector')?.value || document.getElementById('weekSelector')?.value || (currentWeek || 1);
    const curSection = currentSection || 'garcons';
    const curDay = day || parentActiveDay || 'Dimanche';

    const sectionSelect = document.getElementById('quickSpecialSection');
    if (sectionSelect) {
        sectionSelect.value = curSection;
    }

    const weekSelect = document.getElementById('quickSpecialWeek');
    if (weekSelect) {
        weekSelect.innerHTML = '';
        for (let w = 1; w <= 40; w++) {
            const opt = document.createElement('option');
            opt.value = w;
            opt.textContent = `Semaine ${w}`;
            if (Number(w) === Number(curWeek)) opt.selected = true;
            weekSelect.appendChild(opt);
        }
        weekSelect.value = curWeek;
    }

    const daySelect = document.getElementById('quickSpecialDay');
    if (daySelect) {
        daySelect.value = curDay;
    }

    updateQuickSpecialClassesDropdown(classe);

    const titleInput = document.getElementById('quickSpecialTitle');
    const msgInput = document.getElementById('quickSpecialMessage') || document.getElementById('quickSpecialDesc');

    if (titleInput && (!titleInput.value || titleInput.value.startsWith('Pas de cours'))) {
        titleInput.value = 'Orientation';
    }
    if (msgInput && !msgInput.value) {
        msgInput.value = "La Direction & L'Equipe Pédagogique\nLes Écoles Internationales Al Kawthar";
    }

    quickSpecialPhotosList = [];
    renderQuickSpecialPhotosPreview();
    modal.style.display = 'flex';
}

function onQuickSpecialSectionChange() {
    updateQuickSpecialClassesDropdown();
}

function updateQuickSpecialClassesDropdown(targetClass) {
    const classSelect = document.getElementById('quickSpecialClass');
    if (!classSelect) return;
    const sec = document.getElementById('quickSpecialSection')?.value || currentSection || 'garcons';
    
    let classes = [];
    if (sec === 'garcons') {
        classes = ['PEI1', 'PEI2', 'PEI3', 'PEI4', 'PEI5', 'DP1', 'DP2'];
    } else if (sec === 'filles') {
        classes = ['PEI1', 'PEI2', 'PEI3', 'PEI4', 'PEI5', 'DP1', 'DP2'];
    } else {
        classes = ['PS', 'MS', 'GS', 'CP', 'CE1', 'CE2', 'CM1', 'CM2', '1P', '2P', '3P', '4P', '5P'];
    }

    let html = `<option value="ALL">🌟 Toutes les classes (${sec === 'garcons' ? 'Garçons' : (sec === 'filles' ? 'Filles' : 'Primaire')})</option>`;
    classes.forEach(c => {
        const isSel = (targetClass && String(targetClass).toLowerCase() === String(c).toLowerCase());
        html += `<option value="${escapeHtml(c)}" ${isSel ? 'selected' : ''}>${escapeHtml(c)}</option>`;
    });
    classSelect.innerHTML = html;
}

function closeSpecialDayQuickModal() {
    const modal = document.getElementById('specialDayQuickModal');
    if (modal) modal.style.display = 'none';
}

function handleQuickSpecialPhotosSelected(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const reader = new FileReader();
        reader.onload = (event) => {
            quickSpecialPhotosList.push({
                url: event.target.result,
                caption: file.name.replace(/\.[^/.]+$/, "")
            });
            renderQuickSpecialPhotosPreview();
        };
        reader.readAsDataURL(file);
    }
}

function removeQuickSpecialPhoto(index) {
    quickSpecialPhotosList.splice(index, 1);
    renderQuickSpecialPhotosPreview();
}

function renderQuickSpecialPhotosPreview() {
    const container = document.getElementById('quickSpecialPhotosPreview');
    if (!container) return;

    if (quickSpecialPhotosList.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = quickSpecialPhotosList.map((p, idx) => `
        <div style="position:relative; width:90px; height:90px; border-radius:10px; overflow:hidden; border:2px solid #CBD5E1; background:#F8FAFC;">
            <img src="${escapeHtml(p.url)}" alt="Photo ${idx + 1}" style="width:100%; height:100%; object-fit:cover;">
            <button type="button" onclick="removeQuickSpecialPhoto(${idx})" style="position:absolute; top:3px; right:3px; background:rgba(220,38,38,0.85); color:white; border:none; border-radius:50%; width:20px; height:20px; display:flex; align-items:center; justify-content:center; font-size:0.75rem; cursor:pointer;">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('');
}

async function saveQuickSpecialDay() {
    const section = document.getElementById('quickSpecialSection')?.value || currentSection || 'garcons';
    const week = document.getElementById('quickSpecialWeek')?.value;
    const day = document.getElementById('quickSpecialDay')?.value;
    const classe = document.getElementById('quickSpecialClass')?.value || 'ALL';
    const title = document.getElementById('quickSpecialTitle')?.value?.trim();
    const msgEl = document.getElementById('quickSpecialMessage') || document.getElementById('quickSpecialDesc');
    const message = msgEl ? msgEl.value.trim() : '';

    if (!week) {
        alert('Veuillez sélectionner la semaine.');
        return;
    }
    if (!day) {
        alert('Veuillez sélectionner le jour.');
        return;
    }
    if (!title) {
        alert("Veuillez renseigner le titre de l'événement.");
        return;
    }

    const payload = {
        section: section,
        week: Number(week),
        day: day,
        classe: classe,
        type: 'no_courses',
        title: title,
        description: message,
        message: message,
        photos: quickSpecialPhotosList,
        isNoSchool: true
    };

    try {
        const res = await fetch('/api/special-days', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || err.message || "Erreur lors de l'enregistrement");
        }

        displayAlert('✅ Journée fusionnée avec succès pour les parents !', false);
        closeSpecialDayQuickModal();
        if (typeof loadParentWeeklyPlan === 'function') loadParentWeeklyPlan();
        if (typeof loadAdminSpecialDaysList === 'function') loadAdminSpecialDaysList();
    } catch (e) {
        console.error('Erreur saveQuickSpecialDay:', e);
        alert('Erreur: ' + e.message);
    }
}

// Lightbox pour agrandir les photos des parents
function openImageLightbox(src, caption) {
    let lightbox = document.getElementById('appImageLightbox');
    if (!lightbox) {
        lightbox = document.createElement('div');
        lightbox.id = 'appImageLightbox';
        lightbox.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.85); display:flex; flex-direction:column; align-items:center; justify-content:center; z-index:99999; padding:20px; box-sizing:border-box;';
        lightbox.innerHTML = `
            <div style="position:relative; max-width:90vw; max-height:85vh; text-align:center;">
                <button type="button" onclick="closeImageLightbox()" style="position:absolute; top:-40px; right:0; background:white; color:#1E1B4B; border:none; width:36px; height:36px; border-radius:50%; font-size:1.2rem; cursor:pointer; font-weight:800; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 12px rgba(0,0,0,0.3);">✕</button>
                <img id="lightboxImg" src="" alt="Photo" style="max-width:100%; max-height:75vh; border-radius:12px; box-shadow:0 8px 30px rgba(0,0,0,0.5); object-fit:contain;">
                <div id="lightboxCaption" style="color:white; font-size:1.1rem; font-weight:700; margin-top:14px; text-shadow:0 2px 4px rgba(0,0,0,0.8);"></div>
            </div>
        `;
        document.body.appendChild(lightbox);
        lightbox.onclick = (e) => {
            if (e.target === lightbox) closeImageLightbox();
        };
    }
    const imgEl = document.getElementById('lightboxImg');
    const capEl = document.getElementById('lightboxCaption');
    if (imgEl) imgEl.src = src;
    if (capEl) capEl.textContent = caption || '';
    lightbox.style.display = 'flex';
}

function closeImageLightbox() {
    const lightbox = document.getElementById('appImageLightbox');
    if (lightbox) lightbox.style.display = 'none';
}

function filterParentPlanByDay() {
    const classSelect = document.getElementById('parentClassSelector');
    if (!classSelect || !parentRawPlanData) return;
    
    const selectedClass = classSelect.value || 'PEI1';
    const norm = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();
    const classRows = parentRawPlanData.filter(row => {
        const classVal = getRowField(row, 'Classe');
        return classVal && norm(classVal) === norm(selectedClass);
    });
    
    renderParentPlanCards(classRows);
}

function setHomeworkLanguage(lang) {
    homeworkLang = lang;
    displayAlert(lang === 'fr' ? 'Langue changée en Français' : 'تم تغيير اللغة إلى العربية', false);
    if (selectedStudentObj) {
        openStudentDashboard(selectedStudentObj.name, selectedStudentObj.class);
    }
}

// Cache client et jetons de synchronisation pour garantir une réactivité instantanée sans aucun décalage ni mélange
const studentsClientCache = new Map();
let activeClassFetchSeq = 0;
let currentActiveClassName = 'PEI1';

function renderStudentsGrid(students, className, section) {
    const grid = document.getElementById('students-grid');
    if (!grid) return;
    
    const secLabel = section === 'garcons' ? 'Garçons 👦' : (section === 'primaire' ? 'Primaire & Maternelle 👶🎒' : 'Filles 👧');
    const borderColor = section === 'garcons' ? '#3B82F6' : (section === 'primaire' ? '#10B981' : '#EC4899');
    
    if (!students || students.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align:center; padding:40px 20px; background:white; border-radius:16px; color:#6B7280; font-weight:600; border:1px dashed #CBD5E1; max-width:480px; margin:20px auto;">
                <i class="fas fa-user-slash fa-2x" style="display:block; margin-bottom:12px; color:#9CA3AF;"></i>
                <p style="margin:0; font-size:1rem;">${currentUserLanguage === 'ar' ? `لا يوجد طلاب مسجلين في قسم ${className}` : `Aucun élève enregistré pour la classe ${className} (${secLabel}).`}</p>
            </div>
        `;
        return;
    }

    const fallbackAvatar = getStudentFallbackAvatar(section);
    grid.innerHTML = students.map(s => {
        const photoSrc = (s.photo && s.photo.trim() !== '') ? s.photo : fallbackAvatar;
        return `
            <div class="student-card-item teacher-contact-card" onclick="openStudentDashboard('${escapeHtml(s.name).replace(/'/g, "\\'")}', '${className}')" style="background:white; border-radius:18px; padding:22px 18px; text-align:center; cursor:pointer; box-shadow:0 4px 18px rgba(0,0,0,0.06); border:2px solid #F1F5F9; transition:all 0.25s ease; display:flex; flex-direction:column; align-items:center; justify-content:center; width:100%; max-width:220px; will-change:transform;">
                <div style="position:relative; width:96px; height:96px; margin:0 auto 12px auto; overflow:hidden; border-radius:50%;">
                    <img src="${photoSrc}" loading="lazy" decoding="async" class="student-profile-avatar teacher-contact-photo" alt="${escapeHtml(s.name)}" onerror="this.onerror=null; this.src='${fallbackAvatar}';" style="width:96px; height:96px; border-radius:50%; object-fit:cover; border:3px solid ${borderColor}; background:#F8FAFC; display:block; margin:0 auto;">
                </div>
                <h4 style="margin:6px 0 4px 0; color:#1E1B4B; font-size:1.05rem; font-weight:700; line-height:1.3; text-align:center;">${escapeHtml(s.name)}</h4>
                <span style="font-size:0.85rem; font-weight:600; color:#6B7280; background:#F1F5F9; padding:3px 10px; border-radius:12px; margin-top:4px;">${s.birthday ? '🎂 ' + s.birthday : className}</span>
            </div>
        `;
    }).join('');
}

async function loadClassStudents(className) {
    try {
        const section = currentSection || 'garcons';
        currentActiveClassName = className;
        const mySeq = ++activeClassFetchSeq;

        // Mettre à jour l'état actif des boutons de classe immédiatement
        const classBtns = document.querySelectorAll('#parent-class-buttons button');
        classBtns.forEach(btn => {
            const btnClassMatch = btn.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
            if (btnClassMatch === className) {
                btn.classList.add('primary-button', 'active');
            } else {
                btn.classList.remove('primary-button', 'active');
            }
        });

        const cacheKey = `${section}_${className}`;
        
        // Si les données sont déjà en mémoire, les afficher instantanément (0ms de latence)
        if (studentsClientCache.has(cacheKey)) {
            renderStudentsGrid(studentsClientCache.get(cacheKey), className, section);
            return;
        }

        const grid = document.getElementById('students-grid');
        if (grid) {
            grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding:40px; color:#64748B; font-size:1rem;"><i class="fas fa-circle-notch fa-spin fa-2x" style="color:#3B82F6; margin-bottom:10px; display:block;"></i> Chargement...</div>';
        }

        const res = await fetch(`/api/admin/students?class=${className}&section=${section}`);
        if (res.ok) {
            const students = await res.json();
            // Ignorer si une autre classe a été sélectionnée entre temps
            if (mySeq !== activeClassFetchSeq || currentSection !== section || currentActiveClassName !== className) {
                return;
            }
            studentsClientCache.set(cacheKey, students);
            renderStudentsGrid(students, className, section);
        }
    } catch (e) {
        console.error('Erreur loadClassStudents:', e);
    }
}

async function loadHomeworkShowcase() {
    try {
        const section = currentSection || 'garcons';

        // Lancement en parallèle non bloquant avec Promise.allSettled
        Promise.allSettled([
            fetch(`/api/weekly-summary?section=${section}`).then(r => r.ok ? r.json() : null),
            fetch(`/api/photo-of-the-day?section=${section}`).then(r => r.ok ? r.json() : null),
            fetch(`/api/photo-2?section=${section}`).then(r => r.ok ? r.json() : null),
            fetch(`/api/photo-3?section=${section}`).then(r => r.ok ? r.json() : null)
        ]).then(([sotwRes, p1Res, p2Res, p3Res]) => {
            // Élève de la semaine
            const sotwEl = document.getElementById('sotw-content');
            if (sotwEl && sotwRes.status === 'fulfilled' && sotwRes.value) {
                const data = sotwRes.value;
                if (data.studentsOfWeek && data.studentsOfWeek.length > 0) {
                    const st = data.studentsOfWeek[0];
                    sotwEl.innerHTML = `
                        <div style="background:white; padding:15px; border-radius:12px; display:inline-block; box-shadow:0 4px 10px rgba(0,0,0,0.05);">
                            <h4 style="margin:0; color:#667eea; font-size:1.2rem;">${escapeHtml(st.name)}</h4>
                            <p style="margin:5px 0; color:#6B7280; font-weight:600;">Classe: ${escapeHtml(st.class)}</p>
                            <p style="margin:0; color:#F59E0B; font-weight:bold;"><i class="fas fa-star"></i> ${st.stars} Étoiles cette semaine</p>
                        </div>
                    `;
                } else {
                    sotwEl.innerHTML = '<p style="color:#6B7280;">Aucun élève de la semaine sélectionné pour le moment.</p>';
                }
            }

            // Photos
            const el1 = document.getElementById('potd-content');
            if (el1 && p1Res.status === 'fulfilled' && p1Res.value) {
                const p1 = p1Res.value;
                el1.innerHTML = p1.url ? `<img src="${p1.url}" loading="lazy" class="potd-image"><p style="font-size:0.9em; font-weight:600; color:#374151;">${escapeHtml(p1.comment || '')}</p>` : '<p style="color:#9CA3AF;">Pas de photo enregistrée.</p>';
            }

            const el2 = document.getElementById('photo2-content');
            if (el2 && p2Res.status === 'fulfilled' && p2Res.value) {
                const p2 = p2Res.value;
                el2.innerHTML = p2.url ? `<img src="${p2.url}" loading="lazy" class="potd-image"><p style="font-size:0.9em; font-weight:600; color:#374151;">${escapeHtml(p2.comment || '')}</p>` : '<p style="color:#9CA3AF;">Pas de photo enregistrée.</p>';
            }

            const el3 = document.getElementById('photo3-content');
            if (el3 && p3Res.status === 'fulfilled' && p3Res.value) {
                const p3 = p3Res.value;
                el3.innerHTML = p3.url ? `<img src="${p3.url}" loading="lazy" class="potd-image"><p style="font-size:0.9em; font-weight:600; color:#374151;">${escapeHtml(p3.comment || '')}</p>` : '<p style="color:#9CA3AF;">Pas de photo enregistrée.</p>';
            }
        });
    } catch (e) {
        console.error('Erreur loadHomeworkShowcase:', e);
    }
}

async function openStudentDashboard(studentName, className) {
    try {
        selectedStudentObj = { name: studentName, class: className };
        showHomeworkView('student-dashboard');

        const section = currentSection || 'garcons';
        const fallbackAvatar = getStudentFallbackAvatar(section);
        const nameEl = document.getElementById('student-profile-name');
        const detailsEl = document.getElementById('student-profile-details');
        const photoEl = document.getElementById('student-profile-photo');

        if (nameEl) nameEl.innerText = studentName;
        if (detailsEl) detailsEl.innerText = `Classe : ${className} | Section : ${section === 'garcons' ? 'Garçons 👦' : (section === 'primaire' ? 'Primaire & Maternelle 👶🎒' : 'Filles 👧')}`;
        if (photoEl) {
            photoEl.src = fallbackAvatar;
            photoEl.onerror = function() { this.src = fallbackAvatar; };
        }

        // Récupérer photo réelle si disponible
        const stRes = await fetch(`/api/admin/students?class=${className}&section=${section}`);
        if (stRes.ok) {
            const stList = await stRes.json();
            const matched = stList.find(s => s.name === studentName);
            if (matched && matched.photo && matched.photo.trim() !== '') {
                if (photoEl) photoEl.src = matched.photo;
            }
        }

        // Récupérer étoiles
        const starRes = await fetch(`/api/daily-stars?studentName=${encodeURIComponent(studentName)}&className=${className}&section=${section}&week=true`);
        let starCount = 0;
        if (starRes.ok) {
            const sData = await starRes.json();
            if (sData.stars && Array.isArray(sData.stars)) {
                starCount = sData.stars.reduce((acc, curr) => acc + (curr.earnedStar || 0), 0);
            }
        }
        document.getElementById('student-stars-count').innerHTML = `<i class="fas fa-star"></i> ${starCount} Étoile(s)`;

        // Évaluations 8 semaines
        loadGeneralEvaluations(studentName, className);

        // Devoirs du jour (Date du jour par défaut)
        currentHomeworkDate = new Date().toISOString().split('T')[0];
        loadStudentHomeworksForDate(studentName, className, currentHomeworkDate);
    } catch (e) {
        console.error('Erreur openStudentDashboard:', e);
    }
}

async function loadStudentHomeworksForDate(studentName, className, dateStr) {
    try {
        currentHomeworkDate = dateStr;
        const section = currentSection || 'garcons';
        document.getElementById('current-homework-date-display').innerHTML = `<i class="fas fa-calendar-day"></i> ${dateStr}`;

        const grid = document.getElementById('homework-items-grid');
        if (grid) grid.innerHTML = '<p style="grid-column: 1/-1;">Chargement des devoirs...</p>';

        const res = await fetch(`/api/evaluations?class=${className}&student=${encodeURIComponent(studentName)}&date=${dateStr}&section=${section}`);
        if (res.ok) {
            const data = await res.json();
            const { homeworks = [], evaluations = [] } = data;

            if (homeworks.length === 0) {
                grid.innerHTML = `
                    <div style="grid-column: 1/-1; background:white; padding:20px; border-radius:12px; text-align:center; color:#6B7280;">
                        <i class="fas fa-check-circle" style="font-size:2rem; color:#10B981; margin-bottom:10px;"></i>
                        <p>Aucun devoir renseigné pour cette date (${dateStr}).</p>
                    </div>
                `;
                return;
            }

            grid.innerHTML = homeworks.map((hw, idx) => {
                const ev = evaluations.find(e => e.subject === hw.subject) || {};
                const status = ev.status || 'Non Fait';
                const statusClass = status.toLowerCase().replace(/\s+/g, '-');
                const pVal = ev.participation || 0;
                const bVal = ev.behavior || 0;
                const comment = ev.comment || '';

                return `
                    <div style="background:white; border-radius:16px; padding:20px; box-shadow:0 4px 15px rgba(0,0,0,0.05); position:relative;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                            <span style="font-weight:bold; color:#667eea; font-size:1.1rem;"><i class="fas fa-book"></i> ${hw.subject}</span>
                            <div class="status-container">
                                <span class="status-text ${statusClass}">${status}</span>
                                <div class="status-lamp ${statusClass}"></div>
                            </div>
                        </div>
                        <p style="margin:10px 0; font-size:0.95rem; color:#1F2937; background:#F9FAFB; padding:10px; border-radius:8px; border-left:4px solid #667eea;">
                            <strong>Devoir :</strong> ${hw.assignment || 'Aucun devoir'}
                        </p>
                        <div style="display:flex; gap:15px; font-size:0.85em; color:#4B5563; margin-bottom:10px;">
                            <span><i class="fas fa-hands"></i> Participation: <strong>${pVal}/10</strong></span>
                            <span><i class="fas fa-user-check"></i> Comportement: <strong>${bVal}/10</strong></span>
                        </div>
                        ${comment ? `
                            <div style="font-size:0.85em; color:#374151; background:#FFFBEB; padding:8px 10px; border-radius:6px; margin-top:8px;" id="comm-box-${idx}">
                                <strong>Remarque Enseignant :</strong> <span id="comm-text-${idx}">${comment}</span>
                                <button type="button" onclick="translateHomeworkComment('comm-text-${idx}', '${comment.replace(/'/g, "\\'")}')" style="margin-left:8px; background:none; border:none; color:#0066CC; cursor:pointer; font-weight:bold;">
                                    🌐 Traduire
                                </button>
                            </div>
                        ` : ''}
                    </div>
                `;
            }).join('');
        }
    } catch (e) {
        console.error('Erreur loadStudentHomeworksForDate:', e);
    }
}

async function translateHomeworkComment(elementId, originalText) {
    try {
        const el = document.getElementById(elementId);
        if (!el) return;
        const targetLang = (homeworkLang === 'fr') ? 'ar' : 'fr';
        const res = await fetch('/api/translate-text', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: originalText, targetLang })
        });
        if (res.ok) {
            const data = await res.json();
            el.innerText = data.translatedText || originalText;
        }
    } catch (e) {
        console.error('Erreur translation:', e);
    }
}

function changeHomeworkDate(offsetDays) {
    if (!selectedStudentObj) return;
    const curr = new Date(currentHomeworkDate);
    curr.setDate(curr.getDate() + offsetDays);
    const newDateStr = curr.toISOString().split('T')[0];
    loadStudentHomeworksForDate(selectedStudentObj.name, selectedStudentObj.class, newDateStr);
}

async function loadGeneralEvaluations(studentName, className) {
    try {
        const section = currentSection || 'garcons';
        const container = document.getElementById('general-evaluations-container');
        if (!container) return;

        const res = await fetch(`/api/general-evaluations?section=${section}`);
        if (res.ok) {
            const data = await res.json();
            const studentData = data.find(d => d.student === studentName && d.classe === className);
            if (!studentData) {
                container.innerHTML = '';
                return;
            }

            const maxPB = studentData.maxPB || 20;
            const pbScore = studentData.participationBehaviorScore || 0;
            const hwScore = studentData.homeworkScore || 0;
            const totalScore = studentData.totalScore || 0;
            const totalMax = studentData.totalMax || 40;

            container.innerHTML = `
                <div class="gec-card">
                    <div class="gec-header">
                        <span class="gec-title"><i class="fas fa-chart-line"></i> Évaluation Générale (Dernières Semaines)</span>
                    </div>
                    <div class="gec-global-summary">
                        <span><strong>Participation & Comportement :</strong> ${pbScore} / ${maxPB}</span>
                        <span><strong>Devoirs à domicile :</strong> ${hwScore} / 20</span>
                        <span><strong>Total :</strong> <strong style="color:#10B981;">${totalScore} / ${totalMax}</strong></span>
                    </div>
                </div>
            `;
        }
    } catch (e) {
        console.error('Erreur loadGeneralEvaluations:', e);
    }
}

// ============================================================================
// GESTION DES ÉLÈVES PAR L'ADMIN (ADMINISTRATION DEVOIRS & DÉPLACEMENT)
// ============================================================================

async function loadAdminStudentsList() {
    try {
        const classFilterEl = document.getElementById('adminStudentClassFilter');
        const className = classFilterEl ? classFilterEl.value : 'all';
        const section = document.getElementById('adminStudentSectionFilter')?.value || 'garcons';
        const container = document.getElementById('studentsTableContainer');
        const quickSelector = document.getElementById('adminMoveStudentSelector');
        if (!container) return;

        container.innerHTML = '<p style="color:#64748B; padding:12px;"><i class="fas fa-spinner fa-spin"></i> Chargement des élèves...</p>';

        // 1. Récupérer la liste complète des élèves pour la section (pour alimenter le sélecteur rapide de déplacement)
        const allRes = await fetch(`/api/admin/students?section=${section}`);
        let allStudents = [];
        if (allRes.ok) {
            allStudents = await allRes.json();
        }

        if (quickSelector) {
            if (allStudents && allStudents.length > 0) {
                quickSelector.innerHTML = '<option value="">-- Choisir un élève à déplacer --</option>' +
                    allStudents.map(s => `<option value="${s._id || s.name}" data-name="${s.name}" data-class="${s.class}">${s.name} (${s.class})</option>`).join('');
            } else {
                quickSelector.innerHTML = '<option value="">-- Aucun élève enregistré --</option>';
            }
        }

        // 2. Filtrer les élèves selon la classe sélectionnée
        let studentsToDisplay = allStudents;
        if (className && className !== 'all') {
            studentsToDisplay = allStudents.filter(s => s.class === className);
        }

        const secLabel = section === 'garcons' ? 'Section Garçons 👦' : (section === 'primaire' ? 'Section Primaire & Maternelle 👶🎒' : 'Section Filles 👧');
        if (!studentsToDisplay || studentsToDisplay.length === 0) {
            const classLabel = className === 'all' ? 'Toutes les classes' : className;
            container.innerHTML = `<p style="color:#64748B; padding:15px; background:#F8FAFC; border-radius:8px; border:1px solid #E2E8F0;">
                <i class="fas fa-info-circle"></i> Aucun élève trouvé pour <strong>${classLabel}</strong> (${secLabel}).
            </p>`;
            return;
        }

        const secClasses = getSectionClasses(section);
        const allClasses = secClasses.map(cls => ({
            id: cls,
            label: getClassLabel(cls)
        }));

        const moveTargetClassSelect = document.getElementById('adminMoveTargetClass');
        if (moveTargetClassSelect) {
            const curMoveVal = moveTargetClassSelect.value;
            moveTargetClassSelect.innerHTML = '<option value="">-- Choisir la nouvelle classe --</option>' +
                allClasses.map(c => `<option value="${c.id}">${c.label}</option>`).join('');
            if (curMoveVal && secClasses.includes(curMoveVal)) {
                moveTargetClassSelect.value = curMoveVal;
            }
        }

        container.innerHTML = `
            <div style="margin-bottom:8px; font-size:0.85rem; color:#475569;">
                Total affiché : <strong>${studentsToDisplay.length}</strong> élève(s)
            </div>
            <table class="users-table">
                <thead>
                    <tr>
                        <th style="width:60px;">Photo</th>
                        <th>Nom de l'élève</th>
                        <th>Classe actuelle</th>
                        <th>Anniversaire</th>
                        <th>Déplacer vers une autre classe</th>
                        <th style="width:60px;">Action</th>
                    </tr>
                </thead>
                <tbody>
                    ${studentsToDisplay.map((s, idx) => {
                        const safeId = `row_${idx}_` + (s._id || s.name).replace(/[^a-zA-Z0-9_-]/g, '_');
                        const escapedName = (s.name || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
                        return `
                        <tr>
                            <td>
                                <img src="${s.photo || 'https://via.placeholder.com/40'}" 
                                     style="width:40px; height:40px; border-radius:50%; object-fit:cover; border:1px solid #CBD5E1;" 
                                     onerror="this.src='https://via.placeholder.com/40'">
                            </td>
                            <td><strong>${s.name}</strong></td>
                            <td>
                                <span style="background:#E0E7FF; color:#3730A3; padding:4px 10px; border-radius:6px; font-weight:700; font-size:0.85rem; display:inline-block;">
                                    ${s.class}
                                </span>
                            </td>
                            <td>${s.birthday || '-'}</td>
                            <td>
                                <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                                    <select id="moveClass_${safeId}" class="move-student-select" style="padding:6px 10px; border-radius:6px; border:1px solid #CBD5E1; font-weight:600;">
                                        ${allClasses.map(c => `<option value="${c.id}" ${c.id === s.class ? 'selected' : ''}>${c.label}</option>`).join('')}
                                    </select>
                                    <button type="button" class="btn-sm-move" style="background:#2563EB; color:white; border:none; border-radius:6px; padding:6px 12px; cursor:pointer; font-weight:600; display:inline-flex; align-items:center; gap:5px;" onclick="adminMoveStudent('${s._id || ''}', '${escapedName}', '${s.class}', 'moveClass_${safeId}')">
                                        <i class="fas fa-exchange-alt"></i> Déplacer
                                    </button>
                                </div>
                            </td>
                            <td>
                                <button class="btn-sm-delete" style="background:#EF4444; color:white; border:none; border-radius:6px; padding:6px 10px; cursor:pointer;" onclick="adminDeleteStudent('${s._id || ''}', '${escapedName}', '${s.class}')" title="Supprimer l'élève">
                                    <i class="fas fa-trash-alt"></i>
                                </button>
                            </td>
                        </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
    } catch (e) {
        console.error('Erreur loadAdminStudentsList:', e);
    }
}

async function adminMoveStudent(studentId, studentName, oldClass, selectElementId) {
    try {
        const selectEl = document.getElementById(selectElementId);
        const newClass = selectEl ? selectEl.value : null;
        const section = document.getElementById('adminStudentSectionFilter')?.value || 'garcons';
        const statusEl = document.getElementById('adminStudentStatus');

        if (!newClass) {
            alert("Veuillez choisir une nouvelle classe.");
            return;
        }

        if (newClass === oldClass) {
            alert(`L'élève '${studentName}' est déjà dans la classe ${oldClass}.`);
            return;
        }

        if (!confirm(`Confirmer le déplacement de l'élève '${studentName}' de ${oldClass} vers ${newClass} ?`)) {
            return;
        }

        if (statusEl) statusEl.innerHTML = `<span style="color:#2563EB;"><i class="fas fa-spinner fa-spin"></i> Déplacement en cours de ${studentName} vers ${newClass}...</span>`;

        const res = await fetch('/api/admin/students/move', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                studentId,
                studentName,
                name: studentName,
                oldClass,
                newClass,
                section
            })
        });

        const result = await res.json().catch(() => ({}));
        if (res.ok && (result.success || result.student || !result.error)) {
            const successMsg = result.message || `Élève '${studentName}' déplacé avec succès de ${oldClass} vers ${newClass} !`;
            if (statusEl) statusEl.innerHTML = `<span style="color:#16A34A; font-weight:700;"><i class="fas fa-check-circle"></i> ${successMsg}</span>`;
            displayAlert(successMsg, false);
            await loadAdminStudentsList();
        } else {
            const err = result.error || result.message || 'Erreur lors du déplacement de l\'élève.';
            if (statusEl) statusEl.innerHTML = `<span style="color:#DC2626; font-weight:700;"><i class="fas fa-exclamation-triangle"></i> ${err}</span>`;
            alert(`Erreur: ${err}`);
        }
    } catch (e) {
        console.error('Erreur adminMoveStudent:', e);
        alert('Erreur réseau lors du déplacement de l\'élève.');
    }
}

async function adminQuickMoveStudent() {
    try {
        const quickSelector = document.getElementById('adminMoveStudentSelector');
        const targetClassSelect = document.getElementById('adminMoveTargetClass');
        const section = document.getElementById('adminStudentSectionFilter')?.value || 'garcons';
        const statusEl = document.getElementById('adminStudentStatus');

        if (!quickSelector || !quickSelector.value) {
            alert("Veuillez sélectionner un élève à déplacer.");
            return;
        }

        const selectedOption = quickSelector.options[quickSelector.selectedIndex];
        const studentId = quickSelector.value;
        const studentName = selectedOption.getAttribute('data-name') || studentId;
        const oldClass = selectedOption.getAttribute('data-class') || '';
        const newClass = targetClassSelect ? targetClassSelect.value : null;

        if (!newClass) {
            alert("Veuillez sélectionner une classe de destination.");
            return;
        }

        if (oldClass && newClass === oldClass) {
            alert(`L'élève '${studentName}' est déjà dans la classe ${oldClass}.`);
            return;
        }

        if (!confirm(`Confirmer le déplacement de l'élève '${studentName}' ${oldClass ? 'de ' + oldClass + ' ' : ''}vers ${newClass} ?`)) {
            return;
        }

        if (statusEl) statusEl.innerHTML = `<span style="color:#2563EB;"><i class="fas fa-spinner fa-spin"></i> Déplacement en cours de ${studentName} vers ${newClass}...</span>`;

        const res = await fetch('/api/admin/students/move', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                studentId,
                studentName,
                name: studentName,
                oldClass,
                newClass,
                section
            })
        });

        const result = await res.json().catch(() => ({}));
        if (res.ok && (result.success || result.student || !result.error)) {
            const successMsg = result.message || `Élève '${studentName}' déplacé avec succès vers ${newClass} !`;
            if (statusEl) statusEl.innerHTML = `<span style="color:#16A34A; font-weight:700;"><i class="fas fa-check-circle"></i> ${successMsg}</span>`;
            displayAlert(successMsg, false);
            await loadAdminStudentsList();
        } else {
            const err = result.error || result.message || 'Erreur lors du déplacement de l\'élève.';
            if (statusEl) statusEl.innerHTML = `<span style="color:#DC2626; font-weight:700;"><i class="fas fa-exclamation-triangle"></i> ${err}</span>`;
            alert(`Erreur: ${err}`);
        }
    } catch (e) {
        console.error('Erreur adminQuickMoveStudent:', e);
        alert('Erreur réseau lors du déplacement de l\'élève.');
    }
}

async function adminAddOrUpdateStudent() {
    try {
        const name = document.getElementById('adminStudentName')?.value;
        const photo = document.getElementById('adminStudentPhoto')?.value;
        const birthday = document.getElementById('adminStudentBirthday')?.value;
        const className = document.getElementById('adminStudentClassFilter')?.value || 'PEI1';
        const section = document.getElementById('adminStudentSectionFilter')?.value || 'garcons';
        const statusEl = document.getElementById('adminStudentStatus');

        if (!name) {
            if (statusEl) statusEl.innerHTML = '<span style="color:red;">Le nom de l\'élève est obligatoire.</span>';
            return;
        }

        const res = await fetch('/api/admin/students', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, photo, birthday, class: className, section })
        });

        if (res.ok) {
            if (statusEl) statusEl.innerHTML = '<span style="color:green;">Élève enregistré avec succès.</span>';
            document.getElementById('adminStudentName').value = '';
            document.getElementById('adminStudentPhoto').value = '';
            document.getElementById('adminStudentBirthday').value = '';
            loadAdminStudentsList();
        } else {
            if (statusEl) statusEl.innerHTML = '<span style="color:red;">Erreur lors de l\'enregistrement.</span>';
        }
    } catch (e) {
        console.error('Erreur adminAddOrUpdateStudent:', e);
    }
}

async function adminDeleteStudent(id, name, className) {
    if (!confirm(`Voulez-vous vraiment supprimer l'élève '${name}' ?`)) return;
    try {
        const section = document.getElementById('adminStudentSectionFilter')?.value || 'garcons';
        const res = await fetch('/api/admin/students', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, name, class: className, section })
        });
        if (res.ok) {
            displayAlert(`Élève ${name} supprimé.`, false);
            loadAdminStudentsList();
        }
    } catch (e) {
        console.error('Erreur adminDeleteStudent:', e);
    }
}

async function adminSavePhoto(photoNum) {
    try {
        const section = document.getElementById('adminStudentSectionFilter')?.value || 'garcons';
        const urlInput = document.getElementById(`adminPhoto${photoNum}Url`);
        const commentInput = document.getElementById(`adminPhoto${photoNum}Comment`);
        if (!urlInput || !urlInput.value) {
            alert('Veuillez entrer une URL d\'image validée.');
            return;
        }

        const endpoint = photoNum === 1 ? '/api/photo-of-the-day' : (photoNum === 2 ? '/api/photo-2' : '/api/photo-3');
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageUrl: urlInput.value, comment: commentInput.value, section })
        });

        if (res.ok) {
            alert(`Photo ${photoNum} enregistrée avec succès !`);
            urlInput.value = '';
            commentInput.value = '';
            loadHomeworkShowcase();
        }
    } catch (e) {
        console.error('Erreur adminSavePhoto:', e);
    }
}

// ============================================================================
// BILINGUAL PARENT SPACE ENGINE & TEACHER CONTACT UTILS
// ============================================================================

currentUserLanguage = localStorage.getItem('parentLanguage') || 'fr';

const parentI18n = {
    fr: {
        langBtn: 'العربية 🇸🇦',
        homeBtn: 'Accueil',
        parentPlanTitle: 'Plan Hebdomadaire',
        studentFollowBtn: 'Suivi Élève & Contact',
        tabStudents: '1. Suivi Élèves & Devoirs',
        tabPlan: '2. Plan Hebdomadaire',
        tabTeachers: '3. Contacter Enseignants',
        tabPhotos: '4. Célébrations & Photos',
        filterWeek: 'Semaine :',
        filterClass: 'Classe :',
        filterDay: 'Jour :',
        allDays: 'Tous les jours de la semaine',
        contactTeachersTitle: 'Contacter les Enseignants',
        parentContactsHeader: 'Espace Parents - Contacter les Enseignants',
        parentPhotosHeader: 'Espace Parents - Célébrations & Photos',
        parentAuthBtn: 'Connexion / Inscription Parent',
        contactTeachersDesc: 'Cliquez sur n\'importe quel enseignant ci-dessous pour lui envoyer directement un message concernant votre enfant.',
        sendMessageBtn: 'Envoyer message',
        backToPlan: 'Plan Hebdomadaire',
        parentTitle: 'Espace Parents - Suivi des Élèves',
        selectClass: 'Sélectionner la classe :',
        backToStudents: 'Retour aux élèves',
        prevDay: 'Jour Précédent',
        nextDay: 'Jour Suivant',
        contactModalHeading: 'Contacter l\'enseignant',
        parentNameLabel: 'Votre nom (Parent) :',
        parentPhoneLabel: 'Numéro de téléphone (optionnel) :',
        messageLabel: 'Votre message :',
        sendMsgBtn: 'Envoyer le message',
        cancelBtn: 'Fermer',
        msgSentSuccess: 'Votre message a été envoyé avec succès à l\'enseignant !',
        msgEmptyErr: 'Veuillez saisir votre message avant d\'envoyer.',
        lessonTopic: 'Leçon / Sujet :',
        classWork: 'Travail de classe :',
        homeWork: 'Devoirs à la maison :',
        noHomework: 'Aucun devoir à la maison pour ce cours',
        supportLinks: 'Support :',
        periodLabel: 'Période',
        sessionsCount: 'Séance(s)',
        loadingPlan: 'Chargement du plan hebdomadaire...',
        noCoursesFound: 'Aucun cours enregistré pour cette sélection.',
        planCompletedTitle: 'Plan Hebdomadaire Officiel - Saisie terminée ✅',
        planCompletedDesc: 'Tous les enseignants ont finalisé la préparation des cours pour cette classe.',
        planInProgressTitle: 'Plan Hebdomadaire en cours de finalisation ⏳',
        planInProgressDesc: 'L\'équipe pédagogique finalise actuellement la saisie. Les cours préparés sont affichés ci-dessous.',
        noPlanPublished: 'Aucun plan publié pour cette classe.',
        daysMap: {
            "Dimanche": "Dimanche",
            "Lundi": "Lundi",
            "Mardi": "Mardi",
            "Mercredi": "Mercredi",
            "Jeudi": "Jeudi"
        }
    },
    ar: {
        langBtn: 'Français 🇫🇷',
        homeBtn: 'الرئيسية',
        parentPlanTitle: 'الخطة الأسبوعية',
        studentFollowBtn: 'متابعة الطالب والتواصل',
        tabStudents: '١. متابعة الطلاب والواجبات',
        tabPlan: '٢. الخطة الأسبوعية',
        tabTeachers: '٣. تواصل مع المعلمين',
        tabPhotos: '٤. لوحة الشرف والأنشطة',
        filterWeek: 'الأسبوع :',
        filterClass: 'الصف :',
        filterDay: 'اليوم :',
        allDays: 'جميع أيام الأسبوع',
        contactTeachersTitle: 'التواصل المباشر مع المعلمين والمعلمات',
        parentContactsHeader: 'فضاء أولياء الأمور - تواصل مع المعلمين',
        parentPhotosHeader: 'فضاء أولياء الأمور - لوحة الشرف والأنشطة',
        parentAuthBtn: 'تسجيل دخول / حساب ولي الأمر',
        contactTeachersDesc: 'اضغط على اسم المعلم أدناه لإرسال رسالة مباشرة بخصوص متابعة مستوى ابنكم الدراسي.',
        sendMessageBtn: 'مراسلة المعلم ✉️',
        backToPlan: 'الخطة الأسبوعية',
        parentTitle: 'فضاء أولياء الأمور - متابعة الطلاب',
        selectClass: 'اختر الصف الدراسي :',
        backToStudents: 'العودة لقائمة الطلاب',
        prevDay: 'اليوم السابق',
        nextDay: 'اليوم التالي',
        contactModalHeading: 'مراسلة المعلم',
        parentNameLabel: 'اسم ولي الأمر :',
        parentPhoneLabel: 'رقم الهاتف (اختياري) :',
        messageLabel: 'نص الرسالة والاستفسار :',
        sendMsgBtn: 'إرسال الرسالة الآن',
        cancelBtn: 'إلغاء',
        msgSentSuccess: 'تم إرسال رسالتكم بنجاح إلى المعلم !',
        msgEmptyErr: 'يرجى كتابة نص الرسالة قبل الإرسال.',
        lessonTopic: 'الدرس / موضوع الحصة :',
        classWork: 'العمل والأنشطة الصفية :',
        homeWork: 'الواجب المنزلي :',
        noHomework: 'لا يوجد واجب منزلي لهذه الحصة',
        supportLinks: 'المراجع والروابط :',
        periodLabel: 'الحصة',
        sessionsCount: 'حصص',
        loadingPlan: 'جاري تحميل الخطة الأسبوعية...',
        noCoursesFound: 'لا توجد حصص مسجلة لهذا الاختيار.',
        planCompletedTitle: 'الخطة الأسبوعية الرسمية - مكتملة الإعداد ✅',
        planCompletedDesc: 'أنهى جميع المعلمين إعداد وتوثيق حصص هذا الأسبوع.',
        planInProgressTitle: 'الخطة الأسبوعية قيد الاستكمال ⏳',
        planInProgressDesc: 'يقوم الكادر التعليمي حالياً باستكمال إدخال الدروس. الحصص الجاهزة معروضة أدناه.',
        noPlanPublished: 'لا توجد خطة منشورة لهذا الصف حالياً.',
        daysMap: {
            "Dimanche": "الأحد",
            "Lundi": "الاثنين",
            "Mardi": "الثلاثاء",
            "Mercredi": "الأربعاء",
            "Jeudi": "الخميس"
        }
    }
};

function toggleParentLanguage() {
    currentUserLanguage = (currentUserLanguage === 'fr') ? 'ar' : 'fr';
    localStorage.setItem('parentLanguage', currentUserLanguage);
    applyParentLanguageUI();
    loadParentWeeklyPlan();
    loadTeachersContactGrid();
}

function applyParentLanguageUI() {
    const lang = currentUserLanguage;
    const t = parentI18n[lang] || parentI18n.fr;

    // Définir la direction du texte (RTL pour l'arabe, LTR pour le français)
    document.body.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');

    // Mettre à jour les boutons de basculement de langue
    document.querySelectorAll('.parentLangToggleLabel').forEach(el => {
        el.textContent = t.langBtn;
    });

    const setTxt = (id, txt) => {
        const el = document.getElementById(id);
        if (el) el.textContent = txt;
    };

    setTxt('btnHomeText', t.homeBtn);
    setTxt('btnHomeText2', t.homeBtn);
    setTxt('btnHomeText3', t.homeBtn);
    setTxt('btnHomeTextPhotos', t.homeBtn);
    setTxt('parentPlanViewHeader', t.parentPlanTitle);
    setTxt('parentContactsHeaderTitle', t.parentContactsHeader);
    setTxt('parentPhotosTitleText', t.parentPhotosHeader);
    setTxt('btnHeaderStudentFollow', t.studentFollowBtn);
    setTxt('btnBackToPlanText', t.backToPlan);
    setTxt('parentTitleText', t.parentTitle);
    setTxt('lblSelectClass', t.selectClass);
    setTxt('btnBackToStudentsList', t.backToStudents);
    setTxt('btnPrevDayText', t.prevDay);
    setTxt('btnNextDayText', t.nextDay);

    setTxt('lblFilterWeek', t.filterWeek);
    setTxt('lblFilterClass', t.filterClass);
    setTxt('lblFilterDay', t.filterDay);

    setTxt('txtContactTeachersTitle', t.contactTeachersTitle);
    setTxt('txtParentAuthBtn', t.parentAuthBtn);
    setTxt('txtContactTeachersDesc', t.contactTeachersDesc);

    setTxt('contactModalTeacherHeading', t.contactModalHeading);
    setTxt('lblContactParentName', t.parentNameLabel);
    setTxt('lblContactParentPhone', t.parentPhoneLabel);
    setTxt('lblContactParentMsg', t.messageLabel);
    setTxt('btnSendParentMsgText', t.sendMsgBtn);
    setTxt('btnCancelParentMsgText', t.cancelBtn);

    document.querySelectorAll('.tab-txt-plan').forEach(el => el.textContent = t.tabPlan);
    document.querySelectorAll('.tab-txt-students').forEach(el => el.textContent = t.tabStudents);
    document.querySelectorAll('.tab-txt-teachers').forEach(el => el.textContent = t.tabTeachers);
    document.querySelectorAll('.tab-txt-photos').forEach(el => el.textContent = t.tabPhotos);
}

function showTeacherContactSection() {
    showHomeworkView('parent-contacts');
}

function openParentAuthModal() {
    const m = document.getElementById('parent-auth-modal');
    if (m) m.style.display = 'flex';
}

function closeParentAuthModal() {
    const m = document.getElementById('parent-auth-modal');
    if (m) m.style.display = 'none';
}

function switchParentAuthTab(tab) {
    document.getElementById('parent-login-form').style.display = (tab === 'login') ? 'block' : 'none';
    document.getElementById('parent-register-form').style.display = (tab === 'register') ? 'block' : 'none';
    document.getElementById('tab-login-btn').classList.toggle('active', tab === 'login');
    document.getElementById('tab-register-btn').classList.toggle('active', tab === 'register');
}

async function submitParentRegister() {
    const firstName = document.getElementById('parentRegFirstName').value;
    const lastName = document.getElementById('parentRegLastName').value;
    const phone = document.getElementById('parentRegPhone').value;
    const password = document.getElementById('parentRegPassword').value;
    const statusEl = document.getElementById('parent-auth-status');

    if (!firstName || !lastName || !phone || !password) {
        if (statusEl) statusEl.innerHTML = '<span style="color:red;">Tous les champs sont requis.</span>';
        return;
    }

    const res = await fetch('/api/parent-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName, phone, password, section: currentSection })
    });

    if (res.ok) {
        const data = await res.json();
        activeParentAccount = data.parent;
        localStorage.setItem('parentAccount', JSON.stringify(activeParentAccount));
        if (statusEl) statusEl.innerHTML = '<span style="color:green;">Inscription réussie ! Connexion automatique.</span>';
        setTimeout(closeParentAuthModal, 1000);
    } else {
        const err = await res.json();
        if (statusEl) statusEl.innerHTML = `<span style="color:red;">${err.error || 'Erreur d\'inscription.'}</span>`;
    }
}

async function submitParentLogin() {
    const phone = document.getElementById('parentLoginPhone').value;
    const password = document.getElementById('parentLoginPassword').value;
    const statusEl = document.getElementById('parent-auth-status');

    const res = await fetch('/api/parent-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password })
    });

    if (res.ok) {
        const data = await res.json();
        activeParentAccount = data.parent;
        localStorage.setItem('parentAccount', JSON.stringify(activeParentAccount));
        if (statusEl) statusEl.innerHTML = '<span style="color:green;">Connexion réussie !</span>';
        setTimeout(closeParentAuthModal, 1000);
    } else {
        if (statusEl) statusEl.innerHTML = '<span style="color:red;">Identifiants incorrects.</span>';
    }
}

async function loadTeachersContactGrid() {
    try {
        const grid = document.getElementById('teachers-contact-grid');
        if (!grid) return;
        
        let teachers = (teachersSectionMap && teachersSectionMap[currentSection]) 
            ? [...teachersSectionMap[currentSection]] 
            : (currentSection === 'filles' ? [...femaleTeachersList] : [...maleTeachersList]);
        
        // Tentative de récupération des enseignants réels de la section dans la base de données
        try {
            const res = await fetch(`/api/admin/users?section=${currentSection}`);
            if (res.ok) {
                const userDocs = await res.json();
                if (userDocs && Array.isArray(userDocs) && userDocs.length > 0) {
                    teachers = userDocs.map(u => u.username).filter(name => name && name.toLowerCase() !== 'admin');
                }
            }
        } catch (fetchErr) {
            console.warn('Utilisation de la liste prédéfinie pour la section:', currentSection);
        }

        // Filtre de sécurité frontend strict pour empêcher tout mélange entre sections
        if (currentSection === 'garcons') {
            teachers = teachers.filter(t => !femaleTeachersList.some(f => f.toLowerCase() === t.toLowerCase()) && !primaireTeachersList.some(p => p.toLowerCase() === t.toLowerCase()) && !isDualSectionTeacher(t));
        } else if (currentSection === 'filles') {
            teachers = teachers.filter(t => isDualSectionTeacher(t) || (!maleTeachersList.some(m => m.toLowerCase() === t.toLowerCase()) && !primaireTeachersList.some(p => p.toLowerCase() === t.toLowerCase())));
        } else if (currentSection === 'primaire') {
            teachers = teachers.filter(t => isDualSectionTeacher(t) || (!maleTeachersList.some(m => m.toLowerCase() === t.toLowerCase()) && !femaleTeachersList.some(f => f.toLowerCase() === t.toLowerCase())));
        }

        const t = parentI18n[currentUserLanguage] || parentI18n.fr;
        const iconBg = currentSection === 'filles' ? 'linear-gradient(135deg, #EC4899, #DB2777)' : (currentSection === 'primaire' ? 'linear-gradient(135deg, #10B981, #059669)' : 'linear-gradient(135deg, #6366F1, #4F46E5)');

        grid.innerHTML = teachers.map(teacher => `
            <div class="teacher-contact-card" onclick="openContactTeacherModal('${teacher.replace(/'/g, "\\'")}')" style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:14px; padding:16px; text-align:center; cursor:pointer; transition:all 0.25s ease; box-shadow:0 2px 6px rgba(0,0,0,0.03);">
                <div style="width:48px; height:48px; background:${iconBg}; color:white; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:1.3rem; margin:0 auto 10px auto;">
                    <i class="fas fa-chalkboard-teacher"></i>
                </div>
                <h4 style="margin:0 0 6px 0; color:#1E1B4B; font-size:1rem; font-weight:700;">${teacher}</h4>
                <div style="display:inline-flex; align-items:center; gap:5px; background:#ECFDF5; color:#065F46; padding:4px 10px; border-radius:8px; font-size:0.8rem; font-weight:700;">
                    <i class="fas fa-paper-plane"></i> <span>${t.sendMessageBtn}</span>
                </div>
            </div>
        `).join('');
    } catch (e) {
        console.error('Erreur loadTeachersContactGrid:', e);
    }
}

let targetTeacherForMessage = null;

function openContactTeacherModal(teacherName) {
    targetTeacherForMessage = teacherName;
    const t = parentI18n[currentUserLanguage] || parentI18n.fr;
    
    const titleHeading = document.getElementById('contactModalTeacherHeading');
    if (titleHeading) {
        titleHeading.innerText = currentUserLanguage === 'ar' ? `مراسلة الأستاذ(ة) ${teacherName}` : `Contacter ${teacherName}`;
    }

    // Pré-remplir les données du parent si connectées ou enregistrées
    const nameInput = document.getElementById('parentMsgSenderName');
    const phoneInput = document.getElementById('parentMsgSenderPhone');
    
    if (nameInput) {
        if (activeParentAccount && activeParentAccount.firstName) {
            nameInput.value = `${activeParentAccount.firstName} ${activeParentAccount.lastName}`;
        } else {
            nameInput.value = localStorage.getItem('parentSenderName') || '';
        }
    }
    
    if (phoneInput) {
        if (activeParentAccount && activeParentAccount.phone) {
            phoneInput.value = activeParentAccount.phone;
        } else {
            phoneInput.value = localStorage.getItem('parentSenderPhone') || '';
        }
    }

    const m = document.getElementById('contact-teacher-modal');
    if (m) m.style.display = 'flex';
}

function closeContactTeacherModal() {
    const m = document.getElementById('contact-teacher-modal');
    if (m) m.style.display = 'none';
}

async function submitParentMessage() {
    const text = document.getElementById('parentMessageText')?.value;
    const senderName = document.getElementById('parentMsgSenderName')?.value;
    const senderPhone = document.getElementById('parentMsgSenderPhone')?.value;
    const t = parentI18n[currentUserLanguage] || parentI18n.fr;

    if (!text || text.trim() === '') {
        alert(t.msgEmptyErr);
        return;
    }

    const pName = senderName && senderName.trim() !== '' ? senderName.trim() : (activeParentAccount ? `${activeParentAccount.firstName} ${activeParentAccount.lastName}` : (currentUserLanguage === 'ar' ? 'ولي أمر' : 'Parent d\'élève'));
    const pPhone = senderPhone && senderPhone.trim() !== '' ? senderPhone.trim() : (activeParentAccount ? activeParentAccount.phone : '');

    // Sauvegarder localement pour les futurs messages
    if (senderName) localStorage.setItem('parentSenderName', senderName.trim());
    if (senderPhone) localStorage.setItem('parentSenderPhone', senderPhone.trim());

    try {
        const res = await fetch('/api/send-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                teacherName: targetTeacherForMessage,
                parentName: pName,
                parentPhone: pPhone,
                message: text,
                section: currentSection
            })
        });

        if (res.ok) {
            alert(t.msgSentSuccess);
            if (document.getElementById('parentMessageText')) {
                document.getElementById('parentMessageText').value = '';
            }
            closeContactTeacherModal();
        } else {
            alert(currentUserLanguage === 'ar' ? 'حدث خطأ أثناء إرسال الرسالة، يرجى المحاولة لاحقاً.' : 'Erreur lors de l\'envoi du message.');
        }
    } catch (e) {
        console.error('Erreur submitParentMessage:', e);
        alert(currentUserLanguage === 'ar' ? 'تعذر الاتصال بالخادم.' : 'Erreur réseau.');
    }
}

async function openTeacherMessagesModal() {
    const teacherName = (typeof loggedInUser !== 'undefined' && loggedInUser) ? loggedInUser : 'all';
    const section = (typeof currentSection !== 'undefined' && currentSection) ? currentSection : 'garcons';
    const res = await fetch(`/api/get-messages?teacherName=${encodeURIComponent(teacherName)}&section=${encodeURIComponent(section)}`);
    if (res.ok) {
        const messages = await res.json();
        alert(`Vous avez ${messages.length} message(s) de parents.`);
    }
}

let allTeacherHomeworks = [];
let activeEvalHomework = null;
let activeEvalStudents = [];

async function loadTeacherHomeworksDashboard() {
    const container = document.getElementById('teacher-homeworks-tree-container');
    if (!container) return;

    container.innerHTML = `
        <div style="text-align:center; padding:40px; color:#475569;">
            <i class="fas fa-spinner fa-spin fa-2x" style="color:#2563EB; margin-bottom:12px;"></i>
            <p style="font-weight:600; font-size:1.05rem;">Chargement des devoirs donnés...</p>
        </div>
    `;

    try {
        const teacherName = (typeof loggedInUser !== 'undefined' && loggedInUser && !isUserAdminOrSupervisor(loggedInUser, currentUserRole)) ? loggedInUser : 'all';
        const section = (typeof currentSection !== 'undefined' && currentSection) ? currentSection : 'garcons';

        const nameEl = document.getElementById('teacherEvalActiveName');
        if (nameEl) nameEl.textContent = (typeof loggedInUser !== 'undefined' && loggedInUser) ? loggedInUser : 'Enseignant';

        const secEl = document.getElementById('teacherEvalActiveSection');
        if (secEl) {
            secEl.textContent = section === 'garcons' ? 'Section Garçons (بنين)' : (section === 'primaire' ? 'Section Primaire & Maternelle (ابتدائي وروضة)' : 'Section Filles (بنات)');
        }

        const res = await fetch(`/api/teacher-homeworks?teacher=${encodeURIComponent(teacherName)}&section=${encodeURIComponent(section)}`);
        if (!res.ok) throw new Error(`Erreur ${res.status}`);

        const data = await res.json();
        allTeacherHomeworks = data.homeworks || [];

        // Remplir les sélecteurs de filtre
        populateTeacherDashboardFilterOptions();

        // Rendre les devoirs groupés par semaine puis classe
        renderTeacherHomeworksDashboard();
    } catch (e) {
        console.error('Erreur loadTeacherHomeworksDashboard:', e);
        container.innerHTML = `
            <div style="background:#FEF2F2; border:1px solid #F87171; border-radius:12px; padding:20px; text-align:center; color:#991B1B;">
                <i class="fas fa-exclamation-triangle fa-2x" style="margin-bottom:8px;"></i>
                <p style="font-weight:700;">Impossible de charger les devoirs pour le moment.</p>
                <button class="pro-button" onclick="loadTeacherHomeworksDashboard()" style="margin-top:10px;">
                    <i class="fas fa-sync"></i> Réessayer
                </button>
            </div>
        `;
    }
}

function populateTeacherDashboardFilterOptions() {
    const weekSel = document.getElementById('teacherFilterWeek');
    const classSel = document.getElementById('teacherFilterClass');

    if (weekSel) {
        const curWeek = weekSel.value;
        const weeks = [...new Set(allTeacherHomeworks.map(h => h.week))].filter(Boolean).sort((a, b) => {
            return (parseInt(a) || 0) - (parseInt(b) || 0);
        });

        let opts = `<option value="all">Toutes les semaines (${weeks.length})</option>`;
        weeks.forEach(w => {
            const hwSample = allTeacherHomeworks.find(h => String(h.week) === String(w));
            const rangeText = hwSample?.weekRangeText ? ` (${hwSample.weekRangeText})` : '';
            opts += `<option value="${w}">Semaine ${w}${rangeText}</option>`;
        });
        weekSel.innerHTML = opts;
        if (weeks.map(String).includes(curWeek)) {
            weekSel.value = curWeek;
        }
    }

    if (classSel) {
        const curCls = classSel.value;
        const classes = [...new Set(allTeacherHomeworks.map(h => h.classe))].filter(Boolean).sort(compareClasses);

        let opts = `<option value="all">Toutes les classes (${classes.length})</option>`;
        classes.forEach(c => {
            const ar = classTranslations[c];
            const label = ar ? `${ar} (${c})` : c;
            opts += `<option value="${c}">${label}</option>`;
        });
        classSel.innerHTML = opts;
        if (classes.includes(curCls)) {
            classSel.value = curCls;
        }
    }
}

function renderTeacherHomeworksDashboard() {
    const container = document.getElementById('teacher-homeworks-tree-container');
    if (!container) return;

    const filterWeek = document.getElementById('teacherFilterWeek')?.value || 'all';
    const filterClass = document.getElementById('teacherFilterClass')?.value || 'all';
    const filterStatus = document.getElementById('teacherFilterStatus')?.value || 'all';

    // Filtrer la liste des devoirs
    const filtered = allTeacherHomeworks.filter(hw => {
        if (filterWeek !== 'all' && String(hw.week) !== String(filterWeek)) return false;
        if (filterClass !== 'all' && hw.classe !== filterClass) return false;
        if (filterStatus === 'evaluated' && !hw.isEvaluated) return false;
        if (filterStatus === 'pending' && hw.isEvaluated) return false;
        return true;
    });

    // Mettre à jour les statistiques
    const totalCount = allTeacherHomeworks.length;
    const evaluatedCount = allTeacherHomeworks.filter(h => h.isEvaluated).length;
    const pendingCount = totalCount - evaluatedCount;

    const statTotal = document.getElementById('statTotalHw');
    if (statTotal) statTotal.textContent = totalCount;

    const statEval = document.getElementById('statEvaluatedHw');
    if (statEval) statEval.textContent = evaluatedCount;

    const statPending = document.getElementById('statPendingHw');
    if (statPending) statPending.textContent = pendingCount;

    if (filtered.length === 0) {
        container.innerHTML = `
            <div style="background:white; border-radius:14px; padding:40px 20px; text-align:center; border:1px dashed #CBD5E1; color:#64748B;">
                <i class="fas fa-clipboard-check fa-3x" style="color:#94A3B8; margin-bottom:12px;"></i>
                <h4 style="font-size:1.15rem; color:#334155; margin:0 0 6px 0;">Aucun devoir trouvé avec ces filtres</h4>
                <p style="font-size:0.9rem; margin:0;">Veuillez ajuster les filtres ou enregistrer de nouveaux devoirs dans le plan hebdomadaire.</p>
            </div>
        `;
        return;
    }

    // Grouper par Semaine puis par Classe
    const weeksMap = new Map();
    filtered.forEach(hw => {
        const wKey = String(hw.week || 'Sans Semaine');
        if (!weeksMap.has(wKey)) {
            weeksMap.set(wKey, {
                week: hw.week,
                weekRangeText: hw.weekRangeText || '',
                classesMap: new Map()
            });
        }
        const wObj = weeksMap.get(wKey);
        const cKey = hw.classe || 'Général';
        if (!wObj.classesMap.has(cKey)) {
            wObj.classesMap.set(cKey, []);
        }
        wObj.classesMap.get(cKey).push(hw);
    });

    // Tri des semaines
    const sortedWeeks = Array.from(weeksMap.entries()).sort((a, b) => {
        return (parseInt(a[0]) || 0) - (parseInt(b[0]) || 0);
    });

    let html = '';

    sortedWeeks.forEach(([wKey, wData]) => {
        let totalInWeek = 0;
        let evaluatedInWeek = 0;
        wData.classesMap.forEach(hwList => {
            totalInWeek += hwList.length;
            evaluatedInWeek += hwList.filter(h => h.isEvaluated).length;
        });

        const weekPercent = totalInWeek > 0 ? Math.round((evaluatedInWeek / totalInWeek) * 100) : 0;

        html += `
            <div class="week-evaluation-card" style="background:white; border-radius:16px; margin-bottom:28px; box-shadow:0 6px 20px rgba(0,0,0,0.06); border:1px solid #E2E8F0; overflow:hidden;">
                <!-- En-tête de la Semaine -->
                <div style="background:linear-gradient(135deg, #1E293B 0%, #334155 100%); color:white; padding:16px 24px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
                    <div style="display:flex; align-items:center; gap:12px;">
                        <span style="background:#3B82F6; color:white; padding:6px 14px; border-radius:10px; font-weight:800; font-size:1.05rem; letter-spacing:0.5px;">
                            <i class="fas fa-calendar-week"></i> SEMAINE ${wKey}
                        </span>
                        ${wData.weekRangeText ? `<span style="color:#CBD5E1; font-weight:600; font-size:0.92rem;"><i class="far fa-clock"></i> ${wData.weekRangeText}</span>` : ''}
                    </div>
                    <div style="display:flex; align-items:center; gap:15px;">
                        <div style="text-align:right;">
                            <div style="font-size:0.85rem; color:#94A3B8;">Progression Évaluations</div>
                            <div style="font-weight:700; font-size:0.95rem; color:${evaluatedInWeek === totalInWeek ? '#34D399' : '#FBBF24'};">
                                ${evaluatedInWeek} / ${totalInWeek} Évalués (${weekPercent}%)
                            </div>
                        </div>
                        <div style="width:70px; height:8px; background:rgba(255,255,255,0.2); border-radius:10px; overflow:hidden;">
                            <div style="width:${weekPercent}%; height:100%; background:${evaluatedInWeek === totalInWeek ? '#10B981' : '#F59E0B'}; border-radius:10px;"></div>
                        </div>
                    </div>
                </div>

                <!-- Contenu des classes de la Semaine -->
                <div style="padding:20px 24px;">
        `;

        // Trier les classes dans la semaine
        const sortedClasses = Array.from(wData.classesMap.entries()).sort((a, b) => compareClasses(a[0], b[0]));

        sortedClasses.forEach(([cKey, homeworksList]) => {
            const arCls = classTranslations[cKey];
            const classTitle = arCls ? `${arCls} (${cKey})` : cKey;

            html += `
                <div style="margin-bottom:24px; padding-bottom:16px; border-bottom:1px solid #F1F5F9;">
                    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; flex-wrap:wrap; gap:8px;">
                        <h4 style="margin:0; font-size:1.1rem; color:#1E1B4B; display:flex; align-items:center; gap:8px;">
                            <span style="display:inline-block; width:10px; height:10px; background:#4F46E5; border-radius:50%;"></span>
                            <i class="fas fa-users" style="color:#6366F1;"></i> Classe : <strong>${classTitle}</strong>
                        </h4>
                        <span style="font-size:0.82rem; font-weight:700; color:#64748B; background:#F8FAFC; padding:4px 10px; border-radius:8px; border:1px solid #E2E8F0;">
                            ${homeworksList.length} Devoir(s)
                        </span>
                    </div>

                    <!-- Grille des devoirs donnés pour cette classe -->
                    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:18px;">
            `;

            homeworksList.forEach(hw => {
                const globalIndex = allTeacherHomeworks.indexOf(hw);
                const isEvaluated = !!hw.isEvaluated;

                // DESIGN CONDITIONNEL : VERT SI ÉVALUÉ, BLANC/GRIS SI EN ATTENTE
                const cardBg = isEvaluated ? '#F0FDF4' : '#FFFFFF';
                const cardBorder = isEvaluated ? '2px solid #10B981' : '1px solid #CBD5E1';
                const shadow = isEvaluated ? '0 4px 15px rgba(16, 185, 129, 0.12)' : '0 3px 10px rgba(0,0,0,0.04)';

                html += `
                    <div style="background:${cardBg}; border:${cardBorder}; border-radius:14px; padding:18px; box-shadow:${shadow}; display:flex; flex-direction:column; justify-content:space-between; transition:transform 0.2s, box-shadow 0.2s; position:relative;">
                        
                        <!-- Ruban / Badge d'état -->
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px; gap:8px;">
                            <div style="display:flex; flex-wrap:wrap; gap:6px; align-items:center;">
                                <span style="background:#EEF2FF; color:#4338CA; padding:3px 8px; border-radius:6px; font-weight:700; font-size:0.78rem;">
                                    <i class="fas fa-book"></i> ${escapeHtml(hw.matiere || 'Matière')}
                                </span>
                                ${hw.jour ? `<span style="background:#F1F5F9; color:#334155; padding:3px 8px; border-radius:6px; font-weight:600; font-size:0.78rem;"><i class="far fa-calendar"></i> ${escapeHtml(hw.jour)}</span>` : ''}
                                ${hw.periode ? `<span style="background:#FEF3C7; color:#92400E; padding:3px 8px; border-radius:6px; font-weight:600; font-size:0.78rem;">Période ${escapeHtml(hw.periode)}</span>` : ''}
                            </div>

                            ${isEvaluated ? `
                                <span style="background:#10B981; color:white; padding:4px 10px; border-radius:8px; font-weight:800; font-size:0.78rem; display:inline-flex; align-items:center; gap:5px; box-shadow:0 2px 6px rgba(16,185,129,0.3);">
                                    <i class="fas fa-check-circle"></i> Évalué (Vert)
                                </span>
                            ` : `
                                <span style="background:#F59E0B; color:white; padding:4px 10px; border-radius:8px; font-weight:800; font-size:0.78rem; display:inline-flex; align-items:center; gap:5px;">
                                    <i class="fas fa-clock"></i> À Évaluer
                                </span>
                            `}
                        </div>

                        <!-- Info leçon -->
                        ${hw.lecon ? `
                            <div style="font-size:0.85rem; color:#475569; margin-bottom:10px; line-height:1.35;">
                                <strong style="color:#1E293B;"><i class="fas fa-graduation-cap" style="color:#6366F1;"></i> Leçon :</strong> ${escapeHtml(hw.lecon)}
                            </div>
                        ` : ''}

                        <!-- ÉNONCÉ DU DEVOIR MIS EN ÉVIDENCE -->
                        <div style="background:${isEvaluated ? '#DCFCE7' : '#F8FAFC'}; border:1px solid ${isEvaluated ? '#86EFAC' : '#E2E8F0'}; border-left:4px solid ${isEvaluated ? '#10B981' : '#3B82F6'}; border-radius:10px; padding:12px; margin:10px 0 16px 0;">
                            <div style="font-size:0.75rem; font-weight:800; text-transform:uppercase; color:${isEvaluated ? '#047857' : '#2563EB'}; margin-bottom:4px; display:flex; align-items:center; gap:5px;">
                                <i class="fas fa-book-open"></i> Énoncé du Devoir :
                            </div>
                            <div style="font-size:0.95rem; font-weight:600; color:#0F172A; line-height:1.45; word-break:break-word;">
                                ${escapeHtml(hw.devoir || 'Aucun énoncé')}
                            </div>
                        </div>

                        <!-- Date et bouton d'action -->
                        <div style="margin-top:auto;">
                            <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.8rem; color:#64748B; margin-bottom:12px;">
                                <span><i class="far fa-calendar-alt"></i> Date : <strong>${hw.formattedDateFr || hw.date}</strong></span>
                                <span><i class="fas fa-user-tie"></i> ${escapeHtml(hw.enseignant || 'Enseignant')}</span>
                            </div>

                            <button type="button" class="pro-button ${isEvaluated ? 'success-button' : 'primary-button'}" onclick="openTeacherEvalModal(${globalIndex})" style="width:100%; padding:10px 14px; font-weight:700; font-size:0.9rem; justify-content:center; gap:8px;">
                                <i class="fas ${isEvaluated ? 'fa-check-double' : 'fa-edit'}"></i>
                                <span>${isEvaluated ? 'Modifier / Revoir l\'Évaluation' : 'Saisir l\'Évaluation des Élèves'}</span>
                            </button>
                        </div>
                    </div>
                `;
            });

            html += `
                    </div>
                </div>
            `;
        });

        html += `
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

async function openTeacherEvalModal(hwIndex) {
    const hw = allTeacherHomeworks[hwIndex];
    if (!hw) {
        displayAlert("Devoir introuvable.", true);
        return;
    }

    activeEvalHomework = hw;
    const modal = document.getElementById('teacherEvalSheetModal');
    if (!modal) return;

    // Remplir les informations d'en-tête
    const bWeek = document.getElementById('evalModalBadgeWeek');
    const bClass = document.getElementById('evalModalBadgeClass');
    const bSubj = document.getElementById('evalModalBadgeSubject');
    const bDate = document.getElementById('evalModalBadgeDate');
    const stEl = document.getElementById('evalModalHomeworkStatement');
    const lEl = document.getElementById('evalModalLessonInfo');
    const titleEl = document.getElementById('evalModalTitle');

    const arCls = classTranslations[hw.classe];
    const classDisplay = arCls ? `${arCls} (${hw.classe})` : hw.classe;

    if (bWeek) bWeek.textContent = `Semaine ${hw.week}`;
    if (bClass) bClass.textContent = `Classe : ${classDisplay}`;
    if (bSubj) bSubj.textContent = `Matière : ${hw.matiere || 'Devoir'}`;
    if (bDate) bDate.textContent = `Date : ${hw.formattedDateFr || hw.date}`;
    if (stEl) stEl.textContent = hw.devoir || 'Aucun énoncé spécifié';
    if (lEl) lEl.textContent = hw.lecon ? `Leçon : ${hw.lecon}` : '';
    if (titleEl) titleEl.textContent = `Évaluation : ${hw.matiere || 'Devoir'} - ${classDisplay}`;

    // Afficher le modal
    modal.style.display = 'block';

    // Charger les élèves et les évaluations existantes
    const tableWrapper = document.getElementById('evalModalStudentsTableWrapper');
    if (tableWrapper) {
        tableWrapper.innerHTML = `
            <div style="text-align:center; padding:30px; color:#475569;">
                <i class="fas fa-spinner fa-spin fa-2x" style="color:#2563EB; margin-bottom:8px;"></i>
                <p>Chargement de la liste des élèves de la classe...</p>
            </div>
        `;
    }

    try {
        const section = currentSection || 'garcons';
        const [stRes, evRes] = await Promise.all([
            fetch(`/api/admin/students?class=${encodeURIComponent(hw.classe)}&section=${encodeURIComponent(section)}`),
            fetch(`/api/evaluations?class=${encodeURIComponent(hw.classe)}&date=${encodeURIComponent(hw.date)}&section=${encodeURIComponent(section)}`)
        ]);

        if (!stRes.ok) throw new Error("Erreur chargement élèves");
        const students = await stRes.json();
        activeEvalStudents = students || [];

        let existingEvaluations = [];
        if (evRes.ok) {
            const evData = await evRes.json();
            existingEvaluations = evData.evaluations || [];
        }

        if (activeEvalStudents.length === 0) {
            tableWrapper.innerHTML = `
                <div style="background:#FEF2F2; padding:20px; border-radius:10px; text-align:center; color:#991B1B;">
                    <i class="fas fa-user-slash fa-2x" style="margin-bottom:6px;"></i>
                    <p>Aucun élève trouvé enregistré pour la classe <strong>${classDisplay}</strong>.</p>
                </div>
            `;
            return;
        }

        // Construire la table de saisie
        let tableHtml = `
            <table class="users-table" style="width:100%; border-collapse:collapse; background:white;">
                <thead>
                    <tr style="background:#F1F5F9; color:#1E293B;">
                        <th style="padding:10px; border:1px solid #E2E8F0; text-align:left;">#</th>
                        <th style="padding:10px; border:1px solid #E2E8F0; text-align:left;">Nom de l'Élève</th>
                        <th style="padding:10px; border:1px solid #E2E8F0; text-align:center; min-width:140px;">Statut du Devoir</th>
                        <th style="padding:10px; border:1px solid #E2E8F0; text-align:center; width:110px;">Participation (/10)</th>
                        <th style="padding:10px; border:1px solid #E2E8F0; text-align:center; width:110px;">Comportement (/10)</th>
                        <th style="padding:10px; border:1px solid #E2E8F0; text-align:left;">Remarque</th>
                    </tr>
                </thead>
                <tbody>
        `;

        activeEvalStudents.forEach((st, idx) => {
            const ev = existingEvaluations.find(e => e.studentName === st.name && (e.subject === hw.matiere || !e.subject)) || {};
            const curStatus = ev.status || 'Fait';
            const curPart = (ev.participation !== undefined && ev.participation !== null) ? ev.participation : 10;
            const curBeh = (ev.behavior !== undefined && ev.behavior !== null) ? ev.behavior : 10;
            const curComm = ev.comment || '';

            tableHtml += `
                <tr style="border-bottom:1px solid #E2E8F0;">
                    <td style="padding:10px; border:1px solid #E2E8F0; font-weight:700; color:#64748B;">${idx + 1}</td>
                    <td style="padding:10px; border:1px solid #E2E8F0;">
                        <div style="font-weight:700; color:#0F172A; font-size:0.95rem;">${escapeHtml(st.name)}</div>
                    </td>
                    <td style="padding:10px; border:1px solid #E2E8F0; text-align:center;">
                        <select class="modal-eval-status" data-student="${escapeHtml(st.name)}" style="width:100%; padding:7px 10px; border-radius:6px; border:1px solid #CBD5E1; font-weight:700;">
                            <option value="Fait" ${curStatus === 'Fait' ? 'selected' : ''}>✅ Fait</option>
                            <option value="Partiellement Fait" ${curStatus === 'Partiellement Fait' ? 'selected' : ''}>⚠️ Partiellement Fait</option>
                            <option value="Non Fait" ${curStatus === 'Non Fait' ? 'selected' : ''}>❌ Non Fait</option>
                            <option value="Absent" ${curStatus === 'Absent' ? 'selected' : ''}>⚪ Absent</option>
                        </select>
                    </td>
                    <td style="padding:10px; border:1px solid #E2E8F0; text-align:center;">
                        <input type="number" min="0" max="10" value="${curPart}" class="modal-eval-part" data-student="${escapeHtml(st.name)}" style="width:80px; padding:6px; text-align:center; border-radius:6px; border:1px solid #CBD5E1; font-weight:700;">
                    </td>
                    <td style="padding:10px; border:1px solid #E2E8F0; text-align:center;">
                        <input type="number" min="0" max="10" value="${curBeh}" class="modal-eval-beh" data-student="${escapeHtml(st.name)}" style="width:80px; padding:6px; text-align:center; border-radius:6px; border:1px solid #CBD5E1; font-weight:700;">
                    </td>
                    <td style="padding:10px; border:1px solid #E2E8F0;">
                        <input type="text" value="${escapeHtml(curComm)}" class="modal-eval-comm" data-student="${escapeHtml(st.name)}" placeholder="Observation / Remarque" style="width:100%; padding:6px 10px; border-radius:6px; border:1px solid #CBD5E1;">
                    </td>
                </tr>
            `;
        });

        tableHtml += `
                </tbody>
            </table>
        `;

        tableWrapper.innerHTML = tableHtml;
    } catch (e) {
        console.error('Erreur chargement formulaire evaluation:', e);
        tableWrapper.innerHTML = `
            <div style="background:#FEF2F2; padding:15px; border-radius:8px; color:#991B1B;">
                Erreur lors du chargement des élèves : ${e.message}
            </div>
        `;
    }
}

function closeTeacherEvalSheetModal() {
    const modal = document.getElementById('teacherEvalSheetModal');
    if (modal) modal.style.display = 'none';
    activeEvalHomework = null;
}

function setAllStudentsStatus(statusVal, partVal, behVal) {
    const statuses = document.querySelectorAll('.modal-eval-status');
    const parts = document.querySelectorAll('.modal-eval-part');
    const behs = document.querySelectorAll('.modal-eval-beh');

    statuses.forEach(s => { s.value = statusVal; });
    if (partVal !== undefined) parts.forEach(p => { p.value = partVal; });
    if (behVal !== undefined) behs.forEach(b => { b.value = behVal; });
}

async function submitCurrentHomeworkEvaluation() {
    if (!activeEvalHomework) {
        displayAlert("Aucun devoir actif sélectionné.", true);
        return;
    }

    const btn = document.getElementById('btnSaveEvalModal');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement en cours...';
    }

    try {
        const hw = activeEvalHomework;
        const section = currentSection || 'garcons';
        const statusEls = document.querySelectorAll('.modal-eval-status');
        const evaluations = [];

        statusEls.forEach(stEl => {
            const studentName = stEl.getAttribute('data-student');
            const status = stEl.value;
            const partEl = document.querySelector(`.modal-eval-part[data-student="${studentName}"]`);
            const behEl = document.querySelector(`.modal-eval-beh[data-student="${studentName}"]`);
            const commEl = document.querySelector(`.modal-eval-comm[data-student="${studentName}"]`);

            evaluations.push({
                studentName,
                class: hw.classe,
                date: hw.date,
                subject: hw.matiere,
                status,
                participation: parseInt(partEl?.value || 10),
                behavior: parseInt(behEl?.value || 10),
                comment: commEl?.value || '',
                section,
                evaluatedBy: loggedInUser || 'Enseignant'
            });
        });

        const res = await fetch('/api/evaluations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ evaluations, section })
        });

        if (!res.ok) throw new Error("Échec de l'enregistrement de l'évaluation.");

        // Recalculer les étoiles journalières
        await fetch('/api/daily-stars', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: hw.date, section })
        }).catch(err => console.warn('Erreur recalcul daily-stars:', err));

        // Marquer le devoir comme évalué dans l'état local (Devient VERT immédiatement !)
        hw.isEvaluated = true;

        closeTeacherEvalSheetModal();
        renderTeacherHomeworksDashboard();

        displayAlert("Évaluation enregistrée avec succès ! Le devoir est désormais marqué comme Évalué (Vert).", false);
    } catch (e) {
        console.error('Erreur submitCurrentHomeworkEvaluation:', e);
        displayAlert(`Erreur : ${e.message}`, true);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> Enregistrer l\'Évaluation';
        }
    }
}

// Fonctions de compatibilité
async function loadTeacherHomeworks() {
    loadTeacherHomeworksDashboard();
}

async function saveTeacherEvaluations(className, dateStr) {
    submitCurrentHomeworkEvaluation();
}

// ==========================================
// 1. MODULE SUPERVISION DES MESSAGES (ADMIN)
// ==========================================
let allAdminMessagesCache = [];

async function loadAdminAllMessages() {
    const container = document.getElementById('adminMessagesListContainer');
    const secFilter = document.getElementById('adminMsgSectionFilter');
    const totalCountEl = document.getElementById('adminMsgTotalCount');
    const repliedCountEl = document.getElementById('adminMsgRepliedCount');
    const pendingCountEl = document.getElementById('adminMsgPendingCount');

    if (!container) return;

    container.innerHTML = `
        <div style="text-align:center; padding:35px; color:#64748B;">
            <i class="fas fa-spinner fa-spin fa-2x" style="color:#2563EB; margin-bottom:10px;"></i>
            <p style="font-weight:600; margin:0;">Chargement de tous les échanges enseignants - parents...</p>
        </div>
    `;

    const section = secFilter ? secFilter.value : 'all';
    try {
        const res = await fetch(`/api/admin/all-messages?section=${section}&adminUser=${encodeURIComponent(loggedInUser || 'Admin')}`);
        if (!res.ok) throw new Error(`Erreur ${res.status}`);
        const data = await res.json();
        allAdminMessagesCache = data.messages || [];

        // Mise à jour des compteurs statistiques
        if (totalCountEl) totalCountEl.textContent = (data.stats && data.stats.total !== undefined) ? data.stats.total : allAdminMessagesCache.length;
        if (repliedCountEl) repliedCountEl.textContent = (data.stats && data.stats.replied !== undefined) ? data.stats.replied : allAdminMessagesCache.filter(m => m.replies && m.replies.length > 0).length;
        if (pendingCountEl) pendingCountEl.textContent = (data.stats && data.stats.pending !== undefined) ? data.stats.pending : allAdminMessagesCache.filter(m => !m.replies || m.replies.length === 0).length;

        renderAdminMessagesList(allAdminMessagesCache);
    } catch (err) {
        console.error('Erreur loadAdminAllMessages:', err);
        container.innerHTML = `<div style="background:#FEE2E2; color:#991B1B; padding:15px; border-radius:10px; font-weight:600; text-align:center;">Erreur de chargement: ${err.message}</div>`;
    }
}

function filterAdminMessagesLocally() {
    const searchVal = (document.getElementById('adminMsgSearchInput')?.value || '').toLowerCase().trim();
    if (!searchVal) {
        renderAdminMessagesList(allAdminMessagesCache);
        return;
    }

    const filtered = allAdminMessagesCache.filter(m => {
        const parentName = (m.parentName || '').toLowerCase();
        const teacherName = (m.teacherName || '').toLowerCase();
        const phone = (m.parentPhone || '').toLowerCase();
        const msg = (m.message || '').toLowerCase();
        const replies = (m.replies || []).map(r => (r.message || '') + ' ' + (r.senderName || '')).join(' ').toLowerCase();
        return parentName.includes(searchVal) || teacherName.includes(searchVal) || phone.includes(searchVal) || msg.includes(searchVal) || replies.includes(searchVal);
    });

    renderAdminMessagesList(filtered);
}

function renderAdminMessagesList(messages) {
    const container = document.getElementById('adminMessagesListContainer');
    if (!container) return;

    if (!messages || messages.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:40px; background:#F8FAFC; border:1px dashed #CBD5E1; border-radius:14px; color:#64748B;">
                <i class="fas fa-inbox fa-3x" style="color:#CBD5E1; margin-bottom:12px;"></i>
                <h4 style="margin:0 0 6px 0; color:#334155;">Aucun message trouvé</h4>
                <p style="margin:0; font-size:0.9rem;">Aucun échange ne correspond aux filtres actuels.</p>
            </div>
        `;
        return;
    }

    let html = '';
    messages.forEach(msg => {
        const hasReplies = msg.replies && msg.replies.length > 0;
        const statusBadge = hasReplies
            ? `<span style="background:#ECFDF5; color:#047857; border:1px solid #A7F3D0; font-size:0.75rem; font-weight:700; padding:3px 8px; border-radius:6px;"><i class="fas fa-check-circle"></i> Répondu (${msg.replies.length})</span>`
            : `<span style="background:#FFFBEB; color:#B45309; border:1px solid #FDE68A; font-size:0.75rem; font-weight:700; padding:3px 8px; border-radius:6px;"><i class="fas fa-clock"></i> En attente de réponse</span>`;

        const secBadge = msg.section === 'garcons'
            ? `<span style="background:#EFF6FF; color:#1D4ED8; font-size:0.75rem; font-weight:700; padding:3px 8px; border-radius:6px;">👦 Garçons</span>`
            : (msg.section === 'filles'
                ? `<span style="background:#FDF2F8; color:#BE185D; font-size:0.75rem; font-weight:700; padding:3px 8px; border-radius:6px;">👧 Filles</span>`
                : `<span style="background:#ECFDF5; color:#047857; font-size:0.75rem; font-weight:700; padding:3px 8px; border-radius:6px;">👶 Primaire</span>`);

        const dateStr = msg.createdAt ? new Date(msg.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : 'Date inconnue';

        let repliesHtml = '';
        if (hasReplies) {
            repliesHtml = `
                <div style="margin-top:12px; padding-top:12px; border-top:1px dashed #E2E8F0;">
                    <div style="font-size:0.8rem; font-weight:700; color:#475569; margin-bottom:8px; text-transform:uppercase;">
                        <i class="fas fa-reply"></i> Réponses de l'enseignant (${msg.replies.length}) :
                    </div>
                    <div style="display:flex; flex-direction:column; gap:8px;">
            `;
            msg.replies.forEach(rep => {
                const repDate = rep.createdAt ? new Date(rep.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '';
                repliesHtml += `
                    <div style="background:#F0FDF4; border:1px solid #DCFCE7; border-radius:8px; padding:10px 14px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                            <strong style="color:#166534; font-size:0.88rem;"><i class="fas fa-user-check"></i> ${escapeHtml(rep.senderName || msg.teacherName || 'Enseignant')}</strong>
                            <span style="color:#65A30D; font-size:0.75rem;">${repDate}</span>
                        </div>
                        <div style="color:#1E293B; font-size:0.92rem; line-height:1.4;">${escapeHtml(rep.message)}</div>
                    </div>
                `;
            });
            repliesHtml += `</div></div>`;
        }

        html += `
            <div style="background:white; border:1px solid #E2E8F0; border-radius:14px; padding:16px 20px; box-shadow:0 2px 8px rgba(0,0,0,0.03);">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
                    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                        ${secBadge}
                        ${statusBadge}
                        <span style="font-size:0.8rem; color:#64748B;"><i class="far fa-calendar-alt"></i> ${dateStr}</span>
                    </div>
                    <button type="button" onclick="deleteAdminMessage('${msg._id}')" class="pro-button danger-button" style="padding:4px 10px; font-size:0.75rem;" title="Supprimer ce message">
                        <i class="fas fa-trash-alt"></i> Supprimer
                    </button>
                </div>

                <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:10px; margin-bottom:10px; background:#F8FAFC; padding:10px 14px; border-radius:10px;">
                    <div>
                        <div style="font-size:0.75rem; color:#64748B; font-weight:700; text-transform:uppercase;">Parent Émetteur</div>
                        <div style="font-weight:700; color:#1E293B; font-size:0.95rem;">👤 ${escapeHtml(msg.parentName || 'Parent')}</div>
                        ${msg.parentPhone ? `<div style="font-size:0.82rem; color:#2563EB;"><i class="fas fa-phone-alt"></i> <a href="tel:${msg.parentPhone}" style="color:#2563EB; text-decoration:none;">${escapeHtml(msg.parentPhone)}</a></div>` : ''}
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:#64748B; font-weight:700; text-transform:uppercase;">Enseignant Destinataire</div>
                        <div style="font-weight:700; color:#1E293B; font-size:0.95rem;">👨‍🏫 ${escapeHtml(msg.teacherName || 'Enseignant')}</div>
                    </div>
                </div>

                <div style="background:#FFFFFF; border:1px solid #E2E8F0; border-radius:10px; padding:12px 14px; color:#1E293B; font-size:0.95rem; line-height:1.5;">
                    <div style="font-size:0.78rem; font-weight:700; color:#475569; margin-bottom:4px; text-transform:uppercase;">Message du Parent :</div>
                    ${escapeHtml(msg.message)}
                </div>

                ${repliesHtml}
            </div>
        `;
    });

    container.innerHTML = html;
}

async function deleteAdminMessage(msgId) {
    if (!confirm("Êtes-vous sûr de vouloir supprimer définitivement ce message ?")) return;
    try {
        const res = await fetch(`/api/admin/delete-message/${msgId}?adminUser=${encodeURIComponent(loggedInUser || 'Admin')}`, {
            method: 'DELETE'
        });
        const result = await res.json();
        if (res.ok && result.success) {
            displayAlert("Message supprimé avec succès.", false);
            loadAdminAllMessages();
        } else {
            throw new Error(result.message || "Erreur lors de la suppression");
        }
    } catch (err) {
        console.error("Erreur deleteAdminMessage:", err);
        displayAlert("Erreur suppression: " + err.message, true);
    }
}

// ===============================================
// 2. MODULE PUBLICATION DES PLANS HEBDO (ADMIN)
// ===============================================
let adminPublicationStatusMap = {};

async function loadAdminPublicationStatus() {
    const grid = document.getElementById('adminPlanPublicationGrid');
    if (!grid) return;

    const sectionSel = document.getElementById('adminPublicationSectionSelector');
    let section = sectionSel ? sectionSel.value : (currentSection || 'garcons');
    if (sectionSel && !sectionSel.value) {
        sectionSel.value = section;
    }

    grid.innerHTML = `
        <div style="grid-column:1/-1; text-align:center; padding:35px; color:#64748B;">
            <i class="fas fa-spinner fa-spin fa-2x" style="color:#10B981; margin-bottom:10px;"></i>
            <p style="font-weight:600; margin:0;">Chargement des statuts d'autorisation et de publication (${section === 'garcons' ? 'Garçons' : (section === 'filles' ? 'Filles' : 'Primaire')})...</p>
        </div>
    `;

    try {
        const res = await fetch(`/api/plan-publication-status?section=${encodeURIComponent(section)}`);
        if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`);
        const data = await res.json();
        
        adminPublicationStatusMap = data.statusMap || {};
        if (Array.isArray(data.publishedPlans)) {
            data.publishedPlans.forEach(p => {
                if (p.week !== undefined) {
                    adminPublicationStatusMap[p.week] = Boolean(p.published ?? p.isPublishedToParents);
                }
            });
        }

        renderAdminPublicationGrid(section);
    } catch (err) {
        console.error('Erreur loadAdminPublicationStatus:', err);
        grid.innerHTML = `<div style="grid-column:1/-1; color:#DC2626; background:#FEF2F2; border:1px solid #FECACA; border-radius:10px; padding:15px; text-align:center; font-weight:600;">Erreur: ${escapeHtml(err.message)}</div>`;
    }
}

function renderAdminPublicationGrid(section) {
    const grid = document.getElementById('adminPlanPublicationGrid');
    if (!grid) return;

    let html = '';
    const currentW = (typeof getCurrentWeekNumber === 'function' ? getCurrentWeekNumber() : (currentWeek || 1));

    for (let w = 1; w <= 38; w++) {
        const isPublished = (adminPublicationStatusMap[w] !== false);
        const isCurrent = (Number(w) === Number(currentW));

        const cardBg = isPublished ? '#F0FDF4' : '#FEF2F2';
        const borderColor = isPublished ? '#86EFAC' : '#FECACA';
        const statusText = isPublished ? 'Publié aux Parents ✅' : 'Masqué aux Parents 🔒';
        const statusColor = isPublished ? '#15803D' : '#B91C1C';

        const btnBg = isPublished ? '#EF4444' : '#10B981';
        const btnText = isPublished ? '🔒 Masquer aux Parents' : '✅ Autoriser & Publier';

        html += `
            <div style="background:${cardBg}; border:1.5px solid ${borderColor}; border-radius:14px; padding:14px 16px; display:flex; flex-direction:column; justify-content:space-between; gap:10px; box-shadow:0 2px 6px rgba(0,0,0,0.03);">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; align-items:center; gap:6px;">
                        <strong style="font-size:1.05rem; color:#1E1B4B;">Semaine ${w}</strong>
                        ${isCurrent ? '<span style="background:#3B82F6; color:white; font-size:0.7rem; font-weight:700; padding:2px 6px; border-radius:6px;">Actuelle</span>' : ''}
                    </div>
                    <span style="font-size:0.8rem; font-weight:700; color:${statusColor};">${statusText}</span>
                </div>
                <div style="font-size:0.8rem; color:#64748B; line-height:1.4;">
                    ${isPublished ? 'Visible par les parents dans leur espace.' : 'Masqué (les parents voient le message de validation).'}
                </div>
                <button type="button" onclick="togglePlanPublication(${w}, '${section}', ${!isPublished})" class="pro-button" style="background:${btnBg}; color:white; border:none; padding:8px 12px; font-size:0.85rem; font-weight:700; border-radius:8px; width:100%; cursor:pointer;">
                    ${btnText}
                </button>
            </div>
        `;
    }

    grid.innerHTML = html;
}

async function togglePlanPublication(weekNumber, section, newStatus) {
    const sec = section || document.getElementById('adminPublicationSectionSelector')?.value || currentSection || 'garcons';
    try {
        const res = await fetch('/api/admin/toggle-plan-publication', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                week: Number(weekNumber),
                weekNumber: Number(weekNumber),
                section: sec,
                published: Boolean(newStatus),
                isPublishedToParents: Boolean(newStatus),
                adminUser: loggedInUser || 'Admin'
            })
        });
        const result = await res.json();
        if (res.ok && (result.success || result.published !== undefined)) {
            adminPublicationStatusMap[weekNumber] = Boolean(newStatus);
            renderAdminPublicationGrid(sec);
            displayAlert(`Semaine ${weekNumber} : ${newStatus ? 'Publiée aux parents avec succès !' : 'Masquée aux parents avec succès.'}`, false);
        } else {
            throw new Error(result.error || result.message || "Erreur mise à jour statut");
        }
    } catch (err) {
        console.error("Erreur togglePlanPublication:", err);
        displayAlert("Erreur: " + err.message, true);
    }
}

async function bulkPublishAllWeeks(status) {
    const sec = document.getElementById('adminPublicationSectionSelector')?.value || currentSection || 'garcons';
    const sectionLabel = (sec === 'garcons' ? 'Section Garçons' : (sec === 'filles' ? 'Section Filles' : 'Section Primaire'));
    const confirmMsg = status
        ? `Voulez-vous autoriser et publier toutes les semaines (1 à 38) pour les parents (${sectionLabel}) ?`
        : `Voulez-vous masquer toutes les semaines (1 à 38) pour les parents (${sectionLabel}) ?`;
    if (!confirm(confirmMsg)) return;

    showProgressBar();
    updateProgressBar(0);
    let count = 0;

    for (let w = 1; w <= 38; w++) {
        try {
            const res = await fetch('/api/admin/toggle-plan-publication', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    week: Number(w),
                    weekNumber: Number(w),
                    section: sec,
                    published: Boolean(status),
                    isPublishedToParents: Boolean(status),
                    adminUser: loggedInUser || 'Admin'
                })
            });
            if (res.ok) {
                adminPublicationStatusMap[w] = Boolean(status);
                count++;
            }
        } catch (e) {
            console.error(`Erreur publication semaine ${w}:`, e);
        }
        updateProgressBar(Math.round((w / 38) * 100));
    }

    hideProgressBar();
    renderAdminPublicationGrid(sec);
    displayAlert(`Opération terminée : ${count}/38 semaines ${status ? 'publiées' : 'masquées'} (${sectionLabel}).`, false);
}

// =========================================================
// 3. MODULE TÉLÉCHARGEMENT PLAN COMPLET PAR CLASSE (WORD & EXCEL)
//    (Accessible à TOUS les enseignants & enseignantes pour
//     toutes les matières et tous les professeurs, totalement indépendant)
// =========================================================

function handleClassFilterChange() {
    sortAndDisplay();
    const selClass = document.getElementById('filterClasse')?.value;
    const btnQuickWord = document.getElementById('btnQuickClassFullWord');
    const btnQuickExcel = document.getElementById('btnQuickClassFullExcel');
    if (btnQuickWord) {
        if (selClass) {
            btnQuickWord.innerHTML = `<i class="fas fa-file-word" style="color:#2563EB;"></i> <span>Word (${escapeHtml(selClass)})</span>`;
            btnQuickWord.title = `Télécharger le document Word complet pour la classe ${selClass}`;
        } else {
            btnQuickWord.innerHTML = `<i class="fas fa-file-word" style="color:#2563EB;"></i> <span>Word Classe</span>`;
            btnQuickWord.title = `Choisir une classe pour télécharger le plan complet Word`;
        }
    }
    if (btnQuickExcel) {
        if (selClass) {
            btnQuickExcel.innerHTML = `<i class="fas fa-file-excel" style="color:#10B981;"></i> <span>Excel (${escapeHtml(selClass)})</span>`;
            btnQuickExcel.title = `Télécharger le fichier Excel complet pour la classe ${selClass}`;
        } else {
            btnQuickExcel.innerHTML = `<i class="fas fa-file-excel" style="color:#10B981;"></i> <span>Excel Classe</span>`;
            btnQuickExcel.title = `Choisir une classe pour télécharger le plan complet Excel`;
        }
    }
}

function openFullClassWordModal(preselectedClass, preselectedWeek) {
    const modal = document.getElementById('fullClassWordModal');
    const weekSel = document.getElementById('modalWordWeekSelector');
    const classSel = document.getElementById('modalWordClassSelector');
    const chipsContainer = document.getElementById('modalWordQuickClassChips');
    if (!modal) return;

    const curWeek = preselectedWeek || currentWeek || getCurrentWeekNumber() || 1;
    if (weekSel) {
        weekSel.innerHTML = '';
        for (let i = 1; i <= 38; i++) {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = `Semaine ${i}` + (i == curWeek ? ' (Semaine active)' : '');
            if (i == curWeek) opt.selected = true;
            weekSel.appendChild(opt);
        }
    }

    const currentFilterClass = preselectedClass || document.getElementById('filterClasse')?.value || document.getElementById('notesClassSelector')?.value || '';
    const section = currentSection || 'garcons';
    const classes = getSectionClasses(section);

    // Identifier les classes enseignées par l'utilisateur connecté
    const teacherClasses = new Set();
    if (planData && Array.isArray(planData) && loggedInUser) {
        const norm = (s) => String(s || '').trim().toLowerCase();
        const uE = norm(loggedInUser);
        const uTable = (typeof loggedInTeacherTable !== 'undefined' && loggedInTeacherTable) ? norm(loggedInTeacherTable) : '';
        planData.forEach(row => {
            const ensVal = getRowField(row, 'Enseignant');
            const clsVal = getRowField(row, 'Classe');
            if (ensVal && (norm(ensVal) === uE || (uTable && norm(ensVal) === uTable)) && clsVal) {
                teacherClasses.add(clsVal.trim());
            }
        });
    }

    // Remplir le sélecteur déroulant
    if (classSel) {
        classSel.innerHTML = '';
        classes.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            const isMine = teacherClasses.has(c);
            opt.textContent = (isMine ? '⭐ ' : '') + c + (isMine ? ' (Votre classe)' : '');
            if (c === currentFilterClass) opt.selected = true;
            classSel.appendChild(opt);
        });
    }

    // Remplir les puces / boutons de téléchargement rapide en 1 clic
    if (chipsContainer) {
        chipsContainer.innerHTML = '';
        classes.forEach(c => {
            const isMine = teacherClasses.has(c);
            const chipBtn = document.createElement('button');
            chipBtn.type = 'button';
            chipBtn.className = 'pro-button';
            chipBtn.style.padding = '6px 12px';
            chipBtn.style.fontSize = '0.85rem';
            chipBtn.style.fontWeight = '700';
            chipBtn.style.borderRadius = '8px';
            chipBtn.style.cursor = 'pointer';
            chipBtn.style.display = 'inline-flex';
            chipBtn.style.alignItems = 'center';
            chipBtn.style.gap = '6px';
            chipBtn.style.transition = 'all 0.2s ease';

            if (isMine) {
                chipBtn.style.background = '#EFF6FF';
                chipBtn.style.border = '1.5px solid #3B82F6';
                chipBtn.style.color = '#1D4ED8';
                chipBtn.innerHTML = `<span>⭐ ${escapeHtml(c)}</span> <i class="fas fa-arrow-down" style="font-size:0.75rem;"></i>`;
                chipBtn.title = `Sélectionner votre classe ${c}`;
            } else {
                chipBtn.style.background = '#F8FAFC';
                chipBtn.style.border = '1px solid #CBD5E1';
                chipBtn.style.color = '#334155';
                chipBtn.innerHTML = `<span>${escapeHtml(c)}</span>`;
                chipBtn.title = `Sélectionner ${c}`;
            }

            chipBtn.onclick = () => {
                if (classSel) classSel.value = c;
                // Highlighting selected chip
                Array.from(chipsContainer.children).forEach(ch => ch.style.outline = 'none');
                chipBtn.style.outline = '2px solid #2563EB';
            };

            chipsContainer.appendChild(chipBtn);
        });
    }

    modal.style.display = 'flex';
}

function closeFullClassWordModal() {
    const modal = document.getElementById('fullClassWordModal');
    if (modal) modal.style.display = 'none';
}

async function downloadSelectedClassFullWord() {
    const selClass = document.getElementById('filterClasse')?.value;
    if (selClass) {
        const week = currentWeek || getCurrentWeekNumber() || 1;
        await downloadFullClassWord(week, selClass);
    } else {
        openFullClassWordModal();
    }
}

async function downloadSelectedNotesClassFullWord() {
    const selClass = document.getElementById('notesClassSelector')?.value;
    if (selClass) {
        const week = currentWeek || getCurrentWeekNumber() || 1;
        await downloadFullClassWord(week, selClass);
    } else {
        openFullClassWordModal();
    }
}

async function downloadSelectedClassFullExcel() {
    const selClass = document.getElementById('filterClasse')?.value;
    if (selClass) {
        const week = currentWeek || getCurrentWeekNumber() || 1;
        await downloadFullClassExcel(week, selClass);
    } else {
        openFullClassWordModal();
    }
}

async function downloadFullClassWord(weekNum, className) {
    if (!className) {
        openFullClassWordModal();
        return;
    }

    showProgressBar();
    updateProgressBar(15);
    displayAlert(`Préparation du plan complet Word de la Semaine ${weekNum} pour la classe ${className}...`, false);

    try {
        const section = currentSection || 'garcons';
        updateProgressBar(40);

        const res = await fetch(`/api/plans/${weekNum}?section=${section}`);
        if (!res.ok) throw new Error(`Erreur réseau (${res.status})`);
        const data = await res.json();
        const fullPlanData = data.planData || [];

        if (fullPlanData.length === 0) {
            hideProgressBar();
            displayAlert(`Aucune donnée de plan enregistrée pour la Semaine ${weekNum} (${section}).`, true);
            return;
        }

        updateProgressBar(75);
        await exportClasseToWordDocx(className, fullPlanData, weekNum, section);
        updateProgressBar(100);
        displayAlert(`✅ Téléchargement réussi du plan Word complet pour ${className} !`, false);
    } catch (err) {
        console.error("Erreur downloadFullClassWord:", err);
        displayAlert("Erreur lors de la génération du plan complet: " + err.message, true);
    } finally {
        setTimeout(hideProgressBar, 800);
    }
}

async function downloadFullClassExcel(weekNum, className) {
    if (!className) {
        openFullClassWordModal();
        return;
    }

    showProgressBar();
    updateProgressBar(15);
    displayAlert(`Préparation du fichier Excel de la Semaine ${weekNum} pour la classe ${className}...`, false);

    try {
        const section = currentSection || 'garcons';
        updateProgressBar(40);

        const payload = {
            week: Number(weekNum),
            section: section,
            classe: className,
            notes: weeklyClassNotes
        };

        const res = await fetch('/api/generate-excel-workbook', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errJson = await res.json().catch(() => ({ message: `Erreur ${res.status}` }));
            throw new Error(errJson.message || `Erreur serveur (${res.status})`);
        }

        updateProgressBar(80);
        const blob = await res.blob();
        const cd = res.headers.get('content-disposition');
        let filename = `Plan_Hebdomadaire_S${weekNum}_${section}_${className.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`;
        if (cd) {
            const m = cd.match(/filename="?(.+?)"?(;|$)/i);
            if (m && m[1]) filename = m[1];
        }

        if (typeof saveAs === 'function') {
            saveAs(blob, filename);
        } else {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        }

        updateProgressBar(100);
        displayAlert(`✅ Téléchargement réussi du plan Excel complet pour ${className} !`, false);
    } catch (err) {
        console.error("Erreur downloadFullClassExcel:", err);
        displayAlert("Erreur lors de la génération du plan Excel: " + err.message, true);
    } finally {
        setTimeout(hideProgressBar, 800);
    }
}

async function exportClasseToWordDocx(selectedClass, rawPlanData, weekNum, section) {
    const norm = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();
    const classRows = (rawPlanData || []).filter(row => {
        const classVal = getRowField(row, 'Classe') || row['Classe'] || row['classe'];
        return classVal && norm(classVal) === norm(selectedClass);
    });

    if (classRows.length === 0) {
        throw new Error(`Aucune séance trouvée pour la classe ${selectedClass} en Semaine ${weekNum}.`);
    }

    const notes = (weeklyClassNotes && weeklyClassNotes[selectedClass]) || "";

    const payload = {
        week: Number(weekNum),
        classe: selectedClass,
        data: classRows,
        notes: notes,
        section: section || currentSection || 'garcons'
    };

    const res = await fetch('/api/generate-word', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        const errData = await res.json().catch(() => ({ message: `Erreur serveur ${res.status}` }));
        throw new Error(errData.message || `Erreur génération Word (${res.status})`);
    }

    const blob = await res.blob();
    const cd = res.headers.get('content-disposition');
    let filename = `plan_hebdo_S${weekNum}_${selectedClass.replace(/[^a-zA-Z0-9]/g, '_')}.docx`;
    if (cd) {
        const m = cd.match(/filename="?(.+?)"?(;|$)/i);
        if (m && m[1]) filename = m[1];
    }

    if (typeof saveAs === 'function') {
        saveAs(blob, filename);
    } else {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    }
}

async function executeFullClassWordDownload(explicitClass) {
    const weekSel = document.getElementById('modalWordWeekSelector');
    const classSel = document.getElementById('modalWordClassSelector');
    const btn = document.getElementById('btnExecuteWordDownload');
    const btnText = document.getElementById('btnExecuteWordText');

    const selectedWeek = weekSel ? weekSel.value : (currentWeek || 1);
    const selectedClass = explicitClass || (classSel ? classSel.value : '');

    if (!selectedClass) {
        alert("Veuillez sélectionner une classe.");
        return;
    }

    if (btn) {
        btn.disabled = true;
        if (btnText) btnText.textContent = "Génération Word...";
    }

    try {
        const section = currentSection || 'garcons';
        displayAlert(`Chargement du plan complet de la Semaine ${selectedWeek} pour la classe ${selectedClass}...`, false);

        const res = await fetch(`/api/plans/${selectedWeek}?section=${section}`);
        if (!res.ok) throw new Error(`Erreur lors du chargement (${res.status})`);
        const data = await res.json();
        const fullPlanData = data.planData || [];

        if (fullPlanData.length === 0) {
            alert(`Aucune donnée de plan enregistrée pour la Semaine ${selectedWeek} (${section}).`);
            return;
        }

        displayAlert(`Génération du document Word officiel complet pour ${selectedClass}...`, false);
        await exportClasseToWordDocx(selectedClass, fullPlanData, selectedWeek, section);
        displayAlert(`✅ Téléchargement du plan Word complet pour ${selectedClass} réussi !`, false);
        closeFullClassWordModal();
    } catch (err) {
        console.error("Erreur executeFullClassWordDownload:", err);
        alert("Erreur lors de la génération du document Word: " + err.message);
        displayAlert("Erreur génération Word: " + err.message, true);
    } finally {
        if (btn) {
            btn.disabled = false;
            if (btnText) btnText.textContent = "Télécharger Word (.docx)";
        }
    }
}

async function executeFullClassExcelDownload(explicitClass) {
    const weekSel = document.getElementById('modalWordWeekSelector');
    const classSel = document.getElementById('modalWordClassSelector');
    const btn = document.getElementById('btnExecuteExcelDownload');
    const btnText = document.getElementById('btnExecuteExcelText');

    const selectedWeek = weekSel ? weekSel.value : (currentWeek || 1);
    const selectedClass = explicitClass || (classSel ? classSel.value : '');

    if (!selectedClass) {
        alert("Veuillez sélectionner une classe.");
        return;
    }

    if (btn) {
        btn.disabled = true;
        if (btnText) btnText.textContent = "Génération Excel...";
    }

    try {
        await downloadFullClassExcel(selectedWeek, selectedClass);
        closeFullClassWordModal();
    } catch (err) {
        console.error("Erreur executeFullClassExcelDownload:", err);
        alert("Erreur lors du téléchargement Excel: " + err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            if (btnText) btnText.textContent = "Télécharger Excel (.xlsx)";
        }
    }
}
