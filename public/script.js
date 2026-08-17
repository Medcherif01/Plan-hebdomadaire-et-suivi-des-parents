        console.log("Script principal démarré.");

        // Variables globales
        let loggedInUser = null;
        let currentUserLanguage = 'fr';
        let currentSection = localStorage.getItem('selectedSection') || 'garcons';
        let planData = [];
        let filteredAndSortedData = [];
        let uploadedPlanData = null;
        let headers = [];
        let currentWeek = null;
        let weekStartDate = null;
        let weeklyClassNotes = {};
        let alertTimeoutId = null;
        let incompleteTeachersInfo = {};

        // --- Fonctions de Gestion de Section ---
        function chooseSection(section) {
            currentSection = section;
            localStorage.setItem('selectedSection', section);
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
        }

        function updateSectionBadges() {
            const isBoys = currentSection === 'garcons';
            const badgeText = isBoys ? 'Section Garçons 👦' : 'Section Filles 👧';
            const badgeClass = isBoys ? 'section-badge badge-garcons' : 'section-badge badge-filles';
            
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

            const adminFilter = document.getElementById('adminSectionFilter');
            if (adminFilter) {
                adminFilter.value = currentSection;
            }
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

        // Ordre/Traductions Classes
        const classOrder = ["PEI1", "PEI2", "PEI3", "PEI4", "PEI5", "DP1", "DP2"];
        const classTranslations = { 'PEI1':'السادس', 'PEI2':'الاول متوسط', 'PEI3':'الثاني متوسط', 'PEI4':'الثالث متوسط', 'PEI5':'الأول ثانوي', 'DP1':'الثاني ثانوي', 'DP2':'الثالث ثانوي' };
        function compareClasses(a, b) { const indexA = classOrder.indexOf(a); const indexB = classOrder.indexOf(b); if (indexA !== -1 && indexB !== -1) return indexA - indexB; if (indexA !== -1) return -1; if (indexB !== -1) return 1; return String(a).localeCompare(String(b)); }

        // Dates des semaines
        const specificWeekDateRanges = {
          1:{start:'2025-08-31',end:'2025-09-04'}, 2:{start:'2025-09-07',end:'2025-09-11'},
          3:{start:'2025-09-14',end:'2025-09-18'}, 4:{start:'2025-09-21',end:'2025-09-25'},
          5:{start:'2025-09-28',end:'2025-10-02'}, 6:{start:'2025-10-05',end:'2025-10-09'},
          7:{start:'2025-10-12',end:'2025-10-16'}, 8:{start:'2025-10-19',end:'2025-10-23'},
          9:{start:'2025-10-26',end:'2025-10-30'},10:{start:'2025-11-02',end:'2025-11-06'},
         11:{start:'2025-11-09',end:'2025-11-13'},12:{start:'2025-11-16',end:'2025-11-20'},
         13:{start:'2025-11-23',end:'2025-11-27'},14:{start:'2025-11-30',end:'2025-12-04'},
         15:{start:'2025-12-07',end:'2025-12-11'},16:{start:'2025-12-14',end:'2025-12-18'},
         17:{start:'2025-12-21',end:'2025-12-25'},18:{start:'2026-01-18',end:'2026-01-22'},
         19:{start:'2026-01-25',end:'2026-01-29'},20:{start:'2026-02-01',end:'2026-02-05'},
         21:{start:'2026-02-08',end:'2026-02-12'},22:{start:'2026-02-15',end:'2026-02-19'},
         23:{start:'2026-02-22',end:'2026-02-26'},24:{start:'2026-03-01',end:'2026-03-05'},
         25:{start:'2026-03-29',end:'2026-04-02'},26:{start:'2026-04-05',end:'2026-04-09'},
         27:{start:'2026-04-12',end:'2026-04-16'},28:{start:'2026-04-19',end:'2026-04-23'},
         29:{start:'2026-04-26',end:'2026-04-30'},30:{start:'2026-05-03',end:'2026-05-07'},
         31:{start:'2026-05-10',end:'2026-05-14'}
        };

        // --- Utilitaires ---
        function showProgressBar() { document.getElementById('progress-bar-container').style.display='block'; document.getElementById('progress-bar').style.width='0%'; document.getElementById('progress-bar').textContent='0%'; }
        function updateProgressBar(p) { const clampedP = Math.min(100, Math.max(0, p)); document.getElementById('progress-bar').style.width=clampedP+'%'; document.getElementById('progress-bar').textContent=clampedP+'%'; }
        function hideProgressBar() { setTimeout(() => { document.getElementById('progress-bar-container').style.display='none'; }, 500); }
        function displayAlert(msgKey, isErr = false, params = {}) { if (!msgKey) { const div=document.getElementById('message-alerte'); div.style.display='none'; div.textContent=''; div.className=''; if(alertTimeoutId) clearTimeout(alertTimeoutId); alertTimeoutId = null; return; } const msg = t(msgKey, params); console.log(`Alert:${isErr?'ERR':'OK'}-${msg}`); const div=document.getElementById('message-alerte'); div.textContent=msg; div.className = isErr ? 'alert-error' : (msgKey.includes('warn') || msgKey.includes('partial') ? 'alert-warning' : 'alert-success'); div.classList.add('message-alert-base'); div.style.display='block'; if(alertTimeoutId) clearTimeout(alertTimeoutId); alertTimeoutId=setTimeout(()=>{ if(div.textContent===msg){div.style.display='none'; div.textContent=''; div.className='';} alertTimeoutId=null; }, isErr ? 8000 : 5000); }
        function setButtonLoading(btnId, isLoading, iconClass) { const btn=document.getElementById(btnId); if(!btn) return; btn.disabled=isLoading; const icon=btn.querySelector('i'); if(icon) icon.className=isLoading ? 'fas fa-spinner fa-spin' : iconClass; }
        function containsArabic(text) { if (typeof text !== 'string') return false; const arabicRegex = /[\u0600-\u06FF]/; return arabicRegex.test(text); }
        function applyRTLToElement(element, content) { if (containsArabic(content)) { element.classList.add('arabic-content'); } else { element.classList.remove('arabic-content'); } }
        function formatDateForDisplay(d) { if (!d || isNaN(d.getTime())) return "Invalid Date"; const dayIndex = d.getUTCDay(); if (dayIndex === 5) { console.warn(`⚠️ Vendredi détecté (${d.toISOString().split('T')[0]}), remplacement par Jeudi`); d.setUTCDate(d.getUTCDate() - 1); } else if (dayIndex === 6) { console.warn(`⚠️ Samedi détecté (${d.toISOString().split('T')[0]}), remplacement par Dimanche suivant`); d.setUTCDate(d.getUTCDate() + 1); } const days = translations[currentUserLanguage].fullDays || translations.fr.fullDays; const months = translations[currentUserLanguage].months || translations.fr.months; const correctedDayIndex = d.getUTCDay(); const dayName = days[correctedDayIndex] || `Jour ${correctedDayIndex}`; const dayOfMonth = String(d.getUTCDate()).padStart(2, '0'); const monthName = months[d.getUTCMonth()]; const year = d.getUTCFullYear(); if (currentUserLanguage === 'en') { return `${dayName}, ${monthName} ${dayOfMonth}, ${year}`; } else { return `${dayName} ${dayOfMonth} ${monthName} ${year}`; } }
        const findHKey = (targetHeader) => { if (!headers || headers.length === 0 || !targetHeader) return null; const targetLower = targetHeader.trim().toLowerCase(); return headers.find(h => h?.trim().toLowerCase() === targetLower); };
        function getDateForDayName(dayNameFrench) { if(!weekStartDate || isNaN(weekStartDate.getTime())) return null; const dayMapFr = {"Dimanche":0, "Lundi":1, "Mardi":2, "Mercredi":3, "Jeudi":4}; const offset = dayMapFr[dayNameFrench]; if(offset === undefined) return null; const dt = new Date(Date.UTC(weekStartDate.getUTCFullYear(), weekStartDate.getUTCMonth(), weekStartDate.getUTCDate())); dt.setUTCDate(dt.getUTCDate() + offset); return dt; }
        function parseDateFromJourColumn(jourValue) { if (!jourValue || typeof jourValue !== 'string') return null; const trimmed = jourValue.trim(); const dayMapFr = {"Dimanche":0, "Lundi":1, "Mardi":2, "Mercredi":3, "Jeudi":4}; if (dayMapFr.hasOwnProperty(trimmed)) { return getDateForDayName(trimmed); } const frenchDateRegex = /^(Dimanche|Lundi|Mardi|Mercredi|Jeudi)\s+(\d{1,2})\s+(Janvier|Février|Mars|Avril|Mai|Juin|Juillet|Août|Septembre|Octobre|Novembre|Décembre)\s+(\d{4})$/i; const frenchMatch = trimmed.match(frenchDateRegex); if (frenchMatch) { const day = parseInt(frenchMatch[2], 10); const monthNames = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"]; const month = monthNames.findIndex(m => m.toLowerCase() === frenchMatch[3].toLowerCase()); const year = parseInt(frenchMatch[4], 10); if (month !== -1) { return new Date(Date.UTC(year, month, day)); } } const frenchDateNoDay = /^(\d{1,2})\s+(Janvier|Février|Mars|Avril|Mai|Juin|Juillet|Août|Septembre|Octobre|Novembre|Décembre)\s+(\d{4})$/i; const noDayMatch = trimmed.match(frenchDateNoDay); if (noDayMatch) { const day = parseInt(noDayMatch[1], 10); const monthNames = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"]; const month = monthNames.findIndex(m => m.toLowerCase() === noDayMatch[2].toLowerCase()); const year = parseInt(noDayMatch[3], 10); if (month !== -1) { return new Date(Date.UTC(year, month, day)); } } const isoRegex = /^(\d{4})-(\d{2})-(\d{2})$/; const isoMatch = trimmed.match(isoRegex); if (isoMatch) { const year = parseInt(isoMatch[1], 10); const month = parseInt(isoMatch[2], 10) - 1; const day = parseInt(isoMatch[3], 10); return new Date(Date.UTC(year, month, day)); } const dmyRegex = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/; const dmyMatch = trimmed.match(dmyRegex); if (dmyMatch) { const day = parseInt(dmyMatch[1], 10); const month = parseInt(dmyMatch[2], 10) - 1; const year = parseInt(dmyMatch[3], 10); return new Date(Date.UTC(year, month, day)); } const numValue = parseFloat(trimmed); if (!isNaN(numValue) && numValue > 0) { const excelEpoch = new Date(Date.UTC(1899, 11, 30)); const date = new Date(excelEpoch.getTime() + numValue * 86400000); if (!isNaN(date.getTime())) { return date; } } try { const attemptDate = new Date(trimmed); if (!isNaN(attemptDate.getTime())) { return attemptDate; } } catch (e) {} return null; }
        function extractDayName(jourValue) { if (!jourValue || typeof jourValue !== 'string') return null; const trimmed = jourValue.trim(); const dayNames = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi"]; if (dayNames.includes(trimmed)) { return trimmed; } const frenchDateRegex = /^(Dimanche|Lundi|Mardi|Mercredi|Jeudi)\s+/i; const match = trimmed.match(frenchDateRegex); if (match) { return match[1]; } const parsed = parseDateFromJourColumn(trimmed); if (parsed) { return dayNames[parsed.getUTCDay()]; } return null; }
        function formatUpdatedAt(dS) { if(!dS) return ''; try{const d=new Date(dS); if(isNaN(d.getTime())) return ''; return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; } catch(e){return '';} }

        // --- Fonctions Admin ---
        function handleFileUpload(event) { const file = event.target.files[0]; const statusSpan = document.getElementById('file-upload-status'); const saveBtn = document.getElementById('saveUploadedDataBtn'); uploadedPlanData = null; saveBtn.disabled = true; statusSpan.textContent = ''; if (!file) { statusSpan.textContent = t('no_file_selected'); return; } console.log(`[Admin Upload] Fichier: ${file.name}`); statusSpan.textContent = t('reading_file', { fileName: file.name }); if (!/\.(xlsx|xls)$/i.test(file.name)) { displayAlert("invalid_file_type", true); statusSpan.textContent = "Type invalide."; event.target.value = ''; return; } const reader = new FileReader(); reader.onload = function(e) { try { const data = e.target.result; const workbook = XLSX.read(data, { type: 'array' }); const firstSheetName = workbook.SheetNames[0]; const worksheet = workbook.Sheets[firstSheetName]; const jsonDataRaw = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null, raw: false }); if (!jsonDataRaw || jsonDataRaw.length < 1) throw new Error("Feuille Excel vide."); const headersRaw = jsonDataRaw[0]; if (!headersRaw || !Array.isArray(headersRaw) || headersRaw.length === 0) throw new Error("En-têtes non trouvés."); const extractedHeaders = headersRaw.map(h => h ? String(h).trim().replace(/\s+/g, ' ') : null).filter(Boolean); if (extractedHeaders.length === 0) throw new Error("Aucun en-tête valide."); const dataRows = jsonDataRaw.slice(1); uploadedPlanData = dataRows.map((row) => { if (!Array.isArray(row)) return null; const obj = {}; extractedHeaders.forEach((header, index) => { obj[header] = (row && index < row.length) ? row[index] : null; }); return Object.values(obj).some(val => val != null && String(val).trim() !== '') ? obj : null; }).filter(Boolean); console.log(`[Admin Upload] ${uploadedPlanData.length} lignes extraites.`); statusSpan.textContent = t('file_read_success', { count: uploadedPlanData.length }).replace(file.name, ''); displayAlert('file_read_success', false, { fileName: file.name, count: uploadedPlanData.length }); saveBtn.disabled = false; } catch (error) { console.error("Erreur lecture Excel:", error); displayAlert('file_error', true, { error: error.message }); statusSpan.textContent = t('file_error', { error: '' }).replace(': {error}', '.'); uploadedPlanData = null; saveBtn.disabled = true; event.target.value = ''; } }; reader.onerror = function(e) { console.error("Erreur FileReader:", e); displayAlert('file_error', true, { error: "Erreur FileReader" }); statusSpan.textContent = t('file_error', { error: '' }).replace(': {error}', '.'); uploadedPlanData = null; saveBtn.disabled = true; event.target.value = ''; }; reader.readAsArrayBuffer(file); }
        async function saveUploadedData() { const weekSelect = document.getElementById('weekSelector'); const selectedWeek = weekSelect.value; const statusSpan = document.getElementById('file-upload-status'); if (!selectedWeek) { displayAlert("please_select_week", true); return; } if (!uploadedPlanData || uploadedPlanData.length === 0) { displayAlert("no_data_to_save", true); return; } console.log(`[Admin Save] Enregistrement ${uploadedPlanData.length} lignes S${selectedWeek} (${currentSection}).`); displayAlert('saving_uploaded_data', false, { week: selectedWeek }); setButtonLoading('saveUploadedDataBtn', true, 'fas fa-database'); showProgressBar(); updateProgressBar(10); try { const response = await fetch('/api/save-plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ week: selectedWeek, data: uploadedPlanData, section: currentSection }) }); updateProgressBar(80); const result = await response.json(); if (!response.ok) throw new Error(result.message || `Erreur serveur ${response.status}`); updateProgressBar(100); displayAlert('uploaded_data_saved', false, { week: selectedWeek }); statusSpan.textContent = t('saved'); uploadedPlanData = null; document.getElementById('excelFileInput').value = ''; document.getElementById('saveUploadedDataBtn').disabled = true; if (selectedWeek === currentWeek) { console.log("[Admin Save] Rechargement..."); await loadPlanForWeek(); } else { displayAlert(`Données S${selectedWeek} OK. ${t('select_week_to_display').replace('les données', `S${selectedWeek}`)}`, false); } } catch (error) { console.error("Erreur enregistrement upload:", error); displayAlert('uploaded_data_error', true, { error: error.message }); statusSpan.textContent = t('error_saving_notes', { error: '' }).replace(': {error}', '.'); updateProgressBar(0); } finally { hideProgressBar(); setButtonLoading('saveUploadedDataBtn', false, 'fas fa-database'); } }
        async function populateAdminReportClassSelector() { const select = document.getElementById('adminReportClassSelector'); if (!select) return; select.innerHTML = `<option value="">${t('loading_classes')}</option>`; select.disabled = true; try { const response = await fetch(`/api/all-classes?section=${currentSection}`); if (!response.ok) throw new Error(`Erreur serveur ${response.status}`); const classes = await response.json(); if (classes && classes.length > 0) { select.innerHTML = `<option value="">${t('select_report_class')}</option>`; classes.sort(compareClasses).forEach(cls => { const opt = document.createElement('option'); opt.value = cls; const ar = classTranslations[cls]; opt.textContent = ar ? `${ar} (${cls})` : cls; select.appendChild(opt); }); select.disabled = false; } else { select.innerHTML = `<option value="">${t('no_classes_found')}</option>`; } } catch (error) { console.error("Erreur chargement des classes pour le rapport:", error); select.innerHTML = `<option value="">Erreur chargement</option>`; displayAlert('error', true, { error: 'Erreur chargement des classes.' }); } }
        async function generateFullReportByClass() { const classSelector = document.getElementById('adminReportClassSelector'); const selectedClass = classSelector.value; if (!selectedClass) { displayAlert('please_select_class_for_report', true); return; } console.log(`Demande de rapport complet pour la classe : ${selectedClass}`); displayAlert('generating_full_report', false, { classe: selectedClass }); setButtonLoading('generateFullReportBtn', true, 'fas fa-file-invoice'); showProgressBar(); updateProgressBar(10); try { const response = await fetch('/api/full-report-by-class', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ classe: selectedClass }) }); updateProgressBar(80); if (response.ok) { const blob = await response.blob(); const contentDisposition = response.headers.get('content-disposition'); let filename = `Rapport_Complet_${selectedClass}.xlsx`; if (contentDisposition) { const filenameMatch = contentDisposition.match(/filename="?(.+?)"?(;|$)/i); if (filenameMatch && filenameMatch[1]) { filename = filenameMatch[1]; } } saveAs(blob, filename); updateProgressBar(100); displayAlert('generating_full_report_success', false, { classe: selectedClass }); } else { const errorResult = await response.json().catch(() => ({ message: "Erreur inconnue du serveur." })); throw new Error(errorResult.message || `Erreur serveur ${response.status}`); } } catch (error) { console.error('Erreur lors de la génération du rapport complet:', error); displayAlert('generating_full_report_error', true, { classe: selectedClass, error: error.message }); updateProgressBar(0); } finally { hideProgressBar(); setButtonLoading('generateFullReportBtn', false, 'fas fa-file-invoice'); } }
        
        function populateNotesClassSelector() { const sel = document.getElementById('notesClassSelector'); const txt = document.getElementById('notesInput'); const btn = document.getElementById('saveNotesBtn'); sel.innerHTML = `<option value="">${t('select_class')}</option>`; const clsK = findHKey('Classe'); if (!clsK || !planData || planData.length === 0) { txt.disabled = true; btn.disabled = true; txt.placeholder = t('no_data'); return; } const uniqueCls = [...new Set(planData.map(i => i[clsK]).filter(Boolean))].sort(compareClasses); uniqueCls.forEach(cls => { const opt = document.createElement('option'); opt.value = cls; const ar = classTranslations[cls]; opt.textContent = ar ? `${ar} (${cls})` : cls; sel.appendChild(opt); }); txt.value = ''; txt.disabled = true; btn.disabled = true; txt.placeholder = t('select_class_placeholder'); }
        function displayClassNotes() { const sel=document.getElementById('notesClassSelector'); const txt=document.getElementById('notesInput'); const btn=document.getElementById('saveNotesBtn'); const selCls=sel.value; if(selCls && weeklyClassNotes) { const note=weeklyClassNotes[selCls]; txt.value=note||''; txt.disabled=false; btn.disabled=false; applyRTLToElement(txt, note||""); const selText = sel.options[sel.selectedIndex].text; txt.placeholder = t('notes_placeholder', { classText: selText }); } else { txt.value=''; txt.disabled=true; btn.disabled=true; txt.placeholder=selCls ? t('no_data') : t('select_class_placeholder'); } document.getElementById('notes-save-status').textContent=''; }
        async function saveNotes() { const statusEl=document.getElementById('notes-save-status'); const classSel=document.getElementById('notesClassSelector'); const selCls=classSel.value; if(!selCls){displayAlert("select_class",true); return;} if(!currentWeek){displayAlert("please_select_week",true); return;} statusEl.textContent = t('saving'); displayAlert(''); setButtonLoading('saveNotesBtn',true,'fas fa-save'); const notesVal=document.getElementById('notesInput').value; console.log(t('saving_notes_for', { class: selCls, week: currentWeek })); try{ const response=await fetch('/api/save-notes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({week:currentWeek,classe:selCls,notes:notesVal,section:currentSection})}); const result=await response.json(); if(!response.ok){throw new Error(result.message||`Erreur ${response.status}`);} weeklyClassNotes[selCls]=notesVal; displayAlert('notes_saved_success', false, { class: selCls, week: currentWeek }); statusEl.textContent = t('saved'); setTimeout(()=>{statusEl.textContent='';},3000); } catch(error){ console.error('Err saveNotes:',error); displayAlert('error_saving_notes', true, { error: error.message }); statusEl.textContent=`${t('error_saving_notes',{error:''}).replace(': {error}','')}: ${error.message}`; } finally{setButtonLoading('saveNotesBtn',false,'fas fa-save');} }
        function getCurrentWeekNumber() {
            const today = new Date();
            for (const [weekNum, dates] of Object.entries(specificWeekDateRanges)) {
                const startDate = new Date(dates.start + 'T00:00:00Z');
                const endDate = new Date(dates.end + 'T23:59:59Z');
                if (today >= startDate && today <= endDate) {
                    return parseInt(weekNum);
                }
            }
            return null;
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

        function checkAndDisplayIncompleteTeachers() { console.log("checkIncomplete"); incompleteTeachersInfo={}; const list=document.getElementById('incompleteList'); list.innerHTML=''; if(!planData||planData.length===0){list.innerHTML=`<li>${t('no_data')}</li>`; return;} const teacherKey=findHKey('Enseignant'); const classKey=findHKey('Classe'); const leconKey=findHKey('Leçon'); const taskKey=findHKey('Travaux de classe'); const supportKey=findHKey('Support'); const devoirsKey=findHKey('Devoirs'); if(!teacherKey||!classKey){console.warn("Manque cols Ens/Cls"); list.innerHTML=`<li>${t('error_config_columns')}</li>`; return;} planData.forEach(item=>{const teacher=item[teacherKey]; const clsName=item[classKey]; if(!teacher||!clsName) return; const leconVal=item[leconKey]; const taskVal=item[taskKey]; const supportVal=item[supportKey]; const devoirsVal=item[devoirsKey]; const isLeconEmpty=(leconVal==null||String(leconVal).trim()===''); const isTaskEmpty=(taskVal==null||String(taskVal).trim()===''); const isSupportEmpty=(supportVal==null||String(supportVal).trim()===''); const isDevoirsEmpty=(devoirsVal==null||String(devoirsVal).trim()===''); if(isLeconEmpty&&isTaskEmpty&&isSupportEmpty&&isDevoirsEmpty){if(!incompleteTeachersInfo[teacher]){incompleteTeachersInfo[teacher]=new Set();} incompleteTeachersInfo[teacher].add(clsName);}}); let teachers=Object.keys(incompleteTeachersInfo); const isAdmin=(loggedInUser==='Mohamed'||loggedInUser==='Zohra'||loggedInUser==='Imad'); if(!isAdmin&&loggedInUser){teachers=teachers.filter(t=>t===loggedInUser);} if(teachers.length===0){list.innerHTML=`<li>${t('all_complete')}</li>`;} else { teachers.sort().forEach(teacher=>{ const classes=[...incompleteTeachersInfo[teacher]].sort().join(', '); const li=document.createElement('li'); li.innerHTML = `<span class="incomplete-teacher-name">${teacher}</span> (<span class="incomplete-class-list">${classes}</span>)`; list.appendChild(li); }); } }
        function toggleIncompleteList() { const listDiv=document.getElementById('incompleteTeachersDisplay'); const btn=document.getElementById('toggleIncompleteBtn'); const btnTextSpan = btn.querySelector('.btn-text'); if(listDiv.style.display==='none'||listDiv.style.display===''){ listDiv.style.display='block'; btn.querySelector('i').className = 'fas fa-xmark'; if(btnTextSpan) btnTextSpan.textContent = t('hide_incomplete'); } else { listDiv.style.display='none'; btn.querySelector('i').className = 'fas fa-list-check'; if(btnTextSpan) btnTextSpan.textContent = t('display_incomplete'); } }
        async function fetchPlanData(week) { if (!week || isNaN(parseInt(week, 10))) { console.warn("fetchPlanData sans semaine valide."); displayPlanTable([]); document.getElementById('weekDateRange').textContent = t('please_select_week'); return; } if (!loggedInUser) { console.warn("Tentative chargement non connecté."); displayAlert("login_title", true); return; } console.log(`fetchPlanData S${week} (${currentSection}) pour ${loggedInUser}`); displayAlert('loading_data_week', false, { week: week }); showProgressBar(); updateProgressBar(10); currentWeek = week; const weekNum=parseInt(week,10); const dateRangeEl=document.getElementById('weekDateRange'); weekStartDate=null; planData=[]; headers=[]; weeklyClassNotes={}; dateRangeEl.textContent=`${t('week_label')} ${week}: ${t('loading')}`; displayPlanTable([]); updateActionButtonsState(false); const dates=specificWeekDateRanges[weekNum]; if(dates?.start&&dates?.end){try{const s=new Date(dates.start+'T00:00:00Z'); const e=new Date(dates.end+'T00:00:00Z'); if(!isNaN(s.getTime())&&!isNaN(e.getTime())){ weekStartDate=s; dateRangeEl.textContent = `${t('week_label')} ${week} : ${isArabicUser() ? 'من' : (currentUserLanguage === 'en' ? 'from' : 'du')} ${formatDateForDisplay(s)} ${isArabicUser() ? 'إلى' : (currentUserLanguage === 'en' ? 'to' : 'à')} ${formatDateForDisplay(e)}`;} else throw new Error();}catch(e){dateRangeEl.textContent=`S ${week} (Err dates)`; weekStartDate=null;}} else {dateRangeEl.textContent=`${t('week_label')} ${week} (${t('no_data')}: dates non définies)`; weekStartDate=null;} updateProgressBar(30); try{const r=await fetch(`/api/plans/${week}?section=${currentSection}`); updateProgressBar(70); if(!r.ok){const d=await r.json().catch(()=>null); throw new Error(d?.message || `Err ${r.status}`);} const fetched=await r.json(); if(fetched&&typeof fetched==='object'){planData=fetched.planData||[]; weeklyClassNotes=fetched.classNotes||{}; window.availableWeeklyPlans = fetched.availableWeeklyPlans || [];} else {planData=[]; weeklyClassNotes={}; window.availableWeeklyPlans = [];} updateProgressBar(90); if(planData.length>0){headers=Object.keys(planData[0]).filter(h=>h!=='_id'&&h!=='id'); if(loggedInUser==='Imad'){const enseignantKey=findHKey('Enseignant');const originalCount=planData.length;if(enseignantKey){planData=planData.filter(row=>arabicTeachers.includes(row[enseignantKey]));console.log(`[Imad Admin] Data filtered for Arabic teachers. ${planData.length}/${originalCount} rows remain.`)}} displayAlert('data_loaded_week', false, { week: week });} else {headers=[]; displayAlert('no_data_found_week', false, { week: week });} createTableHeader(); populateFilterOptions(); populateNotesClassSelector(); sortAndDisplay(); displayClassNotes(); checkAndDisplayIncompleteTeachers(); updateActionButtonsState(planData.length > 0); updateProgressBar(100); } catch(e){ console.error("Err fetchPlanData:",e); displayAlert('error_loading_week', true, { week: week, error: e.message }); planData=[]; headers=[]; weeklyClassNotes={}; createTableHeader(); populateFilterOptions(); populateNotesClassSelector(); sortAndDisplay(); displayClassNotes(); checkAndDisplayIncompleteTeachers(); updateProgressBar(0); updateActionButtonsState(false); } finally{hideProgressBar();} }
        
        function createTableHeader() {
            const tHead = document.querySelector('#planTable thead tr');
            tHead.innerHTML = '';
            const curH = headers || [];
            const hDisp = curH.filter(h => h !== '_id' && h !== 'id' && h.toLowerCase() !== 'updatedat');
            const headerTranslations = translations[currentUserLanguage].headers || translations.fr.headers;
            
            const leconKey = findHKey('Leçon');
            const supportKey = findHKey('Support');

            if (hDisp.length > 0) {
                hDisp.forEach(h => {
                    if (arabicTeachers.includes(loggedInUser) && (h === leconKey || h === supportKey)) {
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
        }

        function updateFilterOptionDefaultTexts() { const filters = [ { selId: 'filterEnseignant', defaultKey: 'all' }, { selId: 'filterClasse', defaultKey: 'all_f' }, { selId: 'filterMatiere', defaultKey: 'all_f' }, { selId: 'filterPeriode', defaultKey: 'all_f' }, { selId: 'filterJour', defaultKey: 'all' }, { selId: 'weekSelector', defaultKey: 'select_week' }, { selId: 'notesClassSelector', defaultKey: 'select_class' } ]; filters.forEach(f => { const select = document.getElementById(f.selId); if (select) { const defaultOption = select.querySelector('option[value=""]'); if (defaultOption) { defaultOption.textContent = t(f.defaultKey); } } }); const jSel = document.getElementById('filterJour'); if (jSel) { const dayOptions = jSel.querySelectorAll('option'); const dayValues = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi"]; const dayTransKeys = ["day_sun", "day_mon", "day_tue", "day_wed", "day_thu"]; dayOptions.forEach(opt => { if (opt.value !== "") { const idx = dayValues.indexOf(opt.value); if (idx !== -1) opt.textContent = t(dayTransKeys[idx]); } }); } const weekSel = document.getElementById('weekSelector'); if (weekSel) { const weekOptions = weekSel.querySelectorAll('option'); weekOptions.forEach(opt => { if (opt.value && opt.value.match(/^\d+$/)) { const weekLabel = t('week_label'); opt.textContent = `${weekLabel.replace(':', '')} ${opt.value}`; } }); } }
        function populateFilterOptions() { const data = planData || []; const getUniq = (k) => { const uniq = new Set(); data.forEach(i => { if (i && i[k] != null && i[k] !== '') { uniq.add(i[k]); } }); if (k?.trim().toLowerCase() === 'classe') { return [...uniq].sort(compareClasses); } else { return [...uniq].sort((a, b) => String(a).localeCompare(String(b))); } }; const ensK = findHKey('Enseignant'); const clsK = findHKey('Classe'); const perK = findHKey('Période'); const matK = findHKey('Matière'); const ens = ensK ? getUniq(ensK) : []; const cls = clsK ? getUniq(clsK) : []; const per = perK ? getUniq(perK) : []; const mat = matK ? getUniq(matK) : []; const updateSel = (id, opts, isCls = false) => { const sel = document.getElementById(id); const curV = sel.value; const defaultOptHTML = sel.querySelector('option[value=""]')?.outerHTML || `<option value="">${t(isCls ? 'all_f' : 'all')}</option>`; sel.innerHTML = defaultOptHTML; opts.forEach(o => { const opt = document.createElement('option'); opt.value = o; if (isCls) { const ar = classTranslations[o]; opt.textContent = ar ? `${ar} (${o})` : o; } else { opt.textContent = o; } sel.appendChild(opt); }); if (opts.includes(curV)) { sel.value = curV; } else { sel.value = ""; } }; updateSel('filterEnseignant', ens); updateSel('filterClasse', cls, true); updateSel('filterPeriode', per); updateSel('filterMatiere', mat); updateFilterOptionDefaultTexts(); const filterEnsSelect = document.getElementById('filterEnseignant'); if(loggedInUser&&loggedInUser!=='Mohamed'&&loggedInUser!=='Zohra'&&loggedInUser!=='Imad'){ filterEnsSelect.value = loggedInUser; filterEnsSelect.disabled = true; } else { filterEnsSelect.disabled = false; } }
        function sortAndDisplay() { const filterEnsSelect = document.getElementById('filterEnseignant'); if(loggedInUser&&loggedInUser!=='Mohamed'&&loggedInUser!=='Zohra'&&loggedInUser!=='Imad'){ filterEnsSelect.value = loggedInUser; filterEnsSelect.disabled = true; } else { filterEnsSelect.disabled = false; } const ensF = filterEnsSelect.value; const clsF = document.getElementById('filterClasse').value; const matF = document.getElementById('filterMatiere').value; const perF = document.getElementById('filterPeriode').value; const jF = document.getElementById('filterJour').value; const ensK = findHKey('Enseignant'); const clsK = findHKey('Classe'); const matK = findHKey('Matière'); const perK = findHKey('Période'); const jK = findHKey('Jour'); filteredAndSortedData = planData.filter(i => { if (!i) return false; const iE = ensK && i.hasOwnProperty(ensK) ? String(i[ensK]) : null; const iC = clsK && i.hasOwnProperty(clsK) ? String(i[clsK]) : null; const iM = matK && i.hasOwnProperty(matK) ? String(i[matK]) : null; const iP = perK && i.hasOwnProperty(perK) ? String(i[perK]) : null; const iJ = jK && i.hasOwnProperty(jK) ? String(i[jK]) : null; const pE = !ensF || iE === ensF; const pC = !clsF || iC === clsF; const pM = !matF || iM === matF; const pP = !perF || iP === perF; const dayNameFromData = iJ ? extractDayName(iJ) : null; const pJ = !jF || dayNameFromData === jF; return pE && pC && pM && pP && pJ; }); const dayValuesFr = { "Dimanche": 1, "Lundi": 2, "Mardi": 3, "Mercredi": 4, "Jeudi": 5 }; filteredAndSortedData.sort((a, b) => { const classA = (clsK && a.hasOwnProperty(clsK)) ? a[clsK] : null; const classB = (clsK && b.hasOwnProperty(clsK)) ? b[clsK] : null; const classComp = compareClasses(classA, classB); if (classComp !== 0) return classComp; const jA_fr = (jK && a.hasOwnProperty(jK)) ? extractDayName(String(a[jK])) : null; const jB_fr = (jK && b.hasOwnProperty(jK)) ? extractDayName(String(b[jK])) : null; const dayOrdA = dayValuesFr[jA_fr] || 99; const dayOrdB = dayValuesFr[jB_fr] || 99; const dC = dayOrdA - dayOrdB; if (dC !== 0) return dC; const pA = (perK && a.hasOwnProperty(perK)) ? a[perK] : null; const pB = (perK && b.hasOwnProperty(perK)) ? b[perK] : null; const piA = parseInt(pA, 10); const piB = parseInt(pB, 10); if (!isNaN(piA) && !isNaN(piB)) { return piA - piB; } else { const sA = pA == null ? '' : String(pA); const sB = pB == null ? '' : String(pB); return sA.localeCompare(sB); } }); displayPlanTable(filteredAndSortedData); updateActionButtonsState(filteredAndSortedData.length > 0); }
        
        function displayPlanTable(data) {
            const tBody = document.querySelector('#planTable tbody');
            const tHead = document.querySelector('#planTable thead tr');
            tBody.innerHTML = '';
            const actualHdrCount = tHead ? tHead.querySelectorAll('th').length : 0;
            const colspanVal = actualHdrCount > 0 ? actualHdrCount : 10;
            const curH = headers || [];
            const hDisp = curH.filter(h => h !== '_id' && h.toLowerCase() !== 'updatedat' && h !== 'id');
            const jK = findHKey('Jour');
            const clsK = findHKey('Classe');
            const updK = findHKey('updatedAt');
            const editHdrKeys = ['Leçon', 'Travaux de classe', 'Support', 'Devoirs'].map(k => findHKey(k)).filter(Boolean);
            const leconKey = findHKey('Leçon');
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
                console.log(`📊 Ligne ${rIdx}:`, {
                    Enseignant: rowObj[findHKey('Enseignant')],
                    Classe: rowObj[findHKey('Classe')],
                    Matière: rowObj[findHKey('Matière')],
                    lessonPlanId: rowObj.lessonPlanId || '❌ NON PRÉSENT'
                });
                const tr = document.createElement('tr');
                tr.dataset.rowIndex = rIdx;
                hDisp.forEach(header => {
                    if (arabicTeachers.includes(loggedInUser) && (header === leconKey || header === supportKey)) {
                        return;
                    }
                    
                    const td = document.createElement('td');
                    let content = rowObj ? (rowObj[header] ?? '') : '';
                    td.setAttribute('dir', 'auto');
                    if (header === jK && content) {
                        const dt = parseDateFromJourColumn(content);
                        td.textContent = dt ? formatDateForDisplay(dt) : content;
                    } else if (header === clsK && content) {
                        const ar = classTranslations[content];
                        td.textContent = ar ? `${ar} (${content})` : content;
                    } else if (editHdrKeys.includes(header)) {
                        td.contentEditable = true;
                        td.classList.add('editable');
                        td.textContent = content; // Utiliser textContent pour préserver les sauts de ligne
                        td.spellcheck = true;
                        applyRTLToElement(td, content); // Appliquer le style RTL si nécessaire
                        
                        // Nettoyer TOUS les sauts de ligne lors du collage (copier-coller externe)
                        td.addEventListener('paste', (e) => {
                            e.preventDefault();
                            const text = (e.clipboardData || window.clipboardData).getData('text');
                            // Supprimer TOUS les sauts de ligne et espaces superflus
                            const cleanedText = text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
                            document.execCommand('insertText', false, cleanedText);
                        });
                        
                        td.addEventListener('input', (e) => {
                            // ### CORRECTION : Utiliser innerText pour lire les sauts de ligne lors de la modification
                            if (rowObj) {
                                rowObj[header] = e.target.textContent;
                                applyRTLToElement(e.target, e.target.textContent); // Réappliquer le style RTL si nécessaire
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
                // Les enseignants peuvent générer leurs propres plans, l'admin peut tout générer
                const teacherKey = findHKey('Enseignant');
                const rowTeacher = teacherKey ? rowObj[teacherKey] : null;
                const canGenerate = (loggedInUser === 'Mohamed' || loggedInUser === rowTeacher);
                
                if (canGenerate) {
                    const aiGenBtn = document.createElement('button');
                    aiGenBtn.innerHTML = '<i class="fas fa-save"></i>';
                    aiGenBtn.title = 'Générer Plan de Leçon de cette séance';
                    aiGenBtn.classList.add('ai-lesson-plan-button');
                    aiGenBtn.style.marginLeft = '5px';
                    console.log('🔵 Bouton disquette créé:', aiGenBtn);
                    
                    // Changer la couleur si un plan de leçon existe déjà (vert au lieu de bleu)
                    if (rowObj && rowObj.lessonPlanId) {
                        console.log(`🟢 Bouton VERT pour lessonPlanId: ${rowObj.lessonPlanId}`);
                        aiGenBtn.classList.add('lesson-plan-exists');
                        aiGenBtn.title = 'Plan de Leçon déjà généré - Régénérer';
                    } else {
                        console.log(`🔵 Bouton BLEU (pas de lessonPlanId)`);
                    }
                    
                    aiGenBtn.onclick = () => generateAILessonPlan(rowObj, tr);
                    actTd.appendChild(aiGenBtn);
                }
                
                // Bouton pour télécharger le plan de leçon (si disponible)
                // Les enseignants peuvent télécharger leurs propres plans
                if (rowObj && rowObj.lessonPlanId) {
                    const teacherKey = findHKey('Enseignant');
                    const rowTeacher = teacherKey ? rowObj[teacherKey] : null;
                    const canDownload = (loggedInUser === 'Mohamed' || loggedInUser === rowTeacher);
                    
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
        async function saveRow(rowData, tableRowElement) { if(!rowData||typeof rowData!=='object'){displayAlert('invalid_row',true); return;} console.log("saveRow:",JSON.stringify(rowData).substring(0,100)+'...'); displayAlert(''); const btn=tableRowElement?.querySelector('.save-row-button'); const indicator=tableRowElement?.querySelector('.save-indicator'); const origBtnIcon = btn ? btn.querySelector('i')?.className || 'fas fa-check' : 'fas fa-check'; if(indicator) indicator.style.display='none'; if(btn){btn.innerHTML='<i class="fas fa-spinner fa-spin"></i>'; btn.disabled=true;} try{ if(!currentWeek){throw new Error(t('please_select_week'));} const response=await fetch('/api/save-row',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({week:currentWeek,data:rowData,section:currentSection})}); const result=await response.json(); if(!response.ok){throw new Error(result.message||`Erreur ${response.status}`);} if(tableRowElement){tableRowElement.classList.remove('modified');} if(indicator) indicator.style.display='inline-block'; if(result.updatedData?.updatedAt&&tableRowElement){ const updK=findHKey('updatedAt'); if(updK){ rowData[updK]=result.updatedData.updatedAt; const updCell=tableRowElement.querySelector('.updated-at-column'); if(updCell){updCell.textContent=formatUpdatedAt(result.updatedData.updatedAt);} } } } catch(e){ console.error('Erreur saveRow:',e); displayAlert('error_saving_row', true, { error: e.message }); if(indicator) indicator.style.display='none'; } finally{if(btn){btn.innerHTML=`<i class="${origBtnIcon}"></i>`; btn.disabled=false;} checkAndDisplayIncompleteTeachers();} }
        async function saveAllDisplayedRows() { if (!filteredAndSortedData || filteredAndSortedData.length === 0) { displayAlert('no_rows_to_save', true); return; } if (!currentWeek) { displayAlert("please_select_week", true); return; } const totalRows = filteredAndSortedData.length; const confirmation = confirm(t('confirm_save_all', { count: totalRows, week: currentWeek })); if (!confirmation) { displayAlert('save_all_cancelled', false); return; } displayAlert('saving_all_displayed', false, { count: totalRows }); setButtonLoading('saveAllDisplayedBtn', true, 'fas fa-save'); showProgressBar(); updateProgressBar(0); let successCount = 0; let errorCount = 0; const tableBody = document.querySelector('#planTable tbody'); for (let i = 0; i < totalRows; i++) { const rowData = filteredAndSortedData[i]; const rowIndex = i; updateProgressBar(Math.round(((i + 1) / totalRows) * 95)); try { const response = await fetch('/api/save-row', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ week: currentWeek, data: rowData, section: currentSection }) }); const result = await response.json(); if (!response.ok) { throw new Error(result.message || `Erreur ${response.status} L${rowIndex + 1}`); } successCount++; const tr = tableBody?.querySelector(`tr[data-row-index="${rowIndex}"]`); if (tr) { tr.classList.remove('modified'); const indicator = tr.querySelector('.save-indicator'); if (indicator) indicator.style.display = 'inline-block'; if (result.updatedData?.updatedAt) { const updK = findHKey('updatedAt'); if (updK) { rowData[updK] = result.updatedData.updatedAt; const updCell = tr.querySelector('.updated-at-column'); if (updCell) updCell.textContent = formatUpdatedAt(result.updatedData.updatedAt); } } } } catch (error) { console.error(`Err L${rowIndex + 1}:`, error); errorCount++; const tr = tableBody?.querySelector(`tr[data-row-index="${rowIndex}"]`); if(tr) { tr.style.backgroundColor = '#f8d7da'; tr.classList.add('modified'); const indicator = tr.querySelector('.save-indicator'); if(indicator) indicator.style.display = 'none'; } } } updateProgressBar(100); hideProgressBar(); setButtonLoading('saveAllDisplayedBtn', false, 'fas fa-save'); if (errorCount === 0) { displayAlert('save_all_success', false, { count: successCount }); } else { displayAlert('save_all_partial', true, { success: successCount, error: errorCount }); } checkAndDisplayIncompleteTeachers(); }
        async function generateWordByClasse() { const dataGen = filteredAndSortedData; if(!dataGen || dataGen.length === 0){ displayAlert("no_data_to_display_filters", true); return; } if(!currentWeek){displayAlert("please_select_week",true); return;} setButtonLoading('generateWordBtn', true, 'fas fa-file-word'); const dataCls = {}; const clsK = findHKey('Classe'); if (!clsK) { displayAlert("error_config_columns", true); setButtonLoading('generateWordBtn', false, 'fas fa-file-word'); return; } dataGen.forEach(i => { if (!i || !i[clsK]) return; const cl = i[clsK]; if (!dataCls[cl]) { dataCls[cl] = []; } dataCls[cl].push(i); }); const clsGen = Object.keys(dataCls); if (clsGen.length === 0) { displayAlert("no_data", true); setButtonLoading('generateWordBtn', false, 'fas fa-file-word'); return; } displayAlert('generating_word', false, { count: clsGen.length }); showProgressBar(); updateProgressBar(0); let ok = 0, err = 0; const total = clsGen.length; for (let i = 0; i < total; i++) { const cl = clsGen[i]; const clData = dataCls[cl]; const clNote = weeklyClassNotes[cl] || ""; updateProgressBar(Math.round(((i + 1) / total) * 100)); try { const payload = { week: currentWeek, classe: cl, data: clData, notes: clNote }; const r = await fetch('/api/generate-word', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); if (r.ok) { const blob = await r.blob(); const cd = r.headers.get('content-disposition'); let filename = `plan_s${currentWeek}_${cl.replace(/[^a-z0-9]/gi, '_')}.docx`; if (cd) { const m = cd.match(/filename="?(.+?)"?(;|$)/i); if (m && m[1]) filename = m[1]; } if (typeof saveAs === 'function') { try { saveAs(blob, filename); ok++; } catch (e) { err++; console.error(`SaveAs ${cl}:`, e); displayAlert(t('error', {error: `Err sauvegarde ${cl}: ${e.message}`}), true); } } else { err++; console.error("saveAs non défini!"); displayAlert(t('error', {error: "saveAs non trouvé."}), true); break; } } else { const d = await r.json().catch(() => ({ message: `Erreur ${r.status}` })); console.error(`Err Word ${cl}:`, r.status, d); if (d.message && d.message.includes('Dates non trouvées côté serveur')) { displayAlert('no_word_dates', true, {week: currentWeek}); err++; } else { displayAlert('error_generating_word_for', true, {classe: cl, error: (d.message || 'Inconnue')}); err++; } } } catch (e) { err++; console.error(`Err Fetch Word ${cl}:`, e); displayAlert('error', true, { error: `Erreur réseau Word ${cl}: ${e.message}` }); } } hideProgressBar(); setButtonLoading('generateWordBtn', false, 'fas fa-file-word'); if (ok > 0 && err === 0) { displayAlert('generating_word_success', false, { count: ok }); } else if (ok > 0 && err > 0) { displayAlert('generating_word_partial', true, { ok: ok, err: err }); } else if (ok === 0 && err > 0) { if (err > 1) { displayAlert('generating_word_failed', true, {err: err}); } } else if (ok === 0 && err === 0) { displayAlert("no_data", true); } }
        async function generateExcelWorkbook() { if (!currentWeek) { displayAlert("please_select_week", true); return; } setButtonLoading('generateExcelBtn',true,'fas fa-file-excel'); displayAlert('generating_excel', false, { week: currentWeek }); showProgressBar(); updateProgressBar(10); let err=0; try{ const payload = { week: currentWeek }; const r = await fetch('/api/generate-excel-workbook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); updateProgressBar(70); if(r.ok){const blob=await r.blob(); const cd=r.headers.get('content-disposition'); let filename=`plan_s${currentWeek}_complet.xlsx`; if(cd){const m=cd.match(/filename="?(.+?)"?(;|$)/i); if(m&&m[1]) filename=m[1];} if(typeof saveAs==='function'){try{saveAs(blob,filename); updateProgressBar(100); displayAlert('generating_excel_success', false, { filename: filename });} catch(e){err++; console.error(`SaveAs Excel:`,e); displayAlert(t('error', { error: `Err sauvegarde Excel: ${e.message}` }), true); updateProgressBar(0);}} else {err++; console.error("saveAs non défini!"); displayAlert(t('error', { error: "saveAs non trouvé." }), true); updateProgressBar(0);}} else { const d=await r.json().catch(()=>({message:`Err ${r.status}`})); console.error(`Err Excel Wb:`,r.status,d); displayAlert('error_generating_excel', true, { error: (d.message || 'Inconnue') }); updateProgressBar(0); err++;} } catch(e){err++; console.error(`Err Fetch Excel Wb:`,e); displayAlert('error', { error: `Err réseau Excel: ${e.message}` }, true); updateProgressBar(0);} finally{hideProgressBar(); setButtonLoading('generateExcelBtn',false,'fas fa-file-excel');} }
        async function loadPlanForWeek() { const sel = document.getElementById('weekSelector'); if (sel) { const wk = sel.value; if (wk) { await fetchPlanData(wk); } else { currentWeek = null; planData = []; headers = []; weeklyClassNotes = {}; filteredAndSortedData = []; createTableHeader(); displayPlanTable([]); document.getElementById('weekDateRange').textContent = ""; updateActionButtonsState(false); populateFilterOptions(); populateNotesClassSelector(); checkAndDisplayIncompleteTeachers(); displayAlert(''); } } else { console.error("#weekSelector absent"); displayAlert("error_structure", true); } }
        function applyLanguageSettings() { console.log(`Applying language: ${currentUserLanguage}`); document.documentElement.lang = currentUserLanguage; document.body.dir = (currentUserLanguage === 'ar') ? 'rtl' : 'ltr'; updateStaticUIElements(); if (currentWeek) { updateDynamicUIElements(); } else { document.getElementById('weekDateRange').textContent = ""; const initialTableMsg = document.getElementById('initial-table-message'); if (initialTableMsg) { initialTableMsg.textContent = t('select_week_to_display'); } else { const tBody = document.querySelector('#planTable tbody'); const colspanVal = document.querySelector('#planTable thead tr')?.querySelectorAll('th').length || 10; if (tBody) { tBody.innerHTML = `<tr id="initial-table-row"><td colspan="${colspanVal}" class="table-message">${t('select_week_to_display')}</td></tr>`; } } } if (document.getElementById('login-form').style.display !== 'none') { updateLoginUIElements(); } }
        function updateStaticUIElements() { console.log("Updating static UI for lang:", currentUserLanguage); if (document.getElementById('main-content').style.display !== 'none') { document.title = t('main_page_title'); } else { document.title = t('login_title'); } updateLoginUIElements(); const mainTitle = document.getElementById('main-title'); if(mainTitle) mainTitle.textContent = t('main_page_title'); const logoutBtnText = document.querySelector('#logout-button .btn-text'); if(logoutBtnText) logoutBtnText.textContent = t('logout_button'); const toggleBtn = document.getElementById('toggleIncompleteBtn'); if (toggleBtn) { const btnTextSpan = toggleBtn.querySelector('.btn-text'); const listDiv=document.getElementById('incompleteTeachersDisplay'); if (btnTextSpan) { btnTextSpan.textContent = (listDiv && listDiv.style.display !== 'none') ? t('hide_incomplete') : t('display_incomplete'); } } const incompleteH4 = document.querySelector('#incompleteTeachersDisplay h4'); if(incompleteH4) incompleteH4.textContent = t('incomplete_teachers_title'); const incompleteLi = document.querySelector('#incompleteList li'); if(incompleteLi && incompleteLi.textContent.match(/(Chargement|Loading|جاري التحميل)/)) incompleteLi.textContent = t('loading'); const weekLabel = document.querySelector('label[for="weekSelector"]'); if(weekLabel) weekLabel.innerHTML = `<i class="fas fa-calendar-week"></i> ${t('week_label')}`; const adminTitle = document.getElementById('admin-title'); if(adminTitle) adminTitle.textContent = t('admin_actions_title'); const adminExcelLabel = document.getElementById('admin-excel-label'); if(adminExcelLabel) adminExcelLabel.innerHTML = `<i class="fas fa-file-excel"></i> ${t('admin_excel_label')}`; const saveUploadedDataBtnText = document.querySelector('#saveUploadedDataBtn .btn-text'); if(saveUploadedDataBtnText) saveUploadedDataBtnText.textContent = t('admin_save_button'); const genWordBtnText = document.querySelector('#generateWordBtn .btn-text'); if(genWordBtnText) genWordBtnText.textContent = t('generate_word_button'); const genExcelBtnText = document.querySelector('#generateExcelBtn .btn-text'); if(genExcelBtnText) genExcelBtnText.textContent = t('generate_excel_button'); const saveAllBtnText = document.querySelector('#saveAllDisplayedBtn .btn-text'); if(saveAllBtnText) saveAllBtnText.textContent = t('save_all_button'); const weeklyLessonsBtnText = document.querySelector('#generateWeeklyLessonsBtn .btn-text'); if(weeklyLessonsBtnText) weeklyLessonsBtnText.textContent = t('generate_weekly_lessons_button'); const filterEnsLabel = document.getElementById('filter-enseignant-label'); if(filterEnsLabel) filterEnsLabel.innerHTML = `<i class="fas fa-user-tie"></i> ${t('filter_teacher_label')}`; const filterClsLabel = document.getElementById('filter-classe-label'); if(filterClsLabel) filterClsLabel.innerHTML = `<i class="fas fa-chalkboard-user"></i> ${t('filter_class_label')}`; const filterMatLabel = document.getElementById('filter-matiere-label'); if(filterMatLabel) filterMatLabel.innerHTML = `<i class="fas fa-book"></i> ${t('filter_material_label')}`; const filterPerLabel = document.getElementById('filter-periode-label'); if(filterPerLabel) filterPerLabel.innerHTML = `<i class="fas fa-clock"></i> ${t('filter_period_label')}`; const filterJourLabel = document.getElementById('filter-jour-label'); if(filterJourLabel) filterJourLabel.innerHTML = `<i class="fas fa-calendar-day"></i> ${t('filter_day_label')}`; const notesClsLabel = document.getElementById('notes-class-label'); if(notesClsLabel) notesClsLabel.innerHTML = `<i class="fas fa-sticky-note"></i> ${t('notes_for_class')}`; const notesInput = document.getElementById('notesInput'); if(notesInput && notesInput.placeholder.match(/(Sélectionnez|اختر|Select)/)){ notesInput.placeholder = t('select_class_placeholder'); } const saveNotesBtnText = document.querySelector('#saveNotesBtn .btn-text'); if(saveNotesBtnText) saveNotesBtnText.textContent = t('save_notes_button'); updateFilterOptionDefaultTexts(); const adminReportLabel = document.getElementById('admin-report-class-label'); if (adminReportLabel) adminReportLabel.innerHTML = `<i class="fas fa-school"></i> ${t('admin_report_class_label')}`; const adminReportBtnText = document.querySelector('#generateFullReportBtn .btn-text'); if (adminReportBtnText) adminReportBtnText.textContent = t('generate_full_report_button'); }
        function updateLoginUIElements() { const loginH1 = document.querySelector('#login-form h1'); if(loginH1) loginH1.textContent = t('login_title'); const userLabel = document.querySelector('label[for="username"]'); if(userLabel) userLabel.textContent = t('login_username_label'); const passLabel = document.querySelector('label[for="password"]'); if(passLabel) passLabel.textContent = t('login_password_label'); const rememberLabel = document.getElementById('remember-me-label'); if(rememberLabel) rememberLabel.textContent = t('remember_me'); const loginBtnText = document.querySelector('#login-button .btn-text'); if(loginBtnText) loginBtnText.textContent = t('login_button_text'); if (document.getElementById('login-form').style.display !== 'none') { document.title = t('login_title'); } }
        function updateDynamicUIElements() { console.log("Updating dynamic UI for lang:", currentUserLanguage); const dateRangeEl=document.getElementById('weekDateRange'); const weekNum = parseInt(currentWeek, 10); const dates = specificWeekDateRanges[weekNum]; if(weekStartDate && dates?.end){ const s = weekStartDate; const e = new Date(dates.end+'T00:00:00Z'); if(!isNaN(s.getTime())&&!isNaN(e.getTime())){ dateRangeEl.textContent = `${t('week_label')} ${currentWeek} : ${isArabicUser() ? 'من' : (currentUserLanguage === 'en' ? 'From' : 'Du')} ${formatDateForDisplay(s)} ${isArabicUser() ? 'إلى' : (currentUserLanguage === 'en' ? 'to' : 'à')} ${formatDateForDisplay(e)}`; } else { dateRangeEl.textContent=`${t('week_label')} ${currentWeek} (Err dates)`; } } else { dateRangeEl.textContent=`${t('week_label')} ${currentWeek} (${t('no_data')}: dates non définies)`; } createTableHeader(); displayPlanTable(filteredAndSortedData); const notesInput = document.getElementById('notesInput'); const notesClassSel = document.getElementById('notesClassSelector'); if (notesInput && notesClassSel) { if (notesClassSel.value) { const selText = notesClassSel.options[notesClassSel.selectedIndex].text; notesInput.placeholder = t('notes_placeholder', { classText: selText }); } else { notesInput.placeholder = t('select_class_placeholder'); } } }

        function initializeApp(username) {
            loggedInUser = username;
            
            if (arabicTeachers.includes(loggedInUser)) { currentUserLanguage = 'ar'; } 
            else if (englishTeachers.includes(loggedInUser)) { currentUserLanguage = 'en'; } 
            else { currentUserLanguage = 'fr'; } 
            
            console.log(`Initialisation pour ${loggedInUser} (Section: ${currentSection}, Lang: ${currentUserLanguage})`);
            
            const sectionSel = document.getElementById('section-selection');
            if (sectionSel) sectionSel.style.display = 'none';
            document.getElementById('login-form').style.display = 'none';
            document.getElementById('main-content').style.display = 'block';
            
            updateSectionBadges();
            applyLanguageSettings();
            
            document.getElementById('loggedInUserInfo').textContent = t('connected_as', { user: loggedInUser });
            
            const isAdminUser = (loggedInUser === 'Mohamed' || loggedInUser === 'Admin' || loggedInUser === 'Zohra' || loggedInUser === 'Imad');
            if (isAdminUser) { 
                document.getElementById('admin-actions').style.display = 'flex';
                populateAdminReportClassSelector();
                loadAdminUsersList();
                const lessonPlanGen = document.getElementById('lesson-plan-generator');
                if (lessonPlanGen) lessonPlanGen.style.display = 'flex';
            } else {
                document.getElementById('admin-actions').style.display = 'none';
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
            
            // Charger automatiquement la semaine SUIVANTE (N+1) par défaut
            const currentWeekNum = getCurrentWeekNumber();
            if (currentWeekNum) {
                const nextWeekNum = currentWeekNum + 1;
                const weekExists = specificWeekDateRanges[nextWeekNum];
                const weekToLoad = weekExists ? nextWeekNum : currentWeekNum;
                
                console.log(`📅 Semaine actuelle: ${currentWeekNum}, Chargement automatique: Semaine ${weekToLoad}`);
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
                    localStorage.setItem('authVersion', AUTH_VERSION.toString());
                    if (result.section) {
                        currentSection = result.section;
                        localStorage.setItem('selectedSection', result.section);
                    }
                    initializeApp(result.username);
                } else {
                    errorDiv.textContent = result.message || "Échec connexion.";
                    errorDiv.style.display = 'block';
                    localStorage.removeItem('loggedInUser');
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
            localStorage.removeItem('authVersion');
            
            loggedInUser = null;
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

        // --- Fonctions Admin de Gestion des Utilisateurs ---
        async function loadAdminUsersList() {
            const filterEl = document.getElementById('adminSectionFilter');
            const targetSection = filterEl ? filterEl.value : currentSection;
            const container = document.getElementById('usersTableContainer');
            if (!container) return;
            
            container.innerHTML = '<p style="text-align:center; padding:15px;"><i class="fas fa-spinner fa-spin"></i> Chargement de la liste des utilisateurs...</p>';
            
            try {
                const response = await fetch(`/api/admin/users?section=${targetSection}`);
                if (!response.ok) throw new Error(`Erreur ${response.status}`);
                const users = await response.json();
                
                if (!users || users.length === 0) {
                    container.innerHTML = '<p class="table-message" style="text-align:center; padding:15px;">Aucun utilisateur trouvé pour cette section.</p>';
                    return;
                }
                
                let html = `
                    <table class="users-table">
                        <thead>
                            <tr>
                                <th>Nom d'utilisateur</th>
                                <th>Mot de passe</th>
                                <th>Section</th>
                                <th>Rôle</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                `;
                
                users.forEach(u => {
                    const secLabel = u.section === 'garcons' ? '👦 Garçons' : '👧 Filles';
                    html += `
                        <tr>
                            <td><strong>${u.username}</strong></td>
                            <td><code>${u.password}</code></td>
                            <td>${secLabel}</td>
                            <td>${u.role || 'enseignant'}</td>
                            <td>
                                <button class="btn-sm-delete" onclick="adminDeleteUser('${u.username}', '${u.section}')">
                                    <i class="fas fa-trash-alt"></i> Supprimer
                                </button>
                            </td>
                        </tr>
                    `;
                });
                
                html += `</tbody></table>`;
                container.innerHTML = html;
            } catch (err) {
                console.error("Erreur chargement utilisateurs:", err);
                container.innerHTML = `<p style="color:red; padding:15px; text-align:center;">Erreur: ${err.message}</p>`;
            }
        }

        async function adminAddOrUpdateUser() {
            const userInput = document.getElementById('adminNewUsername');
            const passInput = document.getElementById('adminNewPassword');
            const filterEl = document.getElementById('adminSectionFilter');
            const statusDiv = document.getElementById('adminUsersStatus');
            
            const username = userInput ? userInput.value.trim() : '';
            const password = passInput ? passInput.value.trim() : '';
            const section = filterEl ? filterEl.value : currentSection;
            
            if (!username || !password) {
                if (statusDiv) {
                    statusDiv.textContent = '⚠️ Entrez le nom d\'utilisateur et le mot de passe.';
                    statusDiv.style.color = '#c0392b';
                }
                return;
            }
            
            try {
                const response = await fetch('/api/admin/users', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password, section })
                });
                const res = await response.json();
                if (response.ok) {
                    if (statusDiv) {
                        statusDiv.textContent = `✅ ${res.message}`;
                        statusDiv.style.color = '#27ae60';
                    }
                    if (userInput) userInput.value = '';
                    if (passInput) passInput.value = '';
                    loadAdminUsersList();
                } else {
                    throw new Error(res.message);
                }
            } catch (err) {
                if (statusDiv) {
                    statusDiv.textContent = `❌ Erreur: ${err.message}`;
                    statusDiv.style.color = '#c0392b';
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

function applyParentUIMode(enabled) {
    isParentMode = enabled;
    
    const plansTabBtn = document.getElementById('tab-plans-btn');
    const goToTeacherBtn = document.getElementById('go-to-teacher');
    const loggedInInfo = document.getElementById('loggedInUserInfo');
    const logoutBtn = document.getElementById('logout-button');
    const mainTitle = document.getElementById('main-title');
    
    if (enabled) {
        if (plansTabBtn) plansTabBtn.style.display = 'none'; // Masquer l'accès aux plans enseignants
        if (goToTeacherBtn) goToTeacherBtn.style.display = 'none'; // Masquer l'accès à l'espace enseignants
        if (loggedInInfo) loggedInInfo.textContent = 'Espace Parent 👨‍👩‍👧‍👦';
        if (logoutBtn) {
            logoutBtn.innerHTML = '<i class="fas fa-arrow-left"></i> <span class="btn-text">Retour Accueil</span>';
            logoutBtn.onclick = resetSectionChoice;
        }
        if (mainTitle) mainTitle.textContent = 'Espace Parents - Portail Suivi & Devoirs';
    } else {
        if (plansTabBtn) plansTabBtn.style.display = 'inline-block';
        if (goToTeacherBtn) goToTeacherBtn.style.display = 'inline-block';
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
            showHomeworkView('parent-plan');
        } else {
            showHomeworkView('homework-home');
        }
        loadHomeworkShowcase();
        loadTeachersContactGrid();
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
        viewName = 'parent-plan';
    }
    const views = ['homework-home', 'parent-selection', 'student-dashboard', 'homework-teacher', 'parent-plan'];
    views.forEach(v => {
        const el = document.getElementById(v + '-view');
        if (el) el.style.display = (v === viewName) ? 'block' : 'none';
    });
    if (viewName === 'parent-plan') {
        populateParentWeekSelector();
        loadParentWeeklyPlan();
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
    localStorage.setItem('currentSection', section);
    closeParentSectionModal();
    
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
    
    // Basculer vers le portail devoirs/parents
    switchMainTab('devoirs');
    showHomeworkView('parent-plan');
}

function toggleParentSection() {
    const newSection = (currentSection === 'garcons') ? 'filles' : 'garcons';
    currentSection = newSection;
    localStorage.setItem('currentSection', newSection);
    updateSectionBadges();
    
    // Recharger les données du plan parent, des contacts et des vitrines
    loadParentWeeklyPlan();
    loadTeachersContactGrid();
    loadHomeworkShowcase();
}

function populateParentWeekSelector() {
    const select = document.getElementById('parentWeekSelector');
    if (!select || select.options.length > 0) return;
    
    select.innerHTML = '';
    const activeWeek = getCurrentWeekNumber() || 17;
    
    for (const [weekNum, dates] of Object.entries(specificWeekDateRanges)) {
        const option = document.createElement('option');
        option.value = weekNum;
        
        let dateText = `Semaine ${weekNum}`;
        if (dates.start && dates.end) {
            const startD = new Date(dates.start + 'T00:00:00Z');
            const endD = new Date(dates.end + 'T00:00:00Z');
            const monthsFr = ["Janv.", "Févr.", "Mars", "Avril", "Mai", "Juin", "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc."];
            dateText = `Semaine ${weekNum} (${startD.getUTCDate()} ${monthsFr[startD.getUTCMonth()]} - ${endD.getUTCDate()} ${monthsFr[endD.getUTCMonth()]})`;
        }
        
        option.textContent = dateText;
        if (parseInt(weekNum, 10) === activeWeek) {
            option.selected = true;
        }
        select.appendChild(option);
    }
}

let parentRawPlanData = [];
let parentRawClassNotes = {};

async function loadParentWeeklyPlan() {
    try {
        const weekSelect = document.getElementById('parentWeekSelector');
        const classSelect = document.getElementById('parentClassSelector');
        const container = document.getElementById('parentPlanDisplayContainer');
        const statusBanner = document.getElementById('parentPlanStatusBanner');
        const notesBox = document.getElementById('parentClassNotesBox');
        const sectionToggleBtnText = document.getElementById('parentSectionToggleText');
        
        if (!weekSelect || !classSelect || !container) return;
        
        const selectedWeek = weekSelect.value || (getCurrentWeekNumber() || 17);
        const selectedClass = classSelect.value || 'PEI1';
        const section = currentSection || 'garcons';
        
        if (sectionToggleBtnText) {
            sectionToggleBtnText.textContent = section === 'garcons' ? 'Section Garçons 👦' : 'Section Filles 👧';
        }
        
        container.innerHTML = `
            <div style="text-align:center; padding:40px; background:white; border-radius:16px; box-shadow:0 4px 15px rgba(0,0,0,0.05);">
                <i class="fas fa-spinner fa-spin fa-2x" style="color:#10B981; margin-bottom:12px;"></i>
                <p style="color:#4B5563; font-size:1.05rem; font-weight:600; margin:0;">Chargement du plan hebdomadaire pour la classe ${selectedClass} (${section === 'garcons' ? 'Garçons' : 'Filles'})...</p>
            </div>
        `;
        
        const res = await fetch(`/api/plans/${selectedWeek}?section=${section}`);
        if (!res.ok) {
            container.innerHTML = `<div class="alert-error">Impossible de charger le plan hebdomadaire pour le moment.</div>`;
            return;
        }
        
        const data = await res.json();
        parentRawPlanData = data.planData || [];
        parentRawClassNotes = data.classNotes || {};
        
        // Filtrer les lignes pour la classe sélectionnée
        const classRows = parentRawPlanData.filter(row => {
            const classKey = findHKey('Classe');
            return classKey && row[classKey] === selectedClass;
        });
        
        // Vérifier si la saisie est complète pour cette classe
        let emptyCount = 0;
        classRows.forEach(row => {
            const leconKey = findHKey('Leçon');
            const taskKey = findHKey('Travaux de classe');
            const leconVal = leconKey ? row[leconKey] : null;
            const taskVal = taskKey ? row[taskKey] : null;
            if ((!leconVal || String(leconVal).trim() === '') && (!taskVal || String(taskVal).trim() === '')) {
                emptyCount++;
            }
        });
        
        const isComplete = (classRows.length > 0 && emptyCount === 0);
        
        if (statusBanner) {
            if (classRows.length === 0) {
                statusBanner.innerHTML = `
                    <div style="background:#F3F4F6; border:1px solid #D1D5DB; border-radius:14px; padding:16px 20px; color:#4B5563; font-weight:600; display:flex; align-items:center; gap:12px;">
                        <i class="fas fa-info-circle" style="font-size:1.5rem; color:#6B7280;"></i>
                        <span>Aucun plan publié pour la classe ${selectedClass} en Semaine ${selectedWeek}.</span>
                    </div>
                `;
            } else if (isComplete) {
                statusBanner.innerHTML = `
                    <div style="background:#ECFDF5; border:2px solid #10B981; border-radius:14px; padding:16px 22px; color:#065F46; font-weight:700; box-shadow:0 4px 12px rgba(16,185,129,0.15); display:flex; align-items:center; gap:14px;">
                        <i class="fas fa-check-circle" style="font-size:1.8rem; color:#10B981;"></i>
                        <div>
                            <div style="font-size:1.1rem; color:#065F46;">Plan Hebdomadaire Officiel - Saisie terminée ✅</div>
                            <div style="font-size:0.88rem; font-weight:500; color:#047857; margin-top:2px;">Tous les enseignants ont finalisé la préparation des cours pour la classe ${selectedClass} (Semaine ${selectedWeek}).</div>
                        </div>
                    </div>
                `;
            } else {
                statusBanner.innerHTML = `
                    <div style="background:#FFFBEB; border:2px solid #F59E0B; border-radius:14px; padding:16px 22px; color:#92400E; font-weight:700; box-shadow:0 4px 12px rgba(245,158,11,0.15); display:flex; align-items:center; gap:14px;">
                        <i class="fas fa-hourglass-half" style="font-size:1.8rem; color:#F59E0B;"></i>
                        <div>
                            <div style="font-size:1.1rem; color:#92400E;">Plan Hebdomadaire en cours de finalisation ⏳</div>
                            <div style="font-size:0.88rem; font-weight:500; color:#B45309; margin-top:2px;">L'équipe pédagogique finalise actuellement la saisie. Les cours déjà préparés pour la classe ${selectedClass} sont affichés ci-dessous.</div>
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
                            <i class="fas fa-sticky-note" style="color:#D97706;"></i> Remarques Générales de la Classe (${selectedClass}) :
                        </div>
                        <p style="margin:0; font-weight:400; font-size:0.95rem; white-space:pre-wrap;">${classNote}</p>
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
    const dayFilter = document.getElementById('parentDaySelector')?.value || 'all';
    
    if (!container) return;
    
    if (!rows || rows.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:40px; background:white; border-radius:16px; border:1px dashed #CBD5E1;">
                <i class="fas fa-calendar-times fa-3x" style="color:#9CA3AF; margin-bottom:12px;"></i>
                <p style="color:#6B7280; font-size:1.05rem; font-weight:600; margin:0;">Aucun cours enregistré pour cette sélection.</p>
            </div>
        `;
        return;
    }
    
    const dayOrder = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi"];
    const jourKey = findHKey('Jour');
    const periodeKey = findHKey('Période');
    const matiereKey = findHKey('Matière');
    const enseignantKey = findHKey('Enseignant');
    const leconKey = findHKey('Leçon');
    const travauxKey = findHKey('Travaux de classe');
    const devoirsKey = findHKey('Devoirs');
    const supportKey = findHKey('Support');
    
    // Grouper par jour
    const grouped = {};
    rows.forEach(r => {
        const dayVal = r[jourKey];
        const dayName = extractDayName(dayVal) || dayVal;
        if (dayName && dayOrder.includes(dayName)) {
            if (!grouped[dayName]) grouped[dayName] = [];
            grouped[dayName].push(r);
        }
    });
    
    let html = '';
    
    dayOrder.forEach(dayName => {
        if (dayFilter !== 'all' && dayFilter !== dayName) return;
        
        const dayRows = grouped[dayName];
        if (!dayRows || dayRows.length === 0) return;
        
        dayRows.sort((a, b) => (parseInt(a[periodeKey], 10) || 0) - (parseInt(b[periodeKey], 10) || 0));
        
        const weekStartDateNode = getDateForDayName(dayName);
        const formattedDayDate = weekStartDateNode ? formatDateForDisplay(weekStartDateNode) : dayName;
        
        html += `
            <div class="parent-day-card" style="background:white; border-radius:18px; box-shadow:0 4px 20px rgba(0,0,0,0.06); border:1px solid #E2E8F0; overflow:hidden;">
                <div style="background:linear-gradient(135deg, #1E1B4B, #312E81); color:white; padding:16px 24px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                    <div style="font-size:1.2rem; font-weight:700; display:flex; align-items:center; gap:10px;">
                        <i class="fas fa-calendar-day" style="color:#10B981;"></i>
                        <span>${formattedDayDate}</span>
                    </div>
                    <span style="background:rgba(255,255,255,0.15); padding:4px 12px; border-radius:20px; font-size:0.85rem; font-weight:600;">
                        ${dayRows.length} Séance(s)
                    </span>
                </div>
                
                <div style="padding:20px; display:flex; flex-direction:column; gap:16px;">
        `;
        
        dayRows.forEach(row => {
            const period = row[periodeKey] || '-';
            const matiere = row[matiereKey] || 'Matière non spécifiée';
            const enseignant = row[enseignantKey] || '';
            const lecon = row[leconKey] || '';
            const travaux = row[travauxKey] || '';
            const devoirs = row[devoirsKey] || '';
            const support = row[supportKey] || '';
            
            const isLessonEmpty = !lecon || lecon.trim() === '';
            const isHomeworkEmpty = !devoirs || devoirs.trim() === '';
            
            html += `
                <div class="parent-course-item" style="border:1px solid #E5E7EB; border-radius:14px; padding:18px; background:#FAFAFA; transition:all 0.2s ease;">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:12px; padding-bottom:10px; border-bottom:1px solid #E5E7EB;">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <span style="background:#EEF2FF; color:#4F46E5; font-weight:800; padding:6px 12px; border-radius:8px; font-size:0.9rem;">
                                Période ${period}
                            </span>
                            <h4 style="margin:0; color:#1E1B4B; font-size:1.15rem; font-weight:700;">${matiere}</h4>
                        </div>
                        ${enseignant ? `<span style="color:#6B7280; font-size:0.9rem; font-weight:600;"><i class="fas fa-chalkboard-teacher" style="color:#818CF8; margin-right:5px;"></i> ${enseignant}</span>` : ''}
                    </div>
                    
                    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:14px;">
                        <!-- Leçon / Sujet du cours -->
                        <div style="background:white; padding:12px 16px; border-radius:10px; border:1px solid #E2E8F0;">
                            <div style="font-size:0.82rem; font-weight:700; color:#6B7280; margin-bottom:4px; text-transform:uppercase;">
                                <i class="fas fa-book-reader" style="color:#3B82F6;"></i> Leçon / Sujet :
                            </div>
                            <div style="font-size:0.98rem; font-weight:600; color:${isLessonEmpty ? '#9CA3AF' : '#1F2937'};">
                                ${isLessonEmpty ? '<i>Non renseigné</i>' : lecon}
                            </div>
                        </div>
                        
                        <!-- Travail de classe -->
                        <div style="background:white; padding:12px 16px; border-radius:10px; border:1px solid #E2E8F0;">
                            <div style="font-size:0.82rem; font-weight:700; color:#6B7280; margin-bottom:4px; text-transform:uppercase;">
                                <i class="fas fa-tasks" style="color:#8B5CF6;"></i> Travail de classe :
                            </div>
                            <div style="font-size:0.95rem; color:#374151;">
                                ${travaux && travaux.trim() !== '' ? travaux : '<i>Exercices et activités en classe</i>'}
                            </div>
                        </div>
                    </div>
                    
                    <!-- Devoirs à la maison (Design vert pro) -->
                    <div style="margin-top:12px; background:${isHomeworkEmpty ? '#F9FAFB' : '#ECFDF5'}; border:1px solid ${isHomeworkEmpty ? '#E5E7EB' : '#A7F3D0'}; padding:12px 16px; border-radius:10px; color:${isHomeworkEmpty ? '#6B7280' : '#065F46'}; font-weight:600;">
                        <div style="font-size:0.85rem; font-weight:800; color:${isHomeworkEmpty ? '#9CA3AF' : '#059669'}; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
                            <i class="fas fa-pen-fancy"></i> Devoirs à la maison :
                        </div>
                        <div style="font-size:0.98rem; color:${isHomeworkEmpty ? '#9CA3AF' : '#064E3B'}; font-weight:${isHomeworkEmpty ? '400' : '700'};">
                            ${isHomeworkEmpty ? 'Aucun devoir à la maison pour ce cours' : devoirs}
                        </div>
                    </div>
                    
                    ${support && support.trim() !== '' ? `
                        <div style="margin-top:10px; font-size:0.88rem; color:#2563EB; font-weight:600;">
                            <i class="fas fa-link" style="margin-right:5px;"></i> Support : <a href="${support.startsWith('http') ? support : 'http://' + support}" target="_blank" style="color:#2563EB; text-decoration:underline;">${support}</a>
                        </div>
                    ` : ''}
                </div>
            `;
        });
        
        html += `
                </div>
            </div>
        `;
    });
    
    if (!html) {
        container.innerHTML = `
            <div style="text-align:center; padding:40px; background:white; border-radius:16px; border:1px dashed #CBD5E1;">
                <i class="fas fa-calendar-day fa-3x" style="color:#9CA3AF; margin-bottom:12px;"></i>
                <p style="color:#6B7280; font-size:1.05rem; font-weight:600; margin:0;">Aucun cours pour le jour sélectionné (${dayFilter}).</p>
            </div>
        `;
    } else {
        container.innerHTML = html;
    }
}

function filterParentPlanByDay() {
    const classSelect = document.getElementById('parentClassSelector');
    if (!classSelect || !parentRawPlanData) return;
    
    const selectedClass = classSelect.value || 'PEI1';
    const classRows = parentRawPlanData.filter(row => {
        const classKey = findHKey('Classe');
        return classKey && row[classKey] === selectedClass;
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

async function loadHomeworkShowcase() {
    try {
        const section = currentSection || 'garcons';

        // Élève de la semaine
        const sotwRes = await fetch(`/api/weekly-summary?section=${section}`);
        if (sotwRes.ok) {
            const data = await sotwRes.json();
            const sotwEl = document.getElementById('sotw-content');
            if (sotwEl) {
                if (data.studentsOfWeek && data.studentsOfWeek.length > 0) {
                    const st = data.studentsOfWeek[0];
                    sotwEl.innerHTML = `
                        <div style="background:white; padding:15px; border-radius:12px; display:inline-block; box-shadow:0 4px 10px rgba(0,0,0,0.05);">
                            <h4 style="margin:0; color:#667eea; font-size:1.2rem;">${st.name}</h4>
                            <p style="margin:5px 0; color:#6B7280; font-weight:600;">Classe: ${st.class}</p>
                            <p style="margin:0; color:#F59E0B; font-weight:bold;"><i class="fas fa-star"></i> ${st.stars} Étoiles cette semaine</p>
                        </div>
                    `;
                } else {
                    sotwEl.innerHTML = '<p style="color:#6B7280;">Aucun élève de la semaine sélectionné pour le moment.</p>';
                }
            }
        }

        // Photos de la journée
        const p1Res = await fetch(`/api/photo-of-the-day?section=${section}`);
        if (p1Res.ok) {
            const p1 = await p1Res.json();
            const el1 = document.getElementById('potd-content');
            if (el1) {
                if (p1.url) {
                    el1.innerHTML = `<img src="${p1.url}" class="potd-image"><p style="font-size:0.9em; font-weight:600; color:#374151;">${p1.comment || ''}</p>`;
                } else {
                    el1.innerHTML = '<p style="color:#9CA3AF;">Pas de photo enregistrée.</p>';
                }
            }
        }

        const p2Res = await fetch(`/api/photo-2?section=${section}`);
        if (p2Res.ok) {
            const p2 = await p2Res.json();
            const el2 = document.getElementById('photo2-content');
            if (el2) {
                if (p2.url) {
                    el2.innerHTML = `<img src="${p2.url}" class="potd-image"><p style="font-size:0.9em; font-weight:600; color:#374151;">${p2.comment || ''}</p>`;
                } else {
                    el2.innerHTML = '<p style="color:#9CA3AF;">Pas de photo enregistrée.</p>';
                }
            }
        }

        const p3Res = await fetch(`/api/photo-3?section=${section}`);
        if (p3Res.ok) {
            const p3 = await p3Res.json();
            const el3 = document.getElementById('photo3-content');
            if (el3) {
                if (p3.url) {
                    el3.innerHTML = `<img src="${p3.url}" class="potd-image"><p style="font-size:0.9em; font-weight:600; color:#374151;">${p3.comment || ''}</p>`;
                } else {
                    el3.innerHTML = '<p style="color:#9CA3AF;">Pas de photo enregistrée.</p>';
                }
            }
        }
    } catch (e) {
        console.error('Erreur loadHomeworkShowcase:', e);
    }
}

async function loadClassStudents(className) {
    try {
        const section = currentSection || 'garcons';
        const grid = document.getElementById('students-grid');
        if (grid) grid.innerHTML = '<p style="grid-column: 1/-1;">Chargement des élèves...</p>';

        const res = await fetch(`/api/admin/students?class=${className}&section=${section}`);
        if (res.ok) {
            const students = await res.json();
            if (grid) {
                if (!students || students.length === 0) {
                    grid.innerHTML = '<p style="grid-column: 1/-1;">Aucun élève trouvé pour cette classe.</p>';
                    return;
                }
                grid.innerHTML = students.map(s => `
                    <div class="teacher-contact-card" onclick="openStudentDashboard('${s.name}', '${className}')">
                        <img src="${s.photo || 'https://via.placeholder.com/100'}" class="teacher-contact-photo" alt="${s.name}" onerror="this.src='https://via.placeholder.com/100'">
                        <h4 style="margin:5px 0; color:#1e1b4b;">${s.name}</h4>
                        <p style="margin:0; font-size:0.85em; color:#6B7280;">${s.birthday ? 'Né(e) en ' + s.birthday : className}</p>
                    </div>
                `).join('');
            }
        }
    } catch (e) {
        console.error('Erreur loadClassStudents:', e);
    }
}

async function openStudentDashboard(studentName, className) {
    try {
        selectedStudentObj = { name: studentName, class: className };
        showHomeworkView('student-dashboard');

        const section = currentSection || 'garcons';
        document.getElementById('student-profile-name').innerText = studentName;
        document.getElementById('student-profile-details').innerText = `Classe: ${className} | Section: ${section === 'garcons' ? 'Garçons 👦' : 'Filles 👧'}`;

        // Récupérer photo
        const stRes = await fetch(`/api/admin/students?class=${className}&section=${section}`);
        if (stRes.ok) {
            const stList = await stRes.json();
            const matched = stList.find(s => s.name === studentName);
            if (matched && matched.photo) {
                document.getElementById('student-profile-photo').src = matched.photo;
            } else {
                document.getElementById('student-profile-photo').src = 'https://via.placeholder.com/100';
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

        // Devoirs du jour
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
// GESTION DES ÉLÈVES PAR L'ADMIN (ADMINISTRATION DEVOIRS)
// ============================================================================

async function loadAdminStudentsList() {
    try {
        const className = document.getElementById('adminStudentClassFilter')?.value || 'PEI1';
        const section = document.getElementById('adminStudentSectionFilter')?.value || 'garcons';
        const container = document.getElementById('studentsTableContainer');
        if (!container) return;

        container.innerHTML = '<p>Chargement des élèves...</p>';

        const res = await fetch(`/api/admin/students?class=${className}&section=${section}`);
        if (res.ok) {
            const students = await res.json();
            if (!students || students.length === 0) {
                container.innerHTML = '<p>Aucun élève trouvé.</p>';
                return;
            }

            container.innerHTML = `
                <table class="users-table">
                    <thead>
                        <tr>
                            <th>Photo</th>
                            <th>Nom</th>
                            <th>Classe</th>
                            <th>Anniversaire</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${students.map(s => `
                            <tr>
                                <td><img src="${s.photo || 'https://via.placeholder.com/40'}" style="width:40px; height:40px; border-radius:50%; object-fit:cover;" onerror="this.src='https://via.placeholder.com/40'"></td>
                                <td><strong>${s.name}</strong></td>
                                <td>${s.class}</td>
                                <td>${s.birthday || '-'}</td>
                                <td>
                                    <button class="btn-sm-delete" onclick="adminDeleteStudent('${s._id}', '${s.name}', '${s.class}')">
                                        <i class="fas fa-trash-alt"></i> Supprimer
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        }
    } catch (e) {
        console.error('Erreur loadAdminStudentsList:', e);
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
// PARENT & TEACHER MESSAGING UTILS
// ============================================================================

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
        const teachers = teachersSectionMap[currentSection] || teachersList;
        grid.innerHTML = teachers.map(t => `
            <div class="teacher-contact-card" onclick="openContactTeacherModal('${t}')">
                <i class="fas fa-user-tie" style="font-size:2rem; color:#667eea; margin-bottom:8px;"></i>
                <h4 style="margin:0; color:#1e1b4b;">${t}</h4>
                <p style="margin:5px 0; font-size:0.8em; color:#10B981;"><i class="fas fa-paper-plane"></i> Envoyer message</p>
            </div>
        `).join('');
    } catch (e) {
        console.error('Erreur loadTeachersContactGrid:', e);
    }
}

let targetTeacherForMessage = null;
function openContactTeacherModal(teacherName) {
    targetTeacherForMessage = teacherName;
    document.getElementById('contact-modal-title').innerText = `Contacter ${teacherName}`;
    const m = document.getElementById('contact-teacher-modal');
    if (m) m.style.display = 'flex';
}

function closeContactTeacherModal() {
    const m = document.getElementById('contact-teacher-modal');
    if (m) m.style.display = 'none';
}

async function submitParentMessage() {
    const text = document.getElementById('parentMessageText').value;
    if (!text) return;
    const pName = activeParentAccount ? `${activeParentAccount.firstName} ${activeParentAccount.lastName}` : 'Parent anonyme';
    const pPhone = activeParentAccount ? activeParentAccount.phone : '';

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
        alert('Message envoyé avec succès à l\'enseignant !');
        document.getElementById('parentMessageText').value = '';
        closeContactTeacherModal();
    }
}

async function openTeacherMessagesModal() {
    const teacherName = currentUser || 'all';
    const res = await fetch(`/api/get-messages?teacherName=${encodeURIComponent(teacherName)}&section=${currentSection}`);
    if (res.ok) {
        const messages = await res.json();
        alert(`Vous avez ${messages.length} message(s) de parents.`);
    }
}

async function loadTeacherHomeworks() {
    try {
        const className = document.getElementById('teacher-hw-class')?.value || 'PEI1';
        const dateStr = document.getElementById('teacher-hw-date')?.value || new Date().toISOString().split('T')[0];
        const section = currentSection || 'garcons';
        const wrapper = document.getElementById('teacher-evaluations-wrapper');
        if (!wrapper) return;

        wrapper.innerHTML = '<p>Chargement des élèves et devoirs...</p>';

        const [stRes, evRes] = await Promise.all([
            fetch(`/api/admin/students?class=${className}&section=${section}`),
            fetch(`/api/evaluations?class=${className}&date=${dateStr}&section=${section}`)
        ]);

        if (stRes.ok && evRes.ok) {
            const students = await stRes.json();
            const { homeworks = [], evaluations = [] } = await evRes.json();

            if (students.length === 0) {
                wrapper.innerHTML = '<p>Aucun élève trouvé pour cette classe.</p>';
                return;
            }

            wrapper.innerHTML = `
                <div style="background:white; padding:20px; border-radius:16px; box-shadow:0 4px 15px rgba(0,0,0,0.05);">
                    <h3 style="margin-bottom:15px; color:#1e1b4b;">Évaluation des Devoirs pour le ${dateStr} (${className})</h3>
                    <table class="users-table">
                        <thead>
                            <tr>
                                <th>Élève</th>
                                <th>Matière</th>
                                <th>Statut</th>
                                <th>Participation (/10)</th>
                                <th>Comportement (/10)</th>
                                <th>Commentaire</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${students.flatMap(s => {
                                const subjs = homeworks.length > 0 ? homeworks.map(h => h.subject) : ['Comportement / Devoirs'];
                                return subjs.map(subj => {
                                    const ev = evaluations.find(e => e.studentName === s.name && e.subject === subj) || {};
                                    return `
                                        <tr>
                                            <td><strong>${s.name}</strong></td>
                                            <td>${subj}</td>
                                            <td>
                                                <select class="teacher-eval-status" data-student="${s.name}" data-subject="${subj}">
                                                    <option value="Fait" ${ev.status === 'Fait' ? 'selected' : ''}>Fait</option>
                                                    <option value="Partiellement Fait" ${ev.status === 'Partiellement Fait' ? 'selected' : ''}>Partiellement Fait</option>
                                                    <option value="Non Fait" ${ev.status === 'Non Fait' ? 'selected' : ''}>Non Fait</option>
                                                    <option value="Absent" ${ev.status === 'Absent' ? 'selected' : ''}>Absent</option>
                                                </select>
                                            </td>
                                            <td><input type="number" min="0" max="10" value="${ev.participation || 8}" class="teacher-eval-part" data-student="${s.name}" data-subject="${subj}" style="width:60px;"></td>
                                            <td><input type="number" min="0" max="10" value="${ev.behavior || 8}" class="teacher-eval-beh" data-student="${s.name}" data-subject="${subj}" style="width:60px;"></td>
                                            <td><input type="text" value="${ev.comment || ''}" class="teacher-eval-comm" data-student="${s.name}" data-subject="${subj}" placeholder="Remarque"></td>
                                        </tr>
                                    `;
                                }).join('');
                            }).join('')}
                        </tbody>
                    </table>
                    <button class="pro-button success-button" onclick="saveTeacherEvaluations('${className}', '${dateStr}')" style="margin-top:20px; padding:12px 25px;">
                        <i class="fas fa-save"></i> Enregistrer toutes les évaluations
                    </button>
                </div>
            `;
        }
    } catch (e) {
        console.error('Erreur loadTeacherHomeworks:', e);
    }
}

async function saveTeacherEvaluations(className, dateStr) {
    try {
        const section = currentSection || 'garcons';
        const statuses = document.querySelectorAll('.teacher-eval-status');
        const evaluations = [];

        statuses.forEach(stEl => {
            const studentName = stEl.getAttribute('data-student');
            const subject = stEl.getAttribute('data-subject');
            const status = stEl.value;

            const partEl = document.querySelector(`.teacher-eval-part[data-student="${studentName}"][data-subject="${subject}"]`);
            const behEl = document.querySelector(`.teacher-eval-beh[data-student="${studentName}"][data-subject="${subject}"]`);
            const commEl = document.querySelector(`.teacher-eval-comm[data-student="${studentName}"][data-subject="${subject}"]`);

            evaluations.push({
                studentName,
                class: className,
                date: dateStr,
                subject,
                status,
                participation: parseInt(partEl?.value || 8),
                behavior: parseInt(behEl?.value || 8),
                comment: commEl?.value || '',
                section
            });
        });

        const res = await fetch('/api/evaluations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ evaluations, section })
        });

        if (res.ok) {
            // Recalculer les étoiles du jour
            await fetch('/api/daily-stars', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date: dateStr, section })
            });

            displayAlert('Évaluations enregistrées et étoiles recalculées !', false);
        }
    } catch (e) {
        console.error('Erreur saveTeacherEvaluations:', e);
    }
}
