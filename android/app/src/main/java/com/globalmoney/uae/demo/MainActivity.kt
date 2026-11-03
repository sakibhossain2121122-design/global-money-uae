package com.globalmoney.uae.demo

import android.content.res.Configuration
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.annotation.StringRes
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import java.util.Locale

private val Emerald = Color(0xFF007F60)
private val Navy = Color(0xFF102A43)
private val Gold = Color(0xFFE8BC56)
private val Palette = lightColorScheme(
    primary = Emerald, onPrimary = Color.White,
    secondary = Navy, onSecondary = Color.White,
    tertiary = Gold, onTertiary = Navy,
    background = Color(0xFFF3F7F6), onBackground = Navy,
    surface = Color.White, onSurface = Navy
)
private enum class Screen(@StringRes val title: Int) {
    WELCOME(R.string.app_name), SIGN_IN(R.string.sign_in), HOME(R.string.home),
    CALCULATOR(R.string.calculator), ADD(R.string.add_money),
    BENEFICIARIES(R.string.beneficiaries), BENEFICIARY(R.string.beneficiaries),
    HISTORY(R.string.history), DETAIL(R.string.detail), SUPPORT(R.string.support)
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent { GlobalMoneyDemo() }
    }
}

@Composable
private fun label(@StringRes id: Int, vararg args: Any): String =
    LocalContext.current.getString(id, *args)

