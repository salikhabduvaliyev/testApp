-- DONO — Sample Seed Data (4 Subjects, Quizzes & 60+ Questions + Sample Students)
-- Run AFTER 001_initial_schema.sql in Supabase SQL Editor.

DO $$
DECLARE
  v_math_id uuid := '11111111-1111-1111-1111-111111111101';
  v_eng_id  uuid := '11111111-1111-1111-1111-111111111102';
  v_uz_id   uuid := '11111111-1111-1111-1111-111111111103';
  v_rus_id  uuid := '11111111-1111-1111-1111-111111111104';

  v_q_math_1 uuid := '22222222-2222-2222-2222-222222222201';
  v_q_math_2 uuid := '22222222-2222-2222-2222-222222222202';
  v_q_eng_1  uuid := '22222222-2222-2222-2222-222222222203';
  v_q_uz_1   uuid := '22222222-2222-2222-2222-222222222204';
  v_q_rus_1  uuid := '22222222-2222-2222-2222-222222222205';

  i int;
  a int;
  b int;
  ans int;
  pos int;
BEGIN
  -- Subjects
  INSERT INTO public.subjects (id, name, description, icon_key, color_hex, sort_order) VALUES
    (v_math_id, 'Matematika', 'Arifmetika, algebra va mantiqiy masalalar', 'calculate', '#2563EB', 1),
    (v_eng_id,  'Ingliz tili', 'Grammatika, so''z boyligi va zamonlar', 'language', '#059669', 2),
    (v_uz_id,   'Ona tili', 'Imlo qoidalari, so''z turkumlari va sintaksis', 'menu_book', '#D97706', 3),
    (v_rus_id,  'Rus tili', 'Grammatika, padejlar va leksika', 'translate', '#7C3AED', 4)
  ON CONFLICT (id) DO NOTHING;

  -- Quizzes
  INSERT INTO public.quizzes (id, subject_id, title, description, time_per_question_sec, points_per_correct) VALUES
    (v_q_math_1, v_math_id, 'Ko''paytirish va hisoblash asoslari', '10, 25 yoki 50 ta tezkor arifmetik savollar', 20, 5),
    (v_q_math_2, v_math_id, 'Tenglamalar va foizlar', 'Chiziqli tenglamalar va foizga doir masalalar', 30, 5),
    (v_q_eng_1,  v_eng_id,  'English Grammar: Tenses & Basics', 'Present Simple, Past Simple va asosiy qoidalar', 25, 5),
    (v_q_uz_1,   v_uz_id,   'Imlo va so''z turkumlari', 'O''zbek tili imlosi va grammatikasi bo''yicha testlar', 25, 5),
    (v_q_rus_1,  v_rus_id,  'Rus tili: Asosiy grammatika', 'Rod, ko''plik va asosiy fe''l shakllari', 25, 5)
  ON CONFLICT (id) DO NOTHING;

  -- 55 Math Questions for v_q_math_1 (supports 10, 25, and 50 question modes!)
  IF NOT EXISTS (SELECT 1 FROM public.questions WHERE quiz_id = v_q_math_1) THEN
    INSERT INTO public.questions (quiz_id, question_text, expression_text, option_a, option_b, option_c, option_d, correct_option, explanation) VALUES
      (v_q_math_1, 'Ifodaning qiymati nechaga teng?', '7 × 8', '54', '56', '64', '58', 'B', '7 ni 8 ga ko''paytirganda 56 hosil bo''ladi.'),
      (v_q_math_1, 'Ifodaning qiymatini toping:', '12 × 5', '50', '55', '60', '65', 'C', '12 × 5 = 60.'),
      (v_q_math_1, 'Bo''linmani hisoblang:', '144 ÷ 12', '11', '12', '13', '14', 'B', '12 × 12 = 144, demak 144 ÷ 12 = 12.'),
      (v_q_math_1, 'Ifodani soddalashtiring:', '9² − 11', '68', '70', '72', '80', 'B', '9² = 81; 81 − 11 = 70.'),
      (v_q_math_1, 'Yig''indini hisoblang:', '48 + 76', '114', '122', '124', '134', 'C', '48 + 76 = 124.');

    FOR i IN 1..50 LOOP
      a := 4 + (i % 11);
      b := 3 + ((i * 3) % 12);
      ans := a * b;
      pos := (i % 4);
      INSERT INTO public.questions (quiz_id, question_text, expression_text, option_a, option_b, option_c, option_d, correct_option, explanation)
      VALUES (
        v_q_math_1,
        'Ifodaning qiymati nechaga teng?',
        a || ' × ' || b,
        CASE WHEN pos = 0 THEN ans::text ELSE (ans - 2)::text END,
        CASE WHEN pos = 1 THEN ans::text ELSE (ans + 4)::text END,
        CASE WHEN pos = 2 THEN ans::text ELSE (ans - 4)::text END,
        CASE WHEN pos = 3 THEN ans::text ELSE (ans + 6)::text END,
        CASE pos WHEN 0 THEN 'A' WHEN 1 THEN 'B' WHEN 2 THEN 'C' ELSE 'D' END,
        a || ' × ' || b || ' = ' || ans || '.'
      );
    END LOOP;
  END IF;

  -- 15 Math Questions for v_q_math_2
  IF NOT EXISTS (SELECT 1 FROM public.questions WHERE quiz_id = v_q_math_2) THEN
    INSERT INTO public.questions (quiz_id, question_text, expression_text, option_a, option_b, option_c, option_d, correct_option, explanation) VALUES
      (v_q_math_2, 'Tenglamani yeching: x ni toping', '2x + 6 = 18', '4', '5', '6', '7', 'C', '2x = 18 − 6 = 12, x = 6.'),
      (v_q_math_2, '200 sonining 15 foizini toping:', '200 × 15%', '20', '25', '30', '35', 'C', '200 × 0.15 = 30.'),
      (v_q_math_2, 'Tenglamani yeching:', '5x − 10 = 35', '7', '8', '9', '10', 'C', '5x = 45, x = 9.'),
      (v_q_math_2, '80 sonining 25 foizi nechaga teng?', '80 × 25%', '15', '20', '25', '30', 'B', '25% bu to''rtdan bir qism: 80 ÷ 4 = 20.'),
      (v_q_math_2, 'x ning qiymatini toping:', '3(x − 2) = 15', '5', '6', '7', '8', 'C', 'x − 2 = 5, demak x = 7.'),
      (v_q_math_2, '150 ning 20% i nechaga teng?', '150 × 20%', '25', '30', '35', '40', 'B', '150 × 0.20 = 30.'),
      (v_q_math_2, 'Tenglamani yeching:', 'x ÷ 4 = 12', '3', '16', '36', '48', 'D', 'x = 12 × 4 = 48.'),
      (v_q_math_2, '400 ning 10 foizi qancha?', '400 × 10%', '4', '20', '40', '80', 'C', '400 ÷ 10 = 40.'),
      (v_q_math_2, 'Tenglamani yeching:', '7x = 63', '7', '8', '9', '11', 'C', '63 ÷ 7 = 9.'),
      (v_q_math_2, 'Qaysi sonning 50 foizi 45 ga teng?', 'x × 50% = 45', '75', '80', '90', '100', 'C', '50% yarmi degani: 45 × 2 = 90.'),
      (v_q_math_2, 'Tenglamani yeching:', '4x + 3 = 27', '5', '6', '7', '8', 'B', '4x = 24, x = 6.'),
      (v_q_math_2, '500 ning 12% ini toping:', '500 × 12%', '48', '50', '60', '72', 'C', '500 × 0.12 = 60.');
  END IF;

  -- 15 English Questions for v_q_eng_1
  IF NOT EXISTS (SELECT 1 FROM public.questions WHERE quiz_id = v_q_eng_1) THEN
    INSERT INTO public.questions (quiz_id, question_text, expression_text, option_a, option_b, option_c, option_d, correct_option, explanation) VALUES
      (v_q_eng_1, 'Bo''sh o''rinni to''ldiring:', 'She ___ to school every day.', 'go', 'goes', 'going', 'gone', 'B', 'Present Simple da 3-shaxs birlik (She) bilan fe''lga -es qo''shiladi.'),
      (v_q_eng_1, 'To''g''ri artiklni tanlang:', 'I bought ___ apple.', 'a', 'an', 'the', 'no article', 'B', '"apple" unli tovush bilan boshlangani uchun "an" ishlatiladi.'),
      (v_q_eng_1, 'O''tgan zamon shaklini toping:', 'Yesterday we ___ a movie.', 'watch', 'watches', 'watched', 'watching', 'C', 'Yesterday — Past Simple, to''g''ri fe''lga -ed qo''shiladi.'),
      (v_q_eng_1, 'To''g''ri variantni tanlang:', 'They ___ playing football now.', 'is', 'am', 'are', 'be', 'C', 'They ko''plik olmoshidan keyin "are" keladi.'),
      (v_q_eng_1, '"Book" so''zining ko''plik shakli:', 'One book, two ___', 'book', 'books', 'bookes', 'booking', 'B', 'Ko''pchilik otlarga ko''plikda -s qo''shiladi.'),
      (v_q_eng_1, 'Bo''sh o''rinni to''ldiring:', 'How ___ money do you have?', 'many', 'much', 'few', 'a lot', 'B', '"Money" sanalmaydigan ot bo''lgani uchun "much" ishlatiladi.'),
      (v_q_eng_1, 'Inkor gapni tuzing:', 'He ___ like coffee.', 'don''t', 'doesn''t', 'isn''t', 'aren''t', 'B', 'He/She/It uchun Present Simple inkor shakli "doesn''t".'),
      (v_q_eng_1, 'Qaysi so''z "tez" ma''nosini beradi?', 'Synonym of "quick"', 'slow', 'fast', 'heavy', 'short', 'B', '"Fast" — tez degani.'),
      (v_q_eng_1, 'To''g''ri predlogni tanlang:', 'The meeting is ___ Monday.', 'in', 'at', 'on', 'by', 'C', 'Hafta kunlari oldidan har doim "on" predlogi ishlatiladi.'),
      (v_q_eng_1, 'Qiyosiy darajani tanlang:', 'Tashkent is ___ than Samarkand.', 'big', 'bigger', 'biggest', 'more big', 'B', 'Qisqa sifatlarga qiyosiy darajada -er qo''shiladi (bigger).'),
      (v_q_eng_1, 'To''g''ri savolni toping:', '___ you speak English?', 'Does', 'Are', 'Do', 'Is', 'C', 'You bilan Present Simple savolida "Do" ishlatiladi.'),
      (v_q_eng_1, '"Go" fe''lining Past Simple shakli:', 'go -> ___', 'goed', 'went', 'gone', 'goes', 'B', 'Go noto''g''ri fe''l, o''tgan zamoni — went.');
  END IF;

  -- 12 Uzbek Language Questions for v_q_uz_1
  IF NOT EXISTS (SELECT 1 FROM public.questions WHERE quiz_id = v_q_uz_1) THEN
    INSERT INTO public.questions (quiz_id, question_text, expression_text, option_a, option_b, option_c, option_d, correct_option, explanation) VALUES
      (v_q_uz_1, 'Qaysi so''z imlo jihatdan to''g''ri yozilgan?', NULL, 'ma''lumot', 'malumot', 'ma`lumot', 'malu''mot', 'A', 'Tutuq belgisi bilan to''g''ri shakli — ma''lumot.'),
      (v_q_uz_1, '"Kitoblar" so''zidagi "-lar" qo''shimchasi qanday qo''shimcha?', NULL, 'Egalik qo''shimchasi', 'Ko''plik qo''shimchasi', 'Kelishik qo''shimchasi', 'So''z yasovchi', 'B', '"-lar" otlarga qo''shiladigan ko''plik qo''shimchasi.'),
      (v_q_uz_1, 'O''zbek tilida nechta kelishik mavjud?', NULL, '4 ta', '5 ta', '6 ta', '7 ta', 'C', 'Bosh, qaratqich, tushum, jo''nalish, o''rin-payt va chiqish — jami 6 ta.'),
      (v_q_uz_1, '"Chiroyli" so''zi qaysi so''z turkumiga kiradi?', NULL, 'Ot', 'Sifat', 'Fe''l', 'Ravish', 'B', 'Belgi bildirgani uchun sifat.'),
      (v_q_uz_1, 'Qaysi qatorda sinonim juftlik berilgan?', NULL, 'katta — kichik', 'baland — past', 'go''zal — chiroyli', 'oq — qora', 'C', 'Go''zal va chiroyli ma''nodosh (sinonim) so''zlardir.'),
      (v_q_uz_1, 'So''z yasovchi qo''shimcha qatnashgan so''zni toping:', NULL, 'maktabga', 'ishchi', 'uyim', 'bolalar', 'B', '"Ish" otidan "-chi" yasovchi qo''shimchasi orqali "ishchi" yasalgan.'),
      (v_q_uz_1, 'Qaysi gap turi his-hayajonni bildiradi?', NULL, 'Darak gap', 'So''roq gap', 'Undov gap', 'Buyruq gap', 'C', 'His-hayajon bilan aytiladigan gaplar undov gap deyiladi.'),
      (v_q_uz_1, 'O''zbek alifbosida nechta harf bor?', NULL, '26 ta', '29 ta', '31 ta', '33 ta', 'B', 'Lotin yozuviga asoslangan o''zbek alifbosida 29 ta harf (26 harf + sh, ch, ng) va tutuq belgisi bor.'),
      (v_q_uz_1, '"Tez yugurdi" birikmasida "tez" qanday so''z turkumi?', NULL, 'Sifat', 'Ravish', 'Son', 'Olmosh', 'B', 'Harakat belgisini bildirgani uchun ravish.'),
      (v_q_uz_1, 'Tushum kelishigi qo''shimchasi qaysi?', NULL, '-ning', '-ni', '-ga', '-da', 'B', 'Tushum kelishigi "-ni" qo''shimchasi bilan yasaladi.'),
      (v_q_uz_1, 'Antonim juftlikni toping:', NULL, 'do''st — o''rtoq', 'issiq — sovuq', 'quyosh — oftob', 'yaxshi — a''lo', 'B', 'Issiq va sovuq qarama-qarshi ma''noli antonimlardir.'),
      (v_q_uz_1, 'To''g''ri yozilgan qatorni toping:', NULL, 'sentabr', 'sentyabr', 'sintabr', 'sentiyabr', 'A', 'Hozirgi imlo qoidalariga ko''ra "sentabr" deb yoziladi.');
  END IF;

  -- 10 Russian Language Questions for v_q_rus_1
  IF NOT EXISTS (SELECT 1 FROM public.questions WHERE quiz_id = v_q_rus_1) THEN
    INSERT INTO public.questions (quiz_id, question_text, expression_text, option_a, option_b, option_c, option_d, correct_option, explanation) VALUES
      (v_q_rus_1, '"Книга" so''zi qaysi rodga (jinsga) tegishli?', NULL, 'Мужской род', 'Женский род', 'Средний род', 'Ko''plik', 'B', '-а bilan tugagan otlar odatda женский род ga kiradi.'),
      (v_q_rus_1, '"Окно" so''zi qaysi rodga tegishli?', NULL, 'Мужской род', 'Женский род', 'Средний род', 'Aniqlanmagan', 'C', '-о bilan tugagani uchun средний род.'),
      (v_q_rus_1, 'To''g''ri olmoshni tanlang:', '___ зовут Али.', 'Меня', 'Я', 'Мне', 'Мой', 'A', '"Меня зовут..." — Mening ismim...'),
      (v_q_rus_1, '"Стол" so''zining ko''plik shakli:', NULL, 'столы', 'столи', 'стола', 'столов', 'A', 'Ko''plik shakli — столы.'),
      (v_q_rus_1, 'Bo''sh o''rinni to''ldiring:', 'Мы ___ в школу.', 'иду', 'идёт', 'идём', 'идут', 'C', '"Мы" uchun fe''l shakli — идём.'),
      (v_q_rus_1, '"Большой" so''zining antonimi:', NULL, 'высокий', 'маленький', 'длинный', 'новый', 'B', 'Большой (katta) — маленький (kichik).'),
      (v_q_rus_1, 'Rus tilida nechta padej (kelishik) bor?', NULL, '4', '5', '6', '7', 'C', 'Именительный, родительный, дательный, винительный, творительный, предложный — 6 ta.'),
      (v_q_rus_1, 'To''g''ri tarjimani toping:', 'Я живу в Ташкенте.', 'Men Toshkentga ketyapman', 'Men Toshkentda yashayman', 'Men Toshkentdanman', 'Men Toshkentni sevaman', 'B', 'Живу в Ташкенте — Toshkentda yashayman.'),
      (v_q_rus_1, 'Sifatni moslashtiring:', '___ день (yaxshi kun)', 'хорошая', 'хорошее', 'хороший', 'хорошие', 'C', '"День" мужской род bo''lgani uchun "хороший".'),
      (v_q_rus_1, 'Bo''sh o''rinni to''ldiring:', 'У ___ есть книга.', 'я', 'меня', 'мне', 'мной', 'B', '"У меня есть..." tuzilmasida родительный padej ishlatiladi.');
  END IF;

  -- Sample Students for Leaderboard Demo
  IF NOT EXISTS (SELECT 1 FROM public.students) THEN
    INSERT INTO public.students (device_id, recovery_code, first_name, last_name, region, total_points, streak_days, daily_questions_count) VALUES
      ('demo-student-1', 'JASUR001', 'Jasur', 'Toshmatov', 'Toshkent shahri', 2910, 14, 15),
      ('demo-student-2', 'DILNOZA2', 'Dilnoza', 'Karimova', 'Samarqand viloyati', 2480, 9, 10),
      ('demo-student-3', 'MALIKA03', 'Malika', 'Rahimova', 'Farg''ona viloyati', 2210, 7, 10),
      ('demo-student-4', 'OTABEK04', 'Otabek', 'Sobirov', 'Toshkent viloyati', 1980, 5, 5),
      ('demo-student-5', 'SEVARA05', 'Sevara', 'Aliyeva', 'Buxoro viloyati', 1905, 6, 8);
  END IF;
END $$;

