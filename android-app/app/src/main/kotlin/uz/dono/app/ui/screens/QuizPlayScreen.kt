package uz.dono.app.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AccessTime
import androidx.compose.material.icons.rounded.Cancel
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import uz.dono.app.ui.ActiveQuizState
import uz.dono.app.ui.theme.ErrorRed
import uz.dono.app.ui.theme.ErrorRedContainer
import uz.dono.app.ui.theme.SuccessGreen
import uz.dono.app.ui.theme.SuccessGreenContainer

@Composable
fun QuizPlayScreen(
    quizState: ActiveQuizState?,
    onSelectOption: (String) -> Unit,
    onCheckAnswer: () -> Unit,
    onNextOrFinish: () -> Unit,
    onAbort: () -> Unit
) {
    if (quizState == null) return

    var showExitDialog by remember { mutableStateOf(false) }

    BackHandler {
        showExitDialog = true
    }

    val question = quizState.currentQuestion
    val progress = (quizState.currentIndex + 1).toFloat() / quizState.questions.size.toFloat()
    val hasTimer = quizState.quiz.timePerQuestionSec > 0
    val isLowTime = hasTimer && quizState.remainingSec <= 5

    val options = listOf(
        "A" to question.optionA,
        "B" to question.optionB,
        "C" to question.optionC,
        "D" to question.optionD
    )

    Scaffold { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            // Top bar
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                TextButton(onClick = { showExitDialog = true }) {
                    Icon(Icons.Rounded.Close, contentDescription = null, modifier = Modifier.size(18.dp))
                    Text(" Yopish", fontWeight = FontWeight.SemiBold)
                }

                Text(
                    text = "${quizState.currentIndex + 1} / ${quizState.questions.size}",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )

                if (hasTimer) {
                    Surface(
                        color = if (isLowTime) ErrorRedContainer else MaterialTheme.colorScheme.surfaceVariant,
                        shape = RoundedCornerShape(99.dp)
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Icon(
                                Icons.Rounded.AccessTime,
                                contentDescription = null,
                                tint = if (isLowTime) ErrorRed else MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(16.dp)
                            )
                            Text(
                                text = "0:${quizState.remainingSec.toString().padStart(2, '0')}",
                                fontWeight = FontWeight.Bold,
                                color = if (isLowTime) ErrorRed else MaterialTheme.colorScheme.onSurface
                            )
                        }
                    }
                } else {
                    Spacer(modifier = Modifier.size(56.dp))
                }
            }

            LinearProgressIndicator(
                progress = { progress },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(6.dp)
                    .clip(RoundedCornerShape(99.dp))
            )

            Column(
                modifier = Modifier
                    .weight(1f)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                Text(
                    text = "${quizState.subject.name.uppercase()} · ${quizState.quiz.title}",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.Bold
                )

                Text(
                    text = question.questionText,
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.SemiBold
                )

                if (!question.expressionText.isNullOrBlank()) {
                    ElevatedCard(
                        shape = RoundedCornerShape(20.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(
                            text = question.expressionText,
                            fontSize = 32.sp,
                            fontWeight = FontWeight.Bold,
                            textAlign = TextAlign.Center,
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 24.dp, horizontal = 16.dp)
                        )
                    }
                }

                // Answer options
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    options.forEach { (key, label) ->
                        val isSelected = quizState.selectedOption == key
                        val isCorrectOption = question.correctOption.equals(key, ignoreCase = true)

                        val borderColor: Color
                        val bgColor: Color
                        val badgeBg: Color
                        val badgeFg: Color

                        when {
                            quizState.isChecked && isCorrectOption -> {
                                borderColor = SuccessGreen
                                bgColor = SuccessGreenContainer.copy(alpha = 0.65f)
                                badgeBg = SuccessGreen
                                badgeFg = Color.White
                            }
                            quizState.isChecked && isSelected && !isCorrectOption -> {
                                borderColor = ErrorRed
                                bgColor = ErrorRedContainer.copy(alpha = 0.65f)
                                badgeBg = ErrorRed
                                badgeFg = Color.White
                            }
                            isSelected -> {
                                borderColor = MaterialTheme.colorScheme.primary
                                bgColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.45f)
                                badgeBg = MaterialTheme.colorScheme.primary
                                badgeFg = Color.White
                            }
                            else -> {
                                borderColor = MaterialTheme.colorScheme.outline
                                bgColor = MaterialTheme.colorScheme.surface
                                badgeBg = MaterialTheme.colorScheme.surfaceVariant
                                badgeFg = MaterialTheme.colorScheme.onSurfaceVariant
                            }
                        }

                        OutlinedCard(
                            onClick = { if (!quizState.isChecked) onSelectOption(key) },
                            shape = RoundedCornerShape(16.dp),
                            border = BorderStroke(if (isSelected || (quizState.isChecked && isCorrectOption)) 2.dp else 1.dp, borderColor),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .background(bgColor)
                                    .padding(horizontal = 16.dp, vertical = 14.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(30.dp)
                                        .clip(CircleShape)
                                        .background(badgeBg),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        text = key,
                                        color = badgeFg,
                                        fontWeight = FontWeight.Bold,
                                        style = MaterialTheme.typography.labelLarge
                                    )
                                }
                                Text(
                                    text = label,
                                    style = MaterialTheme.typography.bodyLarge,
                                    fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
                                    modifier = Modifier.weight(1f)
                                )
                                if (quizState.isChecked && isCorrectOption) {
                                    Icon(Icons.Rounded.CheckCircle, contentDescription = null, tint = SuccessGreen)
                                } else if (quizState.isChecked && isSelected && !isCorrectOption) {
                                    Icon(Icons.Rounded.Cancel, contentDescription = null, tint = ErrorRed)
                                }
                            }
                        }
                    }
                }

                // Instant feedback & explanation after "Tekshirish"
                if (quizState.isChecked) {
                    val userCorrect = quizState.selectedOption?.equals(question.correctOption, ignoreCase = true) == true
                    Surface(
                        color = if (userCorrect) SuccessGreenContainer else ErrorRedContainer,
                        shape = RoundedCornerShape(16.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(
                                text = when {
                                    userCorrect -> "To‘g‘ri javob! (+${quizState.quiz.pointsPerCorrect} ochko)"
                                    quizState.selectedOption == null -> "Vaqt tugadi! To‘g‘ri javob: ${question.correctOption}"
                                    else -> "Noto‘g‘ri! To‘g‘ri javob: ${question.correctOption}"
                                },
                                fontWeight = FontWeight.Bold,
                                color = if (userCorrect) SuccessGreen else ErrorRed
                            )
                            if (question.explanation.isNotBlank()) {
                                Text(
                                    text = question.explanation,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                            }
                        }
                    }
                }
            }

            // Bottom primary CTA
            if (!quizState.isChecked) {
                Button(
                    onClick = onCheckAnswer,
                    enabled = quizState.selectedOption != null,
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(54.dp)
                ) {
                    Text("Tekshirish", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                }
            } else {
                Button(
                    onClick = onNextOrFinish,
                    enabled = !quizState.isSubmitting,
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary),
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(54.dp)
                ) {
                    if (quizState.isSubmitting) {
                        CircularProgressIndicator(
                            color = MaterialTheme.colorScheme.onPrimary,
                            modifier = Modifier.size(22.dp)
                        )
                    } else {
                        Text(
                            text = if (quizState.isLastQuestion) "Natijani ko‘rish" else "Keyingi savol",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }
            }
        }
    }

    if (showExitDialog) {
        AlertDialog(
            onDismissRequest = { showExitDialog = false },
            title = { Text("Testni yakunlaysizmi?") },
            text = { Text("Hozir chiqsangiz ushbu test natijalari saqlanmaydi.") },
            confirmButton = {
                Button(onClick = {
                    showExitDialog = false
                    onAbort()
                }) {
                    Text("Chiqish")
                }
            },
            dismissButton = {
                TextButton(onClick = { showExitDialog = false }) {
                    Text("Davom etish")
                }
            }
        )
    }
}

