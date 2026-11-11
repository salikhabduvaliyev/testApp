package uz.dono.app

import androidx.navigation3.runtime.NavKey
import kotlinx.serialization.Serializable

@Serializable data object LoginRoute : NavKey
@Serializable data object MainTabsRoute : NavKey
@Serializable data object QuizSelectionRoute : NavKey
@Serializable data object QuizPlayRoute : NavKey
@Serializable data object ResultRoute : NavKey
@Serializable data object MistakesReviewRoute : NavKey
