package uz.dono.app.data

import java.time.Instant
import java.util.UUID

class DonoRepository(private val prefs: AppPreferences) {
    private val api = DonoApiClient(prefs)

    val isLiveMode: Boolean
        get() = prefs.isServerConfigured()

    private val demoSubjects = listOf(
        SubjectItem("sub-math", "Matematika", "Arifmetika, algebra va mantiqiy masalalar", "calculate", "#2563EB", 1, 2, 62),
        SubjectItem("sub-eng", "Ingliz tili", "Grammatika, so‘z boyligi va zamonlar", "language", "#059669", 2, 1, 15),
        SubjectItem("sub-uz", "Ona tili", "Imlo qoidalari va so‘z turkumlari", "menu_book", "#D97706", 3, 1, 12),
        SubjectItem("sub-rus", "Rus tili", "Grammatika, padejlar va leksika", "translate", "#7C3AED", 4, 1, 10)
    )

    private val demoQuizzes = mapOf(
        "sub-math" to listOf(
            QuizItem("quiz-math-1", "sub-math", "Ko‘paytirish va hisoblash asoslari", "10, 25 yoki 50 ta tezkor arifmetik savol", 20, 5, 50),
            QuizItem("quiz-math-2", "sub-math", "Tenglamalar va foizlar", "Chiziqli tenglamalar va foiz masalalari", 30, 5, 12)
        ),
        "sub-eng" to listOf(
            QuizItem("quiz-eng-1", "sub-eng", "English Grammar: Tenses & Basics", "Present va Past Simple zamonlari", 25, 5, 15)
        ),
        "sub-uz" to listOf(
            QuizItem("quiz-uz-1", "sub-uz", "Imlo va so‘z turkumlari", "O‘zbek tili imlosi bo‘yicha test", 25, 5, 12)
        ),
        "sub-rus" to listOf(
            QuizItem("quiz-rus-1", "sub-rus", "Rus tili: Asosiy grammatika", "Rod, ko‘plik va fe’l shakllari", 25, 5, 10)
        )
    )

    private val demoHistory = mutableListOf<AttemptHistoryItem>()
    private val demoFriends = mutableListOf<LeaderboardEntry>()

    suspend fun loginWithPhone(rawFullName: String, rawPhone: String): StudentProfile {
        val cleanName = rawFullName.trim().replace(Regex("\\s+"), " ")
        if (cleanName.length < 3) {
            throw DonoApiException("F.I.O (to‘liq ism-familiya) kiriting.")
        }
        val normalizedPhone = normalizeUzPhone(rawPhone)
            ?: throw DonoApiException("Telefon raqamini to‘g‘ri kiriting (masalan: +998 90 123 45 67).")

        val deviceId = prefs.getOrCreateDeviceId()
        return if (isLiveMode) {
            api.loginStudent(deviceId, cleanName, normalizedPhone).also {
                prefs.saveStudentSession(it)
            }
        } else {
            val parts = cleanName.split(" ")
            val profile = StudentProfile(
                id = UUID.randomUUID().toString(),
                phone = normalizedPhone,
                fullName = cleanName,
                deviceId = deviceId,
                recoveryCode = "DEMO2026",
                firstName = parts.firstOrNull().orEmpty(),
                lastName = parts.drop(1).joinToString(" "),
                region = "O‘zbekiston",
                totalPoints = 120,
                streakDays = 4,
                dailyQuestionsCount = 3,
                dailyGoalTarget = 10,
                levelName = computeLevelProgress(120).first
            )
            prefs.saveStudentSession(profile)
            profile
        }
    }

    suspend fun refreshSession(): StudentProfile? {
        val saved = prefs.getSavedStudent() ?: return null
        if (saved.phone.isBlank()) {
            prefs.clearStudentSession()
            return null
        }
        return if (isLiveMode) {
            try {
                api.loginStudent(saved.deviceId, saved.displayName, saved.phone).also {
                    prefs.saveStudentSession(it)
                }
            } catch (_: Exception) {
                saved
            }
        } else {
            saved
        }
    }

    suspend fun getSubjects(): List<SubjectItem> {
        return if (isLiveMode) api.getSubjects() else demoSubjects
    }

    suspend fun getQuizzes(subjectId: String): List<QuizItem> {
        return if (isLiveMode) api.getQuizzesForSubject(subjectId) else demoQuizzes[subjectId].orEmpty()
    }

    suspend fun getRandomQuestions(quizId: String, count: Int): List<QuestionItem> {
        return if (isLiveMode) {
            api.getRandomQuestions(quizId, count)
        } else {
            generateDemoQuestions(quizId).shuffled().take(count).map { shuffleDemoOptions(it) }
        }
    }

    private fun shuffleDemoOptions(q: QuestionItem): QuestionItem {
        val letters = listOf("A", "B", "C", "D")
        val pairs = listOf(
            "A" to q.optionA,
            "B" to q.optionB,
            "C" to q.optionC,
            "D" to q.optionD
        ).shuffled()
        val correctIdx = pairs.indexOfFirst { it.first.equals(q.correctOption, ignoreCase = true) }.coerceAtLeast(0)
        return q.copy(
            optionA = pairs[0].second,
            optionB = pairs[1].second,
            optionC = pairs[2].second,
            optionD = pairs[3].second,
            correctOption = letters[correctIdx]
        )
    }

