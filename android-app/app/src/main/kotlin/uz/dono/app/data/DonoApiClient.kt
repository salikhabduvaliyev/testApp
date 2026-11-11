package uz.dono.app.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

class DonoApiException(message: String) : Exception(message)

class DonoApiClient(private val prefs: AppPreferences) {
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        coerceInputValues = true
    }

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

    private suspend inline fun <reified T> executeRequest(
        path: String,
        body: JsonObject? = null
    ): T = withContext(Dispatchers.IO) {
        val baseUrl = prefs.getServerUrl().trimEnd('/')
        if (baseUrl.isBlank()) {
            throw DonoApiException("Server manzili sozlanmagan.")
        }

        val builder = Request.Builder().url("$baseUrl$path")
        if (body != null) {
            builder.post(body.toString().toRequestBody(jsonMediaType))
                .addHeader("Content-Type", "application/json")
        } else {
            builder.get()
        }

        try {
            client.newCall(builder.build()).execute().use { response ->
                val raw = response.body?.string().orEmpty()
                if (!response.isSuccessful) {
                    val msg = try {
                        val obj = json.parseToJsonElement(raw) as? JsonObject
                        (obj?.get("message") as? JsonPrimitive)?.content ?: raw
                    } catch (_: Exception) {
                        raw.ifBlank { "HTTP ${response.code}" }
                    }
                    throw DonoApiException(msg)
                }
                json.decodeFromString<T>(raw)
            }
        } catch (e: DonoApiException) {
            throw e
        } catch (_: IOException) {
            throw DonoApiException(
                "Serverga ulanib bo‘lmadi. Internet aloqangizni tekshirib, qayta urinib ko‘ring."
            )
        }
    }

    suspend fun loginStudent(
        deviceId: String,
        fullName: String,
        phone: String
    ): StudentProfile {
        return executeRequest(
            path = "/api/student/login",
            body = buildJsonObject {
                put("device_id", deviceId)
                put("full_name", fullName)
                put("phone", phone)
            }
        )
    }

    suspend fun addFriendByIdentifier(studentId: String, identifier: String) {
        executeRequest<JsonObject>(
            path = "/api/student/friends",
            body = buildJsonObject {
                put("student_id", studentId)
                put("friend_code", identifier)
            }
        )
    }

    suspend fun getSubjects(): List<SubjectItem> {
        return executeRequest("/api/subjects")
    }

    suspend fun getQuizzesForSubject(subjectId: String): List<QuizItem> {
        val encId = URLEncoder.encode(subjectId, "UTF-8")
        return executeRequest("/api/subjects/$encId/quizzes")
    }

    suspend fun getRandomQuestions(quizId: String, limit: Int): List<QuestionItem> {
        val encId = URLEncoder.encode(quizId, "UTF-8")
        return executeRequest("/api/quizzes/$encId/questions?limit=$limit")
    }

    suspend fun submitTestAttempt(
        studentId: String,
        quizId: String,
        requestedCount: Int,
        durationSec: Int,
        answers: List<AnswerSubmission>
    ): SubmitAttemptResponse {
        val answersEl = json.encodeToJsonElement(answers) as JsonArray
        return executeRequest(
            path = "/api/attempts",
            body = buildJsonObject {
                put("student_id", studentId)
                put("quiz_id", quizId)
                put("requested_count", requestedCount)
                put("duration_sec", durationSec)
                put("answers", answersEl)
            }
        )
    }

    suspend fun getLeaderboard(studentId: String, scope: String): List<LeaderboardEntry> {
        val encStudent = URLEncoder.encode(studentId, "UTF-8")
        val encScope = URLEncoder.encode(scope, "UTF-8")
        return executeRequest("/api/leaderboard?student_id=$encStudent&scope=$encScope")
    }

    suspend fun getStudentHistory(studentId: String): List<AttemptHistoryItem> {
        val encId = URLEncoder.encode(studentId, "UTF-8")
        return executeRequest("/api/students/$encId/history")
    }
}
