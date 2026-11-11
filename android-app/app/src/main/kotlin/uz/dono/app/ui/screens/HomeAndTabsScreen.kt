package uz.dono.app.ui.screens

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ExitToApp
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.Book
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.EmojiEvents
import androidx.compose.material.icons.rounded.Flag
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.LocalFireDepartment
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.PersonAdd
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import uz.dono.app.data.LeaderboardEntry
import uz.dono.app.data.SubjectItem
import uz.dono.app.data.computeLevelProgress
import uz.dono.app.data.formatUzPhoneForDisplay
import uz.dono.app.ui.DonoUiState
import uz.dono.app.ui.theme.BrandBlue
import uz.dono.app.ui.theme.SuccessGreen
import uz.dono.app.ui.theme.WarningAmber

private enum class MainTab(val title: String, val icon: ImageVector) {
    HOME("Asosiy", Icons.Rounded.Home),
    LEARN("O‘rganish", Icons.Rounded.Book),
    MISSION("Missiya", Icons.Rounded.Flag),
    LEADERBOARD("Reyting", Icons.Rounded.EmojiEvents),
    PROFILE("Profil", Icons.Rounded.Person)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainTabsScreen(
    state: DonoUiState,
    onRefresh: () -> Unit,
    onSubjectClick: (SubjectItem) -> Unit,
    onLeaderboardScopeChange: (String) -> Unit,
    onAddFriend: (String, () -> Unit) -> Unit,
    onSaveServerUrl: (String) -> Unit,
    onLogout: () -> Unit
) {
    var selectedTabIndex by rememberSaveable { mutableIntStateOf(0) }
    val currentTab = MainTab.entries[selectedTabIndex]

    var showConfigDialog by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = currentTab.title,
                            fontWeight = FontWeight.Bold
                        )
                        if (currentTab == MainTab.HOME && state.student != null) {
                            Text(
                                text = "Xush kelibsiz, ${state.student.shortGreetingName}!",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                },
                actions = {
                    if (currentTab == MainTab.HOME && state.student != null) {
                        AssistChip(
                            onClick = { selectedTabIndex = MainTab.MISSION.ordinal },
                            leadingIcon = {
                                Icon(
                                    Icons.Rounded.LocalFireDepartment,
                                    contentDescription = null,
                                    tint = WarningAmber,
                                    modifier = Modifier.size(18.dp)
                                )
                            },
                            label = { Text("${state.student.streakDays}") },
                            modifier = Modifier.padding(end = 6.dp)
                        )
                        AssistChip(
                            onClick = { selectedTabIndex = MainTab.LEADERBOARD.ordinal },
                            leadingIcon = {
                                Icon(
                                    Icons.Rounded.Star,
                                    contentDescription = null,
                                    tint = BrandBlue,
                                    modifier = Modifier.size(18.dp)
                                )
                            },
                            label = { Text("${state.student.totalPoints}") },
                            modifier = Modifier.padding(end = 8.dp)
                        )
                    } else {
                        IconButton(onClick = onRefresh) {
                            Icon(Icons.Rounded.Refresh, contentDescription = "Yangilash")
                        }
                    }
                }
            )
        },
        bottomBar = {
            NavigationBar {
                MainTab.entries.forEachIndexed { idx, tab ->
                    NavigationBarItem(
                        selected = selectedTabIndex == idx,
                        onClick = { selectedTabIndex = idx },
                        icon = { Icon(tab.icon, contentDescription = tab.title) },
                        label = { Text(tab.title, maxLines = 1, overflow = TextOverflow.Ellipsis) }
                    )
                }
            }
        }
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            when (currentTab) {
                MainTab.HOME -> HomeTabContent(
                    state = state,
                    onRefresh = onRefresh,
                    onSubjectClick = onSubjectClick,
                    onContinueMission = {
                        val first = state.subjects.firstOrNull()
                        if (first != null) onSubjectClick(first)
                    }
                )
                MainTab.LEARN -> LearnTabContent(
                    state = state,
                    onSubjectClick = onSubjectClick
                )
                MainTab.MISSION -> MissionsTabContent(state = state)
                MainTab.LEADERBOARD -> LeaderboardTabContent(
                    state = state,
                    onScopeChange = onLeaderboardScopeChange,
                    onAddFriend = onAddFriend
                )
                MainTab.PROFILE -> ProfileTabContent(
                    state = state,
                    onOpenServerSettings = { showConfigDialog = true },
                    onLogout = onLogout
                )
            }
        }
    }

    if (showConfigDialog) {
        ServerConfigDialog(
            initialUrl = state.serverUrl,
            onDismiss = { showConfigDialog = false },
            onSave = { url ->
                showConfigDialog = false
                onSaveServerUrl(url)
            }
        )
    }
}

