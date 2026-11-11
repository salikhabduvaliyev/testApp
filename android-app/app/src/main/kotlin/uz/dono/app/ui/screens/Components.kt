package uz.dono.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.MenuBook
import androidx.compose.material.icons.rounded.Calculate
import androidx.compose.material.icons.rounded.Code
import androidx.compose.material.icons.rounded.HistoryEdu
import androidx.compose.material.icons.rounded.Language
import androidx.compose.material.icons.rounded.Public
import androidx.compose.material.icons.rounded.Science
import androidx.compose.material.icons.rounded.Translate
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import uz.dono.app.BuildConfig

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

@Composable
fun ServerConfigDialog(
    initialUrl: String,
    onDismiss: () -> Unit,
    onSave: (String) -> Unit
) {
    var url by remember { mutableStateOf(initialUrl) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Server manzili") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    "DONO serveri port 8000 da o‘z SQLite bazasi bilan ishlaydi (API kalitsiz).",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                OutlinedTextField(
                    value = url,
                    onValueChange = { url = it },
                    label = { Text("Server URL") },
                    placeholder = { Text(BuildConfig.LAN_SERVER_URL) },
                    singleLine = true,
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedButton(
                    onClick = { url = BuildConfig.LAN_SERVER_URL },
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Wi-Fi telefon: ${BuildConfig.LAN_SERVER_URL}")
                }
                OutlinedButton(
                    onClick = { url = BuildConfig.EMULATOR_SERVER_URL },
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Emulator: ${BuildConfig.EMULATOR_SERVER_URL}")
                }
            }
        },
        confirmButton = {
            Button(onClick = { onSave(url) }) {
                Text("Saqlash")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Bekor qilish")
            }
        }
    )
}
