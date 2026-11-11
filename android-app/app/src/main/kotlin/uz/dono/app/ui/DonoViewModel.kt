package uz.dono.app.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uz.dono.app.data.AnswerSubmission
import uz.dono.app.data.AppPreferences
import uz.dono.app.data.AttemptHistoryItem
import uz.dono.app.data.CompletedQuizSummary
import uz.dono.app.data.DonoRepository
import uz.dono.app.data.LeaderboardEntry
import uz.dono.app.data.MistakeDetail
import uz.dono.app.data.QuestionItem
import uz.dono.app.data.QuizItem
import uz.dono.app.data.StudentProfile
import uz.dono.app.data.SubjectItem

data class ActiveQuizState(
    val subject: SubjectItem,
    val quiz: QuizItem,
    val requestedCount: Int,
    val questions: List<QuestionItem>,
    val currentIndex: Int = 0,
    val selectedOption: String? = null,
    val isChecked: Boolean = false,
    val remainingSec: Int = quiz.timePerQuestionSec,
    val answers: List<AnswerSubmission> = emptyList(),
    val mistakes: List<MistakeDetail> = emptyList(),
    val startedAtMs: Long = System.currentTimeMillis(),
    val isSubmitting: Boolean = false
) {
    val currentQuestion: QuestionItem get() = questions[currentIndex]
    val isLastQuestion: Boolean get() = currentIndex == questions.lastIndex
}

data class DonoUiState(
    val isInitializing: Boolean = true,
    val student: StudentProfile? = null,
    val isLiveMode: Boolean = true,
    val serverUrl: String = "",
    val subjects: List<SubjectItem> = emptyList(),
    val isLoadingSubjects: Boolean = false,
    val selectedSubject: SubjectItem? = null,
    val subjectQuizzes: List<QuizItem> = emptyList(),
    val isLoadingQuizzes: Boolean = false,
    val activeQuiz: ActiveQuizState? = null,
    val lastResult: CompletedQuizSummary? = null,
    val leaderboardScope: String = "all",
    val leaderboard: List<LeaderboardEntry> = emptyList(),
    val isLoadingLeaderboard: Boolean = false,
    val history: List<AttemptHistoryItem> = emptyList(),
    val isLoadingHistory: Boolean = false,
    val isBusy: Boolean = false,
    val errorMessage: String? = null
)

class DonoViewModel(application: Application) : AndroidViewModel(application) {
    private val prefs = AppPreferences(application)
    private val repo = DonoRepository(prefs)

    private val _uiState = MutableStateFlow(
        DonoUiState(
            isLiveMode = repo.isLiveMode,
            serverUrl = prefs.getServerUrl()
        )
    )
    val uiState: StateFlow<DonoUiState> = _uiState.asStateFlow()

    private var timerJob: Job? = null

    init {
        viewModelScope.launch {
            val student = repo.refreshSession()
            _uiState.update {
                it.copy(
                    isInitializing = false,
                    student = student,
                    isLiveMode = repo.isLiveMode
                )
            }
            if (student != null) {
                loadDashboardData()
            }
        }
    }

    fun clearError() {
        _uiState.update { it.copy(errorMessage = null) }
    }

    fun saveServerUrl(url: String, onDone: () -> Unit = {}) {
        prefs.saveServerUrl(url)
        _uiState.update {
            it.copy(
                isLiveMode = repo.isLiveMode,
                serverUrl = prefs.getServerUrl(),
                errorMessage = null
            )
        }
        if (_uiState.value.student != null) {
            viewModelScope.launch {
                val refreshed = repo.refreshSession()
                _uiState.update { it.copy(student = refreshed) }
                loadDashboardData()
            }
        }
        onDone()
    }

