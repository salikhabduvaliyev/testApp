package uz.dono.app.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.AccessTime
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Quiz
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import uz.dono.app.data.QuizItem
import uz.dono.app.data.SubjectItem
import uz.dono.app.ui.DonoUiState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QuizSelectionScreen(
    state: DonoUiState,
    onBack: () -> Unit,
    onStartQuiz: (SubjectItem, QuizItem, Int) -> Unit
) {
    val subject = state.selectedSubject
    var pickedQuiz by remember { mutableStateOf<QuizItem?>(null) }
    var selectedCount by remember { mutableIntStateOf(10) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(subject?.name ?: "Testlar", fontWeight = FontWeight.Bold)
                        Text(
                            "Test to‘plami va savollar sonini tanlang",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Orqaga")
                    }
                }
            )
        }
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            when {
                state.isLoadingQuizzes -> {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                }
                state.subjectQuizzes.isEmpty() -> {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(24.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "Bu fanda hozircha test to‘plamlari mavjud emas.",
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
                else -> {
                    LazyColumn(
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                        modifier = Modifier.fillMaxSize()
                    ) {
                        items(state.subjectQuizzes, key = { it.id }) { quiz ->
                            ElevatedCard(
                                onClick = {
                                    if (quiz.questionCount > 0) {
                                        selectedCount = if (quiz.questionCount >= 10) 10 else quiz.questionCount
                                        pickedQuiz = quiz
                                    }
                                },
                                shape = RoundedCornerShape(20.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Column(
                                    modifier = Modifier.padding(18.dp),
                                    verticalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    Text(
                                        text = quiz.title,
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.Bold
                                    )
                                    if (quiz.description.isNotBlank()) {
                                        Text(
                                            text = quiz.description,
                                            style = MaterialTheme.typography.bodyMedium,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }
                                    Row(
                                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        MetaBadge(
                                            icon = Icons.Rounded.Quiz,
                                            label = "${quiz.questionCount} ta savol"
                                        )
                                        MetaBadge(
                                            icon = Icons.Rounded.AccessTime,
                                            label = if (quiz.timePerQuestionSec > 0) "${quiz.timePerQuestionSec}s / savol" else "Taymersiz"
                                        )
                                        MetaBadge(
                                            icon = Icons.Rounded.Star,
                                            label = "+${quiz.pointsPerCorrect} ochko"
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    val activePicked = pickedQuiz
    if (activePicked != null && subject != null) {
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        val countOptions = buildList {
            if (activePicked.questionCount in 1..9) {
                add(activePicked.questionCount to true)
            }
            add(10 to (activePicked.questionCount >= 10))
            add(25 to (activePicked.questionCount >= 25))
            add(50 to (activePicked.questionCount >= 50))
        }

        ModalBottomSheet(
            onDismissRequest = { pickedQuiz = null },
            sheetState = sheetState
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 24.dp)
                    .padding(bottom = 32.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        text = activePicked.title,
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = "Savollar ketma-ketligi va javob variantlari avtomatik chalkashtiriladi (bazada ${activePicked.questionCount} ta savol):",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    countOptions.forEach { (count, enabled) ->
                        val isSelected = selectedCount == count && enabled
                        OutlinedCard(
                            onClick = { if (enabled) selectedCount = count },
                            enabled = enabled,
                            shape = RoundedCornerShape(16.dp),
                            border = BorderStroke(
                                width = if (isSelected) 2.dp else 1.dp,
                                color = when {
                                    isSelected -> MaterialTheme.colorScheme.primary
                                    enabled -> MaterialTheme.colorScheme.outline
                                    else -> MaterialTheme.colorScheme.outline.copy(alpha = 0.35f)
                                }
                            ),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 16.dp, vertical = 14.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column {
                                    Text(
                                        text = "$count ta test savoli",
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium
                                    )
                                    Text(
                                        text = if (enabled) {
                                            "Maksimal +${count * activePicked.pointsPerCorrect} ochko"
                                        } else {
                                            "Bazaga kamida $count ta savol kerak"
                                        },
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                                if (isSelected) {
                                    Surface(
                                        color = MaterialTheme.colorScheme.primary,
                                        shape = RoundedCornerShape(99.dp)
                                    ) {
                                        Text(
                                            text = "Tanlandi",
                                            color = MaterialTheme.colorScheme.onPrimary,
                                            style = MaterialTheme.typography.labelSmall,
                                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                Button(
                    onClick = {
                        val quiz = activePicked
                        pickedQuiz = null
                        onStartQuiz(subject, quiz, selectedCount)
                    },
                    enabled = activePicked.questionCount > 0 && !state.isBusy,
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(54.dp)
                ) {
                    if (state.isBusy) {
                        CircularProgressIndicator(
                            color = MaterialTheme.colorScheme.onPrimary,
                            modifier = Modifier.size(22.dp)
                        )
                    } else {
                        Icon(Icons.Rounded.PlayArrow, contentDescription = null)
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = "Testni boshlash ($selectedCount ta)",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun MetaBadge(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String
) {
    Surface(
        color = MaterialTheme.colorScheme.surfaceVariant,
        shape = RoundedCornerShape(8.dp)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Icon(icon, contentDescription = null, modifier = Modifier.size(14.dp), tint = MaterialTheme.colorScheme.primary)
            Text(label, style = MaterialTheme.typography.labelSmall)
        }
    }
}

