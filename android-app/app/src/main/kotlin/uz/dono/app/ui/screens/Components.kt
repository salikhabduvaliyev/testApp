package uz.dono.app.ui.screens

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.MenuBook
import androidx.compose.material.icons.rounded.Calculate
import androidx.compose.material.icons.rounded.Code
import androidx.compose.material.icons.rounded.HistoryEdu
import androidx.compose.material.icons.rounded.Language
import androidx.compose.material.icons.rounded.Public
import androidx.compose.material.icons.rounded.Science
import androidx.compose.material.icons.rounded.Translate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector

fun parseHexColor(hex: String, fallback: Color = Color(0xFF2563EB)): Color {
    return try {
        val clean = hex.trim().removePrefix("#")
        val parsed = clean.toLong(16)
        if (clean.length == 6) Color(0xFF000000L or parsed) else Color(parsed)
    } catch (_: Exception) {
        fallback
    }
}

fun subjectIcon(key: String): ImageVector = when (key.lowercase()) {
    "calculate" -> Icons.Rounded.Calculate
    "language" -> Icons.Rounded.Language
    "translate" -> Icons.Rounded.Translate
    "science" -> Icons.Rounded.Science
    "history_edu" -> Icons.Rounded.HistoryEdu
    "code" -> Icons.Rounded.Code
    "public" -> Icons.Rounded.Public
    else -> Icons.AutoMirrored.Rounded.MenuBook
}