    fun login(fullName: String, phone: String, onSuccess: () -> Unit) {
        viewModelScope.launch {
            _uiState.update { it.copy(isBusy = true, errorMessage = null) }
            try {
                val profile = repo.loginWithPhone(fullName, phone)
                _uiState.update { it.copy(student = profile, isBusy = false) }
                loadDashboardData()
                onSuccess()
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(isBusy = false, errorMessage = e.message ?: "Kirishda xatolik yuz berdi")
                }
            }
        }
    }

    fun logout(onDone: () -> Unit) {
        timerJob?.cancel()
        prefs.clearStudentSession()
        _uiState.update {
            it.copy(
                student = null,
                subjects = emptyList(),
                subjectQuizzes = emptyList(),
                activeQuiz = null,
                lastResult = null,
                leaderboard = emptyList(),
                history = emptyList()
            )
        }
        onDone()
    }

    fun loadDashboardData() {
        loadSubjects()
        loadLeaderboard(_uiState.value.leaderboardScope)
        loadHistory()
    }

    fun loadSubjects() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingSubjects = true, errorMessage = null) }
            try {
                val subjects = repo.getSubjects()
                _uiState.update { it.copy(subjects = subjects, isLoadingSubjects = false) }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(isLoadingSubjects = false, errorMessage = e.message ?: "Fanlarni yuklashda xatolik")
                }
            }
        }
    }

    fun selectSubjectAndLoadQuizzes(subject: SubjectItem, onReady: () -> Unit) {
        _uiState.update { it.copy(selectedSubject = subject, subjectQuizzes = emptyList(), isLoadingQuizzes = true) }
        onReady()
        viewModelScope.launch {
            try {
                val quizzes = repo.getQuizzes(subject.id)
                _uiState.update { it.copy(subjectQuizzes = quizzes, isLoadingQuizzes = false) }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(isLoadingQuizzes = false, errorMessage = e.message ?: "Testlarni yuklashda xatolik")
                }
            }
        }
    }

    fun startQuiz(subject: SubjectItem, quiz: QuizItem, questionCount: Int, onStarted: () -> Unit) {
        viewModelScope.launch {
            _uiState.update { it.copy(isBusy = true, errorMessage = null) }
            try {
                val questions = repo.getRandomQuestions(quiz.id, questionCount)
                if (questions.isEmpty()) {
                    _uiState.update {
                        it.copy(isBusy = false, errorMessage = "Bu test to‘plamida hali savollar yo‘q.")
                    }
                    return@launch
                }
                val session = ActiveQuizState(
                    subject = subject,
                    quiz = quiz,
                    requestedCount = questionCount,
                    questions = questions
                )
                _uiState.update { it.copy(activeQuiz = session, isBusy = false) }
                startQuestionTimer()
                onStarted()
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(isBusy = false, errorMessage = e.message ?: "Testni boshlashda xatolik")
                }
            }
        }
    }

    private fun startQuestionTimer() {
        timerJob?.cancel()
        val active = _uiState.value.activeQuiz ?: return
        val limit = active.quiz.timePerQuestionSec
        if (limit <= 0) return

        timerJob = viewModelScope.launch {
            var remaining = limit
            while (remaining > 0) {
                delay(1000)
                val current = _uiState.value.activeQuiz ?: return@launch
                if (current.isChecked) return@launch
                remaining--
                _uiState.update { state ->
                    state.activeQuiz?.let { aq -> state.copy(activeQuiz = aq.copy(remainingSec = remaining)) } ?: state
                }
            }
            // Time expired: auto-check current question as unanswered/selected
            checkCurrentAnswer()
        }
    }

    fun selectOption(option: String) {
        _uiState.update { state ->
            val aq = state.activeQuiz ?: return@update state
            if (aq.isChecked) return@update state
            state.copy(activeQuiz = aq.copy(selectedOption = option))
        }
    }

    fun checkCurrentAnswer() {
        timerJob?.cancel()
        _uiState.update { state ->
            val aq = state.activeQuiz ?: return@update state
            if (aq.isChecked) return@update state
            val q = aq.currentQuestion
            val sel = aq.selectedOption
            val isCorrect = sel != null && sel.equals(q.correctOption, ignoreCase = true)
            val newAnswers = aq.answers + AnswerSubmission(
                questionId = q.id,
                selectedOption = sel,
                shuffledToken = q.shuffledToken?.takeIf { it.isNotBlank() }
            )
            val newMistakes = if (isCorrect) aq.mistakes else aq.mistakes + MistakeDetail(q, sel)

            state.copy(
                activeQuiz = aq.copy(
                    isChecked = true,
                    answers = newAnswers,
                    mistakes = newMistakes
                )
            )
        }
    }

    fun nextQuestionOrFinish(onFinished: () -> Unit) {
        val aq = _uiState.value.activeQuiz ?: return
        if (!aq.isLastQuestion) {
            _uiState.update { state ->
                val cur = state.activeQuiz ?: return@update state
                state.copy(
                    activeQuiz = cur.copy(
                        currentIndex = cur.currentIndex + 1,
                        selectedOption = null,
                        isChecked = false,
                        remainingSec = cur.quiz.timePerQuestionSec
                    )
                )
            }
            startQuestionTimer()
            return
        }

        // Submit finished test
        val student = _uiState.value.student ?: return
        val durationSec = ((System.currentTimeMillis() - aq.startedAtMs) / 1000L).toInt().coerceAtLeast(1)
        viewModelScope.launch {
            _uiState.update { state ->
                state.activeQuiz?.let { cur -> state.copy(activeQuiz = cur.copy(isSubmitting = true)) } ?: state
            }
            try {
                val res = repo.submitAttempt(
                    student = student,
                    subject = aq.subject,
                    quiz = aq.quiz,
                    requestedCount = aq.requestedCount,
                    durationSec = durationSec,
                    questions = aq.questions,
                    answers = aq.answers
                )
                val updatedStudent = prefs.getSavedStudent() ?: student
                val summary = CompletedQuizSummary(
                    subject = aq.subject,
                    quiz = aq.quiz,
                    requestedCount = aq.requestedCount,
                    totalQuestions = res.totalQuestions,
                    correctCount = res.correctCount,
                    wrongCount = res.wrongCount,
                    earnedPoints = res.earnedPoints,
                    newTotalPoints = res.newTotalPoints,
                    levelName = res.levelName,
                    mistakes = aq.mistakes
                )
                _uiState.update {
                    it.copy(
                        student = updatedStudent,
                        activeQuiz = null,
                        lastResult = summary
                    )
                }
                loadDashboardData()
                onFinished()
            } catch (e: Exception) {
                _uiState.update { state ->
                    state.copy(
                        errorMessage = e.message ?: "Natijani saqlashda xatolik",
                        activeQuiz = state.activeQuiz?.copy(isSubmitting = false)
                    )
                }
            }
        }
    }

    fun abortActiveQuiz() {
        timerJob?.cancel()
        _uiState.update { it.copy(activeQuiz = null) }
    }

    fun loadLeaderboard(scope: String) {
        val student = _uiState.value.student ?: return
        _uiState.update { it.copy(leaderboardScope = scope, isLoadingLeaderboard = true) }
        viewModelScope.launch {
            try {
                val list = repo.getLeaderboard(student, scope)
                _uiState.update { it.copy(leaderboard = list, isLoadingLeaderboard = false) }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(isLoadingLeaderboard = false, errorMessage = e.message ?: "Reytingni yuklashda xatolik")
                }
            }
        }
    }

    fun addFriendByCode(code: String, onSuccess: () -> Unit) {
        val student = _uiState.value.student ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(isBusy = true, errorMessage = null) }
            try {
                repo.addFriend(student.id, code)
                _uiState.update { it.copy(isBusy = false) }
                loadLeaderboard("friends")
                onSuccess()
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(isBusy = false, errorMessage = e.message ?: "Do‘st qo‘shishda xatolik")
                }
            }
        }
    }

    fun loadHistory() {
        val student = _uiState.value.student ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingHistory = true) }
            try {
                val items = repo.getHistory(student.id)
                _uiState.update { it.copy(history = items, isLoadingHistory = false) }
            } catch (_: Exception) {
                _uiState.update { it.copy(isLoadingHistory = false) }
            }
        }
    }
}