@Composable
private fun GlobalMoneyDemo() {
    val baseContext = LocalContext.current
    var bengali by rememberSaveable {
        mutableStateOf(baseContext.resources.configuration.locales[0].language == "bn")
    }
    val localizedContext = remember(baseContext, bengali) {
        val configuration = Configuration(baseContext.resources.configuration)
        configuration.setLocale(Locale.forLanguageTag(if (bengali) "bn" else "en"))
        baseContext.createConfigurationContext(configuration)
    }
    // Financial samples intentionally live only in memory. No credentials or network clients exist.
    var screen by remember { mutableStateOf(Screen.WELCOME) }
    var provider by remember { mutableStateOf("bKash") }
    val beneficiaries = remember { mutableStateListOf<String>() }
    val transactions = remember { mutableStateListOf<DemoTransaction>().apply { addAll(sampleTransactions()) } }
    var selected by remember { mutableStateOf(transactions.first()) }
    var notice by remember { mutableStateOf<Int?>(null) }
    var requestNumber by remember { mutableIntStateOf(1) }
    fun goBack() {
        screen = when (screen) {
            Screen.SIGN_IN -> Screen.WELCOME
            Screen.BENEFICIARY -> Screen.BENEFICIARIES
            Screen.DETAIL -> Screen.HISTORY
            else -> Screen.HOME
        }
    }
    CompositionLocalProvider(LocalContext provides localizedContext) {
        MaterialTheme(colorScheme = Palette) {
            BackHandler(enabled = screen != Screen.WELCOME && screen != Screen.HOME) { goBack() }
            val scrollState = remember(screen) { ScrollState(0) }
            Scaffold(containerColor = Palette.background) { insets ->
                Column(Modifier.fillMaxSize().padding(insets)) {
                    Column(Modifier.fillMaxWidth().background(Navy).padding(horizontal = 20.dp, vertical = 12.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("GLOBAL MONEY UAE", color = Color.White, fontWeight = FontWeight.Bold,
                                style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                            TextButton(onClick = { bengali = !bengali }) {
                                Text(if (bengali) "English" else "বাংলা", color = Gold)
                            }
                        }
                        Text(label(R.string.demo_banner), color = Gold, style = MaterialTheme.typography.labelLarge)
                    }
                    Column(
                        Modifier.weight(1f).fillMaxWidth().verticalScroll(scrollState)
                            .padding(horizontal = 20.dp, vertical = 16.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        if (screen != Screen.WELCOME && screen != Screen.HOME) {
                            TextButton(onClick = { goBack() }) { Text("‹ " + label(R.string.back)) }
                        }
                        Text(label(screen.title), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                        when (screen) {
                            Screen.WELCOME -> {
                                MoneyCard {
                                    Text("GM", color = Emerald, style = MaterialTheme.typography.displayLarge, fontWeight = FontWeight.Black)
                                    Text(label(R.string.welcome), style = MaterialTheme.typography.headlineMedium)
                                    Text(label(R.string.welcome_body))
                                }
                                Action(R.string.get_started) { screen = Screen.SIGN_IN }
                            }
                            Screen.SIGN_IN -> {
                                MoneyCard { Text(label(R.string.sign_in_body)) }
                                Action(R.string.continue_guest) { screen = Screen.HOME }
                            }
                            Screen.HOME -> {
                                Text(label(R.string.greeting))
                                Card(colors = CardDefaults.cardColors(containerColor = Emerald), modifier = Modifier.fillMaxWidth()) {
                                    Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                        Text(label(R.string.balance), color = Color.White)
                                        Text(label(R.string.balance_value), color = Color.White, style = MaterialTheme.typography.headlineMedium,
                                            fontWeight = FontWeight.Bold)
                                    }
                                }
                                Text(label(R.string.quick_actions), fontWeight = FontWeight.Bold)
                                Action(R.string.calculator) { screen = Screen.CALCULATOR }
                                Action(R.string.add_money) { screen = Screen.ADD }
                                Action(R.string.beneficiaries) { screen = Screen.BENEFICIARIES }
                                Action(R.string.history) { screen = Screen.HISTORY }
                                Action(R.string.support) { screen = Screen.SUPPORT }
                                BotimOption()
                                TextButton(onClick = {
                                    beneficiaries.clear()
                                    transactions.clear()
                                    transactions.addAll(sampleTransactions())
                                    requestNumber = 1
                                    notice = null
                                    screen = Screen.WELCOME
                                }) { Text(label(R.string.sign_out)) }
                            }
                            Screen.CALCULATOR -> AmountScreen(isRequest = false) {}
                            Screen.ADD -> AmountScreen(isRequest = true) { amount ->
                                transactions.add(0, DemoTransaction("DEMO-ADD-${requestNumber++}", "Add Money", amount, DemoStatus.PENDING))
                                notice = R.string.request_created
                            }
                            Screen.BENEFICIARIES -> {
                                Text(label(R.string.choose_provider))
                                listOf("bKash", "Nagad", "Rocket", "Upay", "Bank").forEach { method ->
                                    OutlinedButton(onClick = { provider = method; screen = Screen.BENEFICIARY }, modifier = Modifier.fillMaxWidth()) {
                                        Text("DEMO • " + providerName(method))
                                    }
                                }
                                MoneyCard {
                                    Text(label(R.string.saved_samples), fontWeight = FontWeight.Bold)
                                    if (beneficiaries.isEmpty()) Text(label(R.string.no_samples))
                                    beneficiaries.forEach { Text("DEMO • " + providerName(it) + " • " + label(R.string.sample_name)) }
                                }
                            }
                            Screen.BENEFICIARY -> {
                                Text("DEMO • " + providerName(provider), style = MaterialTheme.typography.headlineMedium)
                                Text(label(R.string.beneficiary_note))
                                MoneyCard {
                                    Text(label(R.string.sample_name), fontWeight = FontWeight.Bold)
                                    Text(label(if (provider == "Bank") R.string.sample_bank else R.string.sample_wallet))
                                }
                                Action(R.string.add_beneficiary) {
                                    if (provider in beneficiaries) notice = R.string.already_added
                                    else { beneficiaries.add(provider); notice = R.string.added_beneficiary }
                                }
                            }
                            Screen.HISTORY -> {
                                Text(label(R.string.history_note))
                                transactions.forEach { transaction ->
                                    Card(onClick = { selected = transaction; screen = Screen.DETAIL }, modifier = Modifier.fillMaxWidth()) {
                                        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                            Text("DEMO • " + providerName(transaction.method), fontWeight = FontWeight.Bold)
                                            Text(label(R.string.demo_amount_display, transaction.aed))
                                            Text(label(statusLabel(transaction.status)), color = statusColor(transaction.status))
                                            Text(label(R.string.demo_id, transaction.id), style = MaterialTheme.typography.bodySmall)
                                        }
                                    }
                                }
                            }
                            Screen.DETAIL -> {
                                MoneyCard {
                                    Text(label(statusLabel(selected.status)), color = statusColor(selected.status),
                                        style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                                    Text(label(R.string.demo_id, selected.id))
                                    Text("DEMO • " + providerName(selected.method))
                                    Text(label(R.string.demo_amount_display, selected.aed))
                                    if (!selected.id.startsWith("DEMO-ADD")) Text(label(R.string.fictional_date))
                                    Text(label(when (selected.status) {
                                        DemoStatus.COMPLETED -> R.string.status_completed
                                        DemoStatus.PENDING -> R.string.status_pending
                                        DemoStatus.FAILED -> R.string.status_failed
                                    }))
                                }
                                Text(label(R.string.detail_note))
                            }
                            Screen.SUPPORT -> {
                                Text(label(R.string.support_body), style = MaterialTheme.typography.titleLarge)
                                MoneyCard {
                                    Text(label(R.string.faq_money), fontWeight = FontWeight.Bold)
                                    Text(label(R.string.faq_money_answer))
                                    HorizontalDivider()
                                    Text(label(R.string.faq_data), fontWeight = FontWeight.Bold)
                                    Text(label(R.string.faq_data_answer))
                                }
                                Text(label(R.string.contact))
                                Action(R.string.simulate_support) { notice = R.string.support_confirmation }
                            }
                        }
                        Spacer(Modifier.height(16.dp))
                    }
                }
            }
            notice?.let { message ->
                AlertDialog(onDismissRequest = { notice = null },
                    title = { Text("DEMO") }, text = { Text(label(message)) },
                    confirmButton = { TextButton(onClick = { notice = null }) { Text(label(R.string.dismiss)) } })
            }
        }
    }
}

@Composable
private fun providerName(provider: String): String = when (provider) {
    "Bank" -> label(R.string.bank)
    "Add Money" -> label(R.string.add_money)
    else -> provider
}

@StringRes
private fun statusLabel(status: DemoStatus): Int = when (status) {
    DemoStatus.COMPLETED -> R.string.completed
    DemoStatus.PENDING -> R.string.pending
    DemoStatus.FAILED -> R.string.failed
}
private fun statusColor(status: DemoStatus): Color = when (status) {
    DemoStatus.COMPLETED -> Emerald
    DemoStatus.PENDING -> Navy
    DemoStatus.FAILED -> Color(0xFFAD2537)
}

@Composable
private fun MoneyCard(content: @Composable ColumnScope.() -> Unit) {
    Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White)) {
        Column(Modifier.padding(22.dp), verticalArrangement = Arrangement.spacedBy(14.dp), content = content)
    }
}