@Composable
private fun HomeTabContent(
    state: DonoUiState,
    onRefresh: () -> Unit,
    onSubjectClick: (SubjectItem) -> Unit,
    onContinueMission: () -> Unit
) {
    val student = state.student
    val dailyDone = student?.dailyQuestionsCount ?: 0
    val dailyTarget = (student?.dailyGoalTarget ?: 10).coerceAtLeast(1)
    val dailyProgress = (dailyDone.toFloat() / dailyTarget.toFloat()).coerceIn(0f, 1f)

    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        modifier = Modifier.fillMaxSize()
    ) {
        if (!state.isLiveMode) {
            item {
                Surface(
                    color = MaterialTheme.colorScheme.secondaryContainer,
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = "Oflayn rejim: namunaviy fanlar ko‘rsatilmoqda. Jonli sinxronizatsiya uchun Profildan server manzilini kiriting.",
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(12.dp)
                    )
                }
            }
        }

        // Daily Mission Card
        item {
            ElevatedCard(
                shape = RoundedCornerShape(22.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier.padding(18.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(
                        text = "Kunlik missiya",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.primary
                    )
                    Text(
                        text = "$dailyTarget ta savolga javob bering",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = "Bugun bajarildi: $dailyDone / $dailyTarget · Har bir to‘g‘ri javob +5 ochko",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    LinearProgressIndicator(
                        progress = { dailyProgress },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(8.dp)
                            .clip(RoundedCornerShape(99.dp))
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Button(
                        onClick = onContinueMission,
                        enabled = state.subjects.isNotEmpty(),
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(48.dp)
                    ) {
                        Text(
                            text = if (dailyDone >= dailyTarget) "Yana test yechish" else "Davom ettirish",
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }
            }
        }

        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "FANLAR",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                TextButton(onClick = onRefresh) {
                    Text("Yangilash")
                }
            }
        }

        if (state.isLoadingSubjects) {
            item {
                Box(modifier = Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
        } else if (state.subjects.isEmpty()) {
            item {
                OutlinedCard(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp)) {
                    Text(
                        text = "Hali fanlar qo‘shilmagan. Admin paneldan fan va testlar yuklang.",
                        modifier = Modifier.padding(20.dp),
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        } else {
            items(state.subjects, key = { it.id }) { subject ->
                SubjectRowCard(subject = subject, onClick = { onSubjectClick(subject) })
            }
        }
    }
}

@Composable
private fun SubjectRowCard(subject: SubjectItem, onClick: () -> Unit) {
    val badgeColor = parseHexColor(subject.colorHex)
    ElevatedCard(
        onClick = onClick,
        shape = RoundedCornerShape(18.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(badgeColor.copy(alpha = 0.14f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = subjectIcon(subject.iconKey),
                    contentDescription = null,
                    tint = badgeColor,
                    modifier = Modifier.size(26.dp)
                )
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = subject.name,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold
                )
                Text(
                    text = "${subject.quizCount} ta test to‘plami · ${subject.questionCount} savol",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Icon(
                imageVector = Icons.AutoMirrored.Rounded.KeyboardArrowRight,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun LearnTabContent(
    state: DonoUiState,
    onSubjectClick: (SubjectItem) -> Unit
) {
    var query by remember { mutableStateOf("") }
    val filtered = state.subjects.filter {
        query.isBlank() ||
            it.name.contains(query, ignoreCase = true) ||
            it.description.contains(query, ignoreCase = true)
    }

    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        modifier = Modifier.fillMaxSize()
    ) {
        item {
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                placeholder = { Text("Fan nomi bo‘yicha qidirish...") },
                leadingIcon = { Icon(Icons.Rounded.Search, contentDescription = null) },
                singleLine = true,
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth()
            )
        }

        items(filtered, key = { it.id }) { subject ->
            val color = parseHexColor(subject.colorHex)
            OutlinedCard(
                onClick = { onSubjectClick(subject) },
                shape = RoundedCornerShape(18.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Icon(subjectIcon(subject.iconKey), contentDescription = null, tint = color)
                        Text(subject.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    }
                    if (subject.description.isNotBlank()) {
                        Text(
                            subject.description,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Text(
                        "${subject.quizCount} ta test · 10 / 25 / 50 savol rejimlari",
                        style = MaterialTheme.typography.labelMedium,
                        color = color
                    )
                }
            }
        }
    }
}

@Composable
private fun MissionsTabContent(state: DonoUiState) {
    val student = state.student
    val points = student?.totalPoints ?: 0
    val (levelName, curPts, nextGoal) = computeLevelProgress(points)
    val levelPct = (curPts.toFloat() / nextGoal.toFloat()).coerceIn(0f, 1f)
    val dailyDone = student?.dailyQuestionsCount ?: 0
    val dailyTarget = student?.dailyGoalTarget ?: 10

    val milestones = listOf(
        Triple("Boshlovchi", "0 — 299 ochko", points >= 0),
        Triple("Bilimdon", "300+ ochko", points >= 300),
        Triple("Zukko", "800+ ochko", points >= 800),
        Triple("Alloma", "1 500+ ochko", points >= 1500),
        Triple("Ustoz", "2 500+ ochko", points >= 2500)
    )

    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
        modifier = Modifier.fillMaxSize()
    ) {
        item {
            ElevatedCard(shape = RoundedCornerShape(20.dp), modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Icon(Icons.Rounded.AutoAwesome, contentDescription = null, tint = BrandBlue)
                        Text("Sizning darajangiz: $levelName", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    }
                    LinearProgressIndicator(
                        progress = { levelPct },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(8.dp)
                            .clip(RoundedCornerShape(99.dp))
                    )
                    Text(
                        "$curPts / $nextGoal ochko",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }

        item {
            ElevatedCard(shape = RoundedCornerShape(20.dp), modifier = Modifier.fillMaxWidth()) {
                Row(
                    modifier = Modifier.padding(18.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    Icon(Icons.Rounded.LocalFireDepartment, contentDescription = null, tint = WarningAmber, modifier = Modifier.size(36.dp))
                    Column {
                        Text("${student?.streakDays ?: 1} kunlik streak!", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        Text("Bugungi missiya: $dailyDone / $dailyTarget savol yechildi", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }

        item {
            Text("DARAJALAR XARITASI", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }

        items(milestones) { (title, desc, unlocked) ->
            OutlinedCard(shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth()) {
                Row(
                    modifier = Modifier.padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(title, fontWeight = FontWeight.SemiBold)
                        Text(desc, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Icon(
                        imageVector = Icons.Rounded.CheckCircle,
                        contentDescription = null,
                        tint = if (unlocked) SuccessGreen else MaterialTheme.colorScheme.outline
                    )
                }
            }
        }
    }
}

@Composable
private fun LeaderboardTabContent(
    state: DonoUiState,
    onScopeChange: (String) -> Unit,
    onAddFriend: (String, () -> Unit) -> Unit
) {
    val scopes = listOf("all" to "Umumiy", "friends" to "Do‘stlar")
    var showAddFriendDialog by remember { mutableStateOf(false) }
    var friendCode by remember { mutableStateOf("") }

    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
        modifier = Modifier.fillMaxSize()
    ) {
        item {
            SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                scopes.forEachIndexed { index, (key, label) ->
                    SegmentedButton(
                        selected = state.leaderboardScope == key,
                        onClick = { onScopeChange(key) },
                        shape = SegmentedButtonDefaults.itemShape(index = index, count = scopes.size),
                        label = { Text(label) }
                    )
                }
            }
        }

        if (state.leaderboardScope == "friends") {
            item {
                OutlinedButton(
                    onClick = { showAddFriendDialog = true },
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(Icons.Rounded.PersonAdd, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Telefon raqam yoki kod orqali do‘st qo‘shish")
                }
            }
        }

        if (state.isLoadingLeaderboard) {
            item {
                Box(modifier = Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
        } else {
            if (state.leaderboard.size >= 3) {
                item {
                    PodiumCard(top3 = state.leaderboard.take(3))
                }
            }

            items(state.leaderboard, key = { it.id }) { entry ->
                val containerColor = if (entry.isMe) {
                    MaterialTheme.colorScheme.primaryContainer
                } else {
                    MaterialTheme.colorScheme.surface
                }
                Card(
                    colors = CardDefaults.cardColors(containerColor = containerColor),
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                            modifier = Modifier.weight(1f)
                        ) {
                            Text(
                                text = "${entry.rank}.",
                                fontWeight = FontWeight.Bold,
                                color = if (entry.isMe) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Column {
                                Text(
                                    text = if (entry.isMe) "${entry.fullName} (Siz)" else entry.fullName,
                                    fontWeight = if (entry.isMe) FontWeight.Bold else FontWeight.Medium
                                )
                                Text(
                                    text = "${entry.rank}-o‘rin · ${entry.levelName}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                        Text(
                            text = "${entry.totalPoints} ochko",
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                }
            }
        }
    }

    if (showAddFriendDialog) {
        AlertDialog(
            onDismissRequest = { showAddFriendDialog = false },
            title = { Text("Do‘st qo‘shish") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        "Do‘stingizning telefon raqamini (+998...) yoki do‘st kodini kiriting (sizning raqamingiz: ${formatUzPhoneForDisplay(state.student?.phone.orEmpty())}):",
                        style = MaterialTheme.typography.bodySmall
                    )
                    OutlinedTextField(
                        value = friendCode,
                        onValueChange = { friendCode = it },
                        label = { Text("Telefon raqam yoki kod") },
                        placeholder = { Text("+998 90 123 45 67") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                Button(
                    enabled = friendCode.trim().length >= 4,
                    onClick = {
                        onAddFriend(friendCode.trim()) {
                            friendCode = ""
                            showAddFriendDialog = false
                        }
                    }
                ) {
                    Text("Qo‘shish")
                }
            },
            dismissButton = {
                TextButton(onClick = { showAddFriendDialog = false }) { Text("Bekor qilish") }
            }
        )
    }
}

@Composable
private fun PodiumCard(top3: List<LeaderboardEntry>) {
    val first = top3[0]
    val second = top3[1]
    val third = top3[2]

    ElevatedCard(shape = RoundedCornerShape(22.dp), modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.Bottom
        ) {
            PodiumBar(place = 2, entry = second, heightDp = 64, color = Color(0xFF94A3B8))
            PodiumBar(place = 1, entry = first, heightDp = 92, color = BrandBlue)
            PodiumBar(place = 3, entry = third, heightDp = 48, color = Color(0xFFD97706))
        }
    }
}

@Composable
private fun PodiumBar(place: Int, entry: LeaderboardEntry, heightDp: Int, color: Color) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.width(96.dp)
    ) {
        Text(
            text = entry.fullName.substringBefore(" "),
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
        Spacer(modifier = Modifier.height(6.dp))
        Box(
            modifier = Modifier
                .width(64.dp)
                .height(heightDp.dp)
                .clip(RoundedCornerShape(topStart = 12.dp, topEnd = 12.dp))
                .background(color),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = "#$place",
                color = Color.White,
                fontWeight = FontWeight.Bold
            )
        }
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            text = "${entry.totalPoints}",
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.Bold
        )
    }
}

@Composable
private fun ProfileTabContent(
    state: DonoUiState,
    onOpenServerSettings: () -> Unit,
    onLogout: () -> Unit
) {
    val student = state.student ?: return
    val context = LocalContext.current

    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
        modifier = Modifier.fillMaxSize()
    ) {
        item {
            ElevatedCard(shape = RoundedCornerShape(22.dp), modifier = Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier.padding(18.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                        Box(
                            modifier = Modifier
                                .size(56.dp)
                                .clip(CircleShape)
                                .background(MaterialTheme.colorScheme.primaryContainer),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = student.shortGreetingName.take(1).uppercase(),
                                style = MaterialTheme.typography.headlineSmall,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.primary
                            )
                        }
                        Column {
                            Text(student.displayName, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                            Text(
                                "${formatUzPhoneForDisplay(student.phone)} · ${student.levelName}",
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }

                    Surface(
                        color = MaterialTheme.colorScheme.surfaceVariant,
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable {
                                val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                cm.setPrimaryClip(ClipData.newPlainText("DONO Phone", student.phone))
                                Toast.makeText(context, "Telefon raqami nusxalandi: ${student.phone}", Toast.LENGTH_SHORT).show()
                            }
                    ) {
                        Row(
                            modifier = Modifier.padding(12.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column {
                                Text("Telefon raqam (Yagona hisob)", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text(formatUzPhoneForDisplay(student.phone), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                            }
                            Icon(Icons.Rounded.ContentCopy, contentDescription = "Nusxalash")
                        }
                    }
                }
            }
        }

        item {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedButton(
                    onClick = onOpenServerSettings,
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier.weight(1f)
                ) {
                    Icon(Icons.Rounded.Settings, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Server")
                }
                OutlinedButton(
                    onClick = onLogout,
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier.weight(1f)
                ) {
                    Icon(Icons.AutoMirrored.Rounded.ExitToApp, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Chiqish")
                }
            }
        }

        item {
            Text("YECHILGAN TESTLAR TARIXI", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }

        if (state.history.isEmpty()) {
            item {
                OutlinedCard(shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth()) {
                    Text(
                        "Hali birorta test yechilmagan.",
                        modifier = Modifier.padding(18.dp),
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        } else {
            items(state.history, key = { it.attemptId }) { item ->
                OutlinedCard(shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth()) {
                    Row(
                        modifier = Modifier.padding(14.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(item.subjectName, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                            Text(item.quizTitle, fontWeight = FontWeight.SemiBold)
                            Text("${item.correctCount}/${item.totalQuestions} to‘g‘ri · +${item.earnedPoints} ochko", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Text("${item.scorePercent.toInt()}%", fontWeight = FontWeight.Bold, color = BrandBlue)
                    }
                }
            }
        }
    }
}

