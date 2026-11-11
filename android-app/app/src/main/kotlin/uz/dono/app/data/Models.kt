package uz.dono.app.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

fun normalizeUzPhone(input: String): String? {
    val trimmed = input.trim()
    val digits = trimmed.filter { it.isDigit() }
    return when {
        digits.length == 9 -> "+998$digits"
        digits.startsWith("998") -> if (digits.length == 12) "+$digits" else null
        trimmed.startsWith("+") && digits.length in 10..15 -> "+$digits"
        digits.length in 10..15 -> "+$digits"
        else -> null
    }
}

fun formatUzPhoneForDisplay(phone: String): String {
    val digits = phone.filter { it.isDigit() }
    if (digits.length == 12 && digits.startsWith("998")) {
        val d = digits.substring(3)
        return "+998 ${d.substring(0, 2)} ${d.substring(2, 5)} ${d.substring(5, 7)} ${d.substring(7, 9)}"
    }
    return phone
}

@Serializable
data class StudentProfile(
    val id: String,
    val phone: String = "",
    @SerialName("full_name") val fullName: String = "",
    @SerialName("device_id") val deviceId: String = "",
    @SerialName("recovery_code") val recoveryCode: String = "",
    @SerialName("first_name") val firstName: String = "",
    @SerialName("last_name") val lastName: String = "",
    val region: String = "O‘zbekiston",
    @SerialName("total_points") val totalPoints: Int = 0,
    @SerialName("streak_days") val streakDays: Int = 1,
    @SerialName("daily_questions_count") val dailyQuestionsCount: Int = 0,
    @SerialName("daily_goal_target") val dailyGoalTarget: Int = 10,
    @SerialName("level_name") val levelName: String = "Boshlovchi"
) {
    val displayName: String
        get() = fullName.ifBlank { "$firstName $lastName".trim() }.ifBlank { "O‘quvchi" }

    val shortGreetingName: String
        get() = firstName.ifBlank { displayName.substringBefore(" ") }.ifBlank { "O‘quvchi" }
}

@Serializable
data class SubjectItem(
    val id: String,
    val name: String,
    val description: String = "",
    @SerialName("icon_key") val iconKey: String = "menu_book",
    @SerialName("color_hex") val colorHex: String = "#2563EB",
    @SerialName("sort_order") val sortOrder: Int = 0,
    @SerialName("quiz_count") val quizCount: Int = 0,
    @SerialName("question_count") val questionCount: Int = 0
)

@Serializable
data class QuizItem(
    val id: String,
    @SerialName("subject_id") val subjectId: String,
    val title: String,
    val description: String = "",
    @SerialName("time_per_question_sec") val timePerQuestionSec: Int = 20,
    @SerialName("points_per_correct") val pointsPerCorrect: Int = 5,
    @SerialName("question_count") val questionCount: Int = 0
)

@Serializable
data class QuestionItem(
    val id: String,
    @SerialName("bank_id") val bankId: String? = null,
    @SerialName("quiz_id") val quizId: String? = null,
    @SerialName("question_text") val questionText: String,
    @SerialName("expression_text") val expressionText: String? = null,
    @SerialName("option_a") val optionA: String,
    @SerialName("option_b") val optionB: String,
    @SerialName("option_c") val optionC: String,
    @SerialName("option_d") val optionD: String,
    @SerialName("correct_option") val correctOption: String,
    @SerialName("shuffled_token") val shuffledToken: String? = null,
    val explanation: String = ""
) {
    fun textForOption(opt: String): String = when (opt.uppercase()) {
        "A" -> optionA
        "B" -> optionB
        "C" -> optionC
        "D" -> optionD
        else -> ""
    }
}

@Serializable
data class AnswerSubmission(
    @SerialName("question_id") val questionId: String,
    @SerialName("selected_option") val selectedOption: String?,
    @SerialName("shuffled_token") val shuffledToken: String? = null
)

@Serializable
data class SubmitAttemptResponse(
    @SerialName("attempt_id") val attemptId: String,
    @SerialName("total_questions") val totalQuestions: Int,
    @SerialName("correct_count") val correctCount: Int,
    @SerialName("wrong_count") val wrongCount: Int,
    @SerialName("earned_points") val earnedPoints: Int,
    @SerialName("new_total_points") val newTotalPoints: Int,
    @SerialName("level_name") val levelName: String
)

@Serializable
data class LeaderboardEntry(
    val rank: Int,
    val id: String,
    @SerialName("full_name") val fullName: String,
    val region: String,
    @SerialName("total_points") val totalPoints: Int,
    @SerialName("streak_days") val streakDays: Int,
    @SerialName("level_name") val levelName: String,
    @SerialName("is_me") val isMe: Boolean
)

@Serializable
data class AttemptHistoryItem(
    @SerialName("attempt_id") val attemptId: String,
    @SerialName("subject_name") val subjectName: String,
    @SerialName("quiz_title") val quizTitle: String,
    @SerialName("total_questions") val totalQuestions: Int,
    @SerialName("correct_count") val correctCount: Int,
    @SerialName("wrong_count") val wrongCount: Int,
    @SerialName("earned_points") val earnedPoints: Int,
    @SerialName("score_percent") val scorePercent: Double,
    @SerialName("completed_at") val completedAt: String
)

data class MistakeDetail(
    val question: QuestionItem,
    val selectedOption: String?
)

data class CompletedQuizSummary(
    val subject: SubjectItem,
    val quiz: QuizItem,
    val requestedCount: Int,
    val totalQuestions: Int,
    val correctCount: Int,
    val wrongCount: Int,
    val earnedPoints: Int,
    val newTotalPoints: Int,
    val levelName: String,
    val mistakes: List<MistakeDetail>
)

fun computeLevelProgress(points: Int): Triple<String, Int, Int> {
    return when {
        points >= 2500 -> Triple("Ustoz", points, 5000)
        points >= 1500 -> Triple("Alloma", points, 2500)
        points >= 800 -> Triple("Zukko", points, 1500)
        points >= 300 -> Triple("Bilimdon", points, 800)
        else -> Triple("Boshlovchi", points, 300)
    }
}
