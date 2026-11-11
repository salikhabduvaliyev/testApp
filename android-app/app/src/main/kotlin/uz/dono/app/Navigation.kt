package uz.dono.app

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation3.runtime.entryProvider
import androidx.navigation3.runtime.rememberNavBackStack
import androidx.navigation3.ui.NavDisplay
import uz.dono.app.ui.DonoViewModel
import uz.dono.app.ui.screens.LoginScreen
import uz.dono.app.ui.screens.MainTabsScreen
import uz.dono.app.ui.screens.MistakesReviewScreen
import uz.dono.app.ui.screens.QuizPlayScreen
import uz.dono.app.ui.screens.QuizSelectionScreen
import uz.dono.app.ui.screens.ResultScreen

@Composable
fun MainNavigation(viewModel: DonoViewModel = viewModel()) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    if (state.isInitializing) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        return
    }

    val startRoute = if (state.student != null) MainTabsRoute else LoginRoute
    val backStack = rememberNavBackStack(startRoute)

    LaunchedEffect(state.student) {
        if (state.student == null && backStack.lastOrNull() != LoginRoute) {
            backStack.clear()
            backStack.add(LoginRoute)
        }
    }

    NavDisplay(
        backStack = backStack,
        onBack = {
            if (backStack.size > 1) {
                backStack.removeLastOrNull()
            }
        },
        entryProvider = entryProvider {
            entry<LoginRoute> {
                LoginScreen(
                    state = state,
                    onLogin = { fullName, phone ->
                        viewModel.login(fullName, phone) {
                            backStack.clear()
                            backStack.add(MainTabsRoute)
                        }
                    },
                    onDismissError = { viewModel.clearError() }
                )
            }

            entry<MainTabsRoute> {
                MainTabsScreen(
                    state = state,
                    onRefresh = { viewModel.loadDashboardData() },
                    onSubjectClick = { subject ->
                        viewModel.selectSubjectAndLoadQuizzes(subject) {
                            backStack.add(QuizSelectionRoute)
                        }
                    },
                    onLeaderboardScopeChange = { scope -> viewModel.loadLeaderboard(scope) },
                    onAddFriend = { code, done -> viewModel.addFriendByCode(code, done) },
                    onLogout = {
                        viewModel.logout {
                            backStack.clear()
                            backStack.add(LoginRoute)
                        }
                    }
                )
            }

            entry<QuizSelectionRoute> {
                QuizSelectionScreen(
                    state = state,
                    onBack = { backStack.removeLastOrNull() },
                    onStartQuiz = { subject, quiz, count ->
                        viewModel.startQuiz(subject, quiz, count) {
                            backStack.add(QuizPlayRoute)
                        }
                    }
                )
            }

            entry<QuizPlayRoute> {
                QuizPlayScreen(
                    quizState = state.activeQuiz,
                    onSelectOption = { opt -> viewModel.selectOption(opt) },
                    onCheckAnswer = { viewModel.checkCurrentAnswer() },
                    onNextOrFinish = {
                        viewModel.nextQuestionOrFinish {
                            backStack.removeLastOrNull()
                            backStack.add(ResultRoute)
                        }
                    },
                    onAbort = {
                        viewModel.abortActiveQuiz()
                        backStack.removeLastOrNull()
                    }
                )
            }

            entry<ResultRoute> {
                ResultScreen(
                    result = state.lastResult,
                    onReviewMistakes = { backStack.add(MistakesReviewRoute) },
                    onRetryAnother = {
                        backStack.removeLastOrNull()
                    },
                    onBackHome = {
                        backStack.clear()
                        backStack.add(MainTabsRoute)
                    }
                )
            }

            entry<MistakesReviewRoute> {
                MistakesReviewScreen(
                    result = state.lastResult,
                    onBack = { backStack.removeLastOrNull() }
                )
            }
        }
    )
}