@Composable
private fun Action(@StringRes title: Int, onClick: () -> Unit) {
    Button(onClick = onClick, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
        shape = RoundedCornerShape(14.dp)) { Text(label(title)) }
}

@Composable
private fun BotimOption() {
    OutlinedButton(onClick = {}, enabled = false, modifier = Modifier.fillMaxWidth()) { Text(label(R.string.botim)) }
    Text(label(R.string.botim_note), style = MaterialTheme.typography.bodySmall)
}

@Composable
private fun AmountScreen(isRequest: Boolean, onRequest: (String) -> Unit) {
    var amount by rememberSaveable { mutableStateOf("100") }
    val parsed = DemoMoney.parseAmount(amount)
    Text(label(if (isRequest) R.string.add_note else R.string.rate_note))
    OutlinedTextField(
        value = amount, onValueChange = { if (it.length <= 12) amount = it },
        label = { Text(label(R.string.aed_amount)) }, singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
        isError = parsed == null, modifier = Modifier.fillMaxWidth(),
        supportingText = { if (parsed == null) Text(label(R.string.amount_error)) }
    )
    if (isRequest) {
        BotimOption()
        Button(onClick = { parsed?.let { onRequest(DemoMoney.display(it)) } }, enabled = parsed != null,
            modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) { Text(label(R.string.create_request)) }
    } else {
        MoneyCard {
            Text(label(R.string.bdt_result, parsed?.let { DemoMoney.display(DemoMoney.toBdt(it)) } ?: "—"),
                style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        }
    }
}