    suspend fun submitAttempt(
        student: StudentProfile,
        subject: SubjectItem,
        quiz: QuizItem,
        requestedCount: Int,
        durationSec: Int,
        questions: List<QuestionItem>,
        answers: List<AnswerSubmission>
    ): SubmitAttemptResponse {
        if (isLiveMode) {
            val res = api.submitTestAttempt(student.id, quiz.id, requestedCount, durationSec, answers)
            val updated = student.copy(
                totalPoints = res.newTotalPoints,
                dailyQuestionsCount = student.dailyQuestionsCount + res.totalQuestions,
                levelName = res.levelName
            )
            prefs.saveStudentSession(updated)
            return res
        } else {
            val answerMap = answers.associateBy { it.questionId }
            var correct = 0
            questions.forEach { q ->
                val sel = answerMap[q.id]?.selectedOption
                if (sel != null && sel.equals(q.correctOption, ignoreCase = true)) {
                    correct++
                }
            }
            val wrong = questions.size - correct
            val earned = correct * quiz.pointsPerCorrect
            val newTotal = student.totalPoints + earned
            val levelName = computeLevelProgress(newTotal).first
            val updated = student.copy(
                totalPoints = newTotal,
                dailyQuestionsCount = student.dailyQuestionsCount + questions.size,
                levelName = levelName
            )
            prefs.saveStudentSession(updated)
            demoHistory.add(
                0,
                AttemptHistoryItem(
                    attemptId = UUID.randomUUID().toString(),
                    subjectName = subject.name,
                    quizTitle = quiz.title,
                    totalQuestions = questions.size,
                    correctCount = correct,
                    wrongCount = wrong,
                    earnedPoints = earned,
                    scorePercent = if (questions.isNotEmpty()) (correct * 100.0 / questions.size) else 0.0,
                    completedAt = Instant.now().toString()
                )
            )
            return SubmitAttemptResponse(
                attemptId = UUID.randomUUID().toString(),
                totalQuestions = questions.size,
                correctCount = correct,
                wrongCount = wrong,
                earnedPoints = earned,
                newTotalPoints = newTotal,
                levelName = levelName
            )
        }
    }

    suspend fun getLeaderboard(student: StudentProfile, scope: String): List<LeaderboardEntry> {
        if (isLiveMode) {
            return api.getLeaderboard(student.id, scope)
        }
        val base = listOf(
            LeaderboardEntry(1, "d1", "Toshmatov Jasur", "O‘zbekiston", 2910, 14, "Ustoz", false),
            LeaderboardEntry(2, "d2", "Karimova Dilnoza", "O‘zbekiston", 2480, 9, "Alloma", false),
            LeaderboardEntry(3, "d3", "Rahimova Malika", "O‘zbekiston", 2210, 7, "Alloma", false),
            LeaderboardEntry(4, student.id, student.displayName, student.region, student.totalPoints, student.streakDays, student.levelName, true)
        ) + demoFriends

        val filtered = when (scope) {
            "friends" -> base.filter { it.isMe || demoFriends.any { f -> f.id == it.id } }
            else -> base
        }
        return filtered.distinctBy { it.id }
            .sortedByDescending { it.totalPoints }
            .mapIndexed { index, item -> item.copy(rank = index + 1) }
    }

    suspend fun addFriend(studentId: String, identifier: String) {
        if (isLiveMode) {
            api.addFriendByIdentifier(studentId, identifier)
        } else {
            demoFriends.add(
                LeaderboardEntry(
                    0,
                    "friend-${identifier.uppercase()}",
                    "Do‘st (${identifier.uppercase()})",
                    "O‘zbekiston",
                    1450,
                    5,
                    "Zukko",
                    false
                )
            )
        }
    }

    suspend fun getHistory(studentId: String): List<AttemptHistoryItem> {
        return if (isLiveMode) api.getStudentHistory(studentId) else demoHistory.toList()
    }

    private fun generateDemoQuestions(quizId: String): List<QuestionItem> {
        return when (quizId) {
            "quiz-math-1" -> (1..50).map { i ->
                val a = 4 + (i % 11)
                val b = 3 + ((i * 3) % 12)
                val ans = a * b
                val pos = i % 4
                val correct = listOf("A", "B", "C", "D")[pos]
                QuestionItem(
                    id = "dm-$i",
                    quizId = quizId,
                    questionText = "Ifodaning qiymati nechaga teng?",
                    expressionText = "$a × $b",
                    optionA = if (pos == 0) "$ans" else "${ans - 2}",
                    optionB = if (pos == 1) "$ans" else "${ans + 4}",
                    optionC = if (pos == 2) "$ans" else "${ans - 4}",
                    optionD = if (pos == 3) "$ans" else "${ans + 6}",
                    correctOption = correct,
                    explanation = "$a × $b = $ans."
                )
            }
            else -> (1..10).map { i ->
                QuestionItem(
                    id = "dg-$quizId-$i",
                    quizId = quizId,
                    questionText = "$i-savol: To‘g‘ri javobni tanlang",
                    expressionText = null,
                    optionA = "1-variant",
                    optionB = "To‘g‘ri javob",
                    optionC = "3-variant",
                    optionD = "4-variant",
                    correctOption = "B",
                    explanation = "Bu namuna savol uchun izoh."
                )
            }
        }
    }
}
