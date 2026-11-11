package uz.dono.app

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import uz.dono.app.data.AnswerSubmission
import uz.dono.app.data.QuestionItem
import uz.dono.app.data.StudentProfile
import uz.dono.app.data.computeLevelProgress
import uz.dono.app.data.formatUzPhoneForDisplay
import uz.dono.app.data.normalizeUzPhone

class DonoModelsTest {
    @Test
    fun computeLevelProgress_returnsExpectedLevels() {
        assertEquals(Triple("Boshlovchi", 120, 300), computeLevelProgress(120))
        assertEquals(Triple("Bilimdon", 310, 800), computeLevelProgress(310))
        assertEquals(Triple("Zukko", 800, 1500), computeLevelProgress(800))
        assertEquals(Triple("Alloma", 1500, 2500), computeLevelProgress(1500))
        assertEquals(Triple("Ustoz", 2600, 5000), computeLevelProgress(2600))
    }

    @Test
    fun normalizeUzPhone_handlesStandardAndLocalFormats() {
        assertEquals("+998901234567", normalizeUzPhone("+998 90 123 45 67"))
        assertEquals("+998901234567", normalizeUzPhone("998901234567"))
        assertEquals("+998901234567", normalizeUzPhone("90 123-45-67"))
        assertNull(normalizeUzPhone("12345"))
        assertNull(normalizeUzPhone("+99890123"))
    }

    @Test
    fun formatUzPhoneForDisplay_formatsCleanly() {
        assertEquals("+998 90 123 45 67", formatUzPhoneForDisplay("+998901234567"))
    }

    @Test
    fun studentProfile_displayAndGreetingNames() {
        val st = StudentProfile(
            id = "1",
            phone = "+998901234567",
            fullName = "Abduvaliyev Salohiddin",
            firstName = "Abduvaliyev",
            lastName = "Salohiddin"
        )
        assertEquals("Abduvaliyev Salohiddin", st.displayName)
        assertEquals("Abduvaliyev", st.shortGreetingName)
    }

    @Test
    fun questionItem_textForOption_mapsCorrectly() {
        val q = QuestionItem(
            id = "q1",
            quizId = null,
            bankId = "bank-1",
            questionText = "7 x 8",
            expressionText = "7 × 8",
            optionA = "54",
            optionB = "56",
            optionC = "64",
            optionD = "58",
            correctOption = "B",
            shuffledToken = "payload.sig",
            explanation = "56"
        )
        assertEquals("54", q.textForOption("A"))
        assertEquals("56", q.textForOption("b"))
        assertEquals("64", q.textForOption("C"))
        assertEquals("58", q.textForOption("D"))
        assertEquals("payload.sig", q.shuffledToken)
    }

    @Test
    fun questionAndAnswerSerialization_supportsNullQuizIdAndShuffledToken() {
        val json = Json { ignoreUnknownKeys = true; isLenient = true; coerceInputValues = true }
        val raw = """
            {
              "id": "q-10",
              "bank_id": "b-1",
              "quiz_id": null,
              "question_text": "2+2?",
              "option_a": "3",
              "option_b": "4",
              "option_c": "5",
              "option_d": "6",
              "correct_option": "B",
              "shuffled_token": "tok123.sig456"
            }
        """.trimIndent()
        val parsed = json.decodeFromString<QuestionItem>(raw)
        assertNull(parsed.quizId)
        assertEquals("b-1", parsed.bankId)
        assertEquals("tok123.sig456", parsed.shuffledToken)

        val ans = AnswerSubmission(parsed.id, "B", parsed.shuffledToken)
        assertEquals("tok123.sig456", ans.shuffledToken)
    }
}
