package uz.dono.app.data

import android.content.Context
import uz.dono.app.BuildConfig
import java.util.UUID

class AppPreferences(context: Context) {
    private val prefs = context.getSharedPreferences("dono_prefs", Context.MODE_PRIVATE)

    init {
        if (prefs.contains("server_url")) {
            prefs.edit().remove("server_url").apply()
        }
    }

    fun getOrCreateDeviceId(): String {
        val existing = prefs.getString("device_id", null)
        if (!existing.isNullOrBlank()) return existing
        val generated = UUID.randomUUID().toString()
        prefs.edit().putString("device_id", generated).apply()
        return generated
    }

    fun getServerUrl(): String {
        return BuildConfig.SERVER_URL.trim().trimEnd('/')
    }

    fun isServerConfigured(): Boolean {
        val url = getServerUrl()
        return url.startsWith("http://") || url.startsWith("https://")
    }

    fun saveStudentSession(student: StudentProfile) {
        prefs.edit()
            .putString("student_id", student.id)
            .putString("phone", student.phone)
            .putString("full_name", student.displayName)
            .putString("first_name", student.firstName)
            .putString("last_name", student.lastName)
            .putString("region", student.region)
            .putString("recovery_code", student.recoveryCode)
            .putInt("total_points", student.totalPoints)
            .putInt("streak_days", student.streakDays)
            .putInt("daily_questions_count", student.dailyQuestionsCount)
            .putInt("daily_goal_target", student.dailyGoalTarget)
            .putString("level_name", student.levelName)
            .apply()
    }

    fun getSavedStudent(): StudentProfile? {
        val id = prefs.getString("student_id", null) ?: return null
        val phone = prefs.getString("phone", null)?.trim().orEmpty()
        if (phone.isEmpty()) return null
        val fullName = prefs.getString("full_name", null)?.trim().orEmpty()
        val fn = prefs.getString("first_name", null) ?: ""
        val ln = prefs.getString("last_name", null) ?: ""
        if (fullName.isEmpty() && fn.isEmpty()) return null

        return StudentProfile(
            id = id,
            phone = phone,
            fullName = fullName.ifEmpty { "$fn $ln".trim() },
            deviceId = getOrCreateDeviceId(),
            recoveryCode = prefs.getString("recovery_code", "") ?: "",
            firstName = fn,
            lastName = ln,
            region = prefs.getString("region", "O‘zbekiston") ?: "O‘zbekiston",
            totalPoints = prefs.getInt("total_points", 0),
            streakDays = prefs.getInt("streak_days", 1),
            dailyQuestionsCount = prefs.getInt("daily_questions_count", 0),
            dailyGoalTarget = prefs.getInt("daily_goal_target", 10),
            levelName = prefs.getString("level_name", "Boshlovchi") ?: "Boshlovchi"
        )
    }

    fun clearStudentSession() {
        prefs.edit()
            .remove("student_id")
            .remove("phone")
            .remove("full_name")
            .remove("first_name")
            .remove("last_name")
            .remove("region")
            .remove("recovery_code")
            .remove("total_points")
            .remove("streak_days")
            .remove("daily_questions_count")
            .remove("level_name")
            .apply()
    }
}
