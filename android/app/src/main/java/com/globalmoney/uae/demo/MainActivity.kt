package com.globalmoney.uae.demo

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModelProvider
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors
import java.util.UUID

private val Red = Color(0xFFB91C36)
private val DarkRed = Color(0xFF681326)
private val Palette = lightColorScheme(primary = Red, secondary = DarkRed,
    background = Color(0xFFFFF8F8), surface = Color.White, onSurface = Color(0xFF28191B), onBackground = Color(0xFF28191B))

class MainActivity : ComponentActivity() {
    private val session: AccountSession by lazy { ViewModelProvider(this)[AccountSession::class.java] }
    private val executor = Executors.newSingleThreadExecutor()
    private val handler = Handler(Looper.getMainLooper())
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        setContent { PremiumApp(session) { work, done ->
            executor.execute {
                val result = runCatching(work)
                handler.post { if (!isDestroyed) done(result) }
            }
        } }
    }
    override fun onDestroy() {
        executor.shutdownNow()
        handler.removeCallbacksAndMessages(null)
        super.onDestroy()
    }
}

@Composable
private fun PremiumApp(session: AccountSession, run: (() -> String, (Result<String>) -> Unit) -> Unit) {
    val api = session.api
    var bn by rememberSaveable { mutableStateOf(false) }
    fun t(en: String, bengali: String) = if (bn) bengali else en
    var signedIn by remember { mutableStateOf(!api.token.isNullOrBlank()) }
    var page by remember { mutableStateOf("Home") }
    var register by remember { mutableStateOf(false) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    var account by remember { mutableStateOf("") }
    var bank by remember { mutableStateOf("") }
    var provider by rememberSaveable { mutableStateOf("bKash") }
    var subject by remember { mutableStateOf("") }
    var message by remember { mutableStateOf("") }
    var rows by remember { mutableStateOf(JSONArray()) }
    var paymentMethods by remember { mutableStateOf<List<PaymentMethod>>(emptyList()) }
    var methodsLoaded by remember { mutableStateOf(false) }
    var addAmount by remember { mutableStateOf("") }
    var addNote by remember { mutableStateOf("") }
    var addMethod by remember { mutableStateOf("") }
    var addMethods by remember { mutableStateOf(JSONArray()) }
    var addKey by rememberSaveable { mutableStateOf(UUID.randomUUID().toString()) }
    var addPayload by remember { mutableStateOf<String?>(null) }
    var requestRows by remember { mutableStateOf(JSONArray()) }
    var sendRecipients by remember { mutableStateOf(JSONArray()) }
    var sendCustomerId by remember { mutableStateOf("") }
    var sendAmount by remember { mutableStateOf("") }
    var sendRecipient by remember { mutableStateOf("") }
    var acceptReservation by remember { mutableStateOf(false) }
    var receiptRequestId by remember { mutableStateOf("") }
    var walletAmounts by remember { mutableStateOf(WalletAmounts(null, null)) }
    var rate by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var notice by remember { mutableStateOf("") }
    fun call(work: () -> String, onFailure: (Throwable) -> Unit = {}, done: (String) -> Unit = {}) {
        busy = true; notice = ""
        run(work) { result ->
            busy = false
            result.mapCatching { done(it) }.onFailure { error ->
                notice = when (error) {
                    is AccountFailure.NotConfigured ->
                        t("Account service not configured.", "অ্যাকাউন্ট সেবা কনফিগার করা নেই।")

                    is AccountFailure.Network ->
                        t("Cannot connect to the account service. Check internet or try later.", "অ্যাকাউন্ট সার্ভারে সংযোগ হচ্ছে না। ইন্টারনেট পরীক্ষা করে আবার চেষ্টা করুন।")

                    is AccountFailure.Session ->
                        if (session.pendingSendMoney != null)
                            t("Session expired. Sign in and check Send Money request history before submitting again.", "সেশনের মেয়াদ শেষ। আবার লগইন করে নতুন অনুরোধের আগে অর্থ পাঠানোর ইতিহাস দেখুন।")
                        else t("Session expired. Please sign in again.", "সেশনের মেয়াদ শেষ। আবার লগইন করুন।")

                    is AccountFailure.SessionChanged ->
                        t("Your session changed. Please retry.", "আপনার সেশন পরিবর্তিত হয়েছে। আবার চেষ্টা করুন।")

                    is AccountFailure.InvalidCredentials ->
                        t("Email or password is incorrect.", "ইমেইল অথবা পাসওয়ার্ড সঠিক নয়।")

                    is AccountFailure.Unavailable ->
                        t("Account service temporarily unavailable.", "অ্যাকাউন্ট সেবা সাময়িক অনুপলব্ধ।")

                    is AccountFailure.InvalidReceipt ->
                        t("Choose a JPG, PNG or PDF receipt of at most 5 MB.", "সর্বোচ্চ ৫ এমবি JPG, PNG বা PDF রসিদ নির্বাচন করুন।")

                    is AccountFailure.Rejected -> when (error.status) {
                        400 -> t("Check your registration details and password.", "নিবন্ধনের তথ্য ও পাসওয়ার্ড পরীক্ষা করুন।")
                        401 -> t("Registration was not authorized by the account service. Please contact support.", "অ্যাকাউন্ট সেবা নিবন্ধনের অনুমতি দেয়নি। সহায়তার জন্য যোগাযোগ করুন।")
                        409 -> t("Account request could not be accepted.", "অ্যাকাউন্টের অনুরোধ গ্রহণ করা যায়নি।")
                        429 -> t("Too many attempts. Try again later.", "অনেকবার চেষ্টা হয়েছে। পরে আবার চেষ্টা করুন।")
                        else -> t("Request rejected. Please check your details.", "অনুরোধ গ্রহণ করা হয়নি। তথ্য পরীক্ষা করুন।")
                    }
                    else ->
                        t("Unable to complete request.", "অনুরোধ সম্পন্ন হয়নি।")
                }

                if (page == "AddMoneyRequest" && error is AccountFailure.Rejected && error.status in listOf(400, 409, 422)) {
                    addPayload = null; addKey = UUID.randomUUID().toString()
                    notice = if (error.status == 409) "A matching request may already exist. Check My Add Money Requests." else "Check the amount, payment method and note, then try again."
                }
                if (page == "AddMoneyHistory" && error is AccountFailure.Rejected && error.status in listOf(400, 409, 413, 415)) {
                    notice = t("Receipt rejected. Check its type and size, or whether it was already submitted.", "রসিদ গ্রহণ করা হয়নি। ফাইলের ধরন, আকার বা পূর্বে জমা হয়েছে কি না পরীক্ষা করুন।")
                }
                if (api.token == null && signedIn) {
                    signedIn = false
                    session.pendingSendMoney = null
                    paymentMethods = emptyList()
                    methodsLoaded = false
                    rows = JSONArray()
                    name = ""
                    account = ""
                    bank = ""
                    subject = ""
                    message = ""
                }
                onFailure(error)
            }
        }
    }
    val context = LocalContext.current
    val pendingStore = remember { PendingSendMoneyStore(context.applicationContext) }
    val receiptPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null && receiptRequestId.isNotEmpty()) {
            val id = receiptRequestId
            call({
                val type = context.contentResolver.getType(uri)
                val input = context.contentResolver.openInputStream(uri) ?: throw java.io.IOException("Receipt unavailable")
                api.uploadReceipt(id, type, input)
            }) {
                notice = t("Receipt submitted for review. No wallet credit was made.", "রসিদ পর্যালোচনার জন্য জমা হয়েছে। ওয়ালেটে কোনো টাকা যোগ হয়নি।")
            }
        }
    }
    fun loadPaymentMethods() {
        // Clear prior results before each read, including retries, so errors never show stale metadata.
        page = "PaymentMethods"; paymentMethods = emptyList(); methodsLoaded = false
        call({ api.paymentMethods() }) { response ->
            paymentMethods = PaymentMethods.parse(response)
            methodsLoaded = true
        }
    }
    fun loadWallet() {
        walletAmounts = WalletAmounts(null, null)
        rate = null
        call({ api.request("wallet") }) { response ->
            walletAmounts = WalletAmounts.parse(response)
            call({ api.request("rates") }) { rate = customerRate(it) }
        }
    }
    LaunchedEffect(signedIn) {
        if (!signedIn) { addPayload = null; addKey = UUID.randomUUID().toString(); addAmount = ""; addNote = ""; addMethod = ""; addMethods = JSONArray(); requestRows = JSONArray(); walletAmounts = WalletAmounts(null, null); rate = null; receiptRequestId = "" }
        else loadWallet()
    }
    MaterialTheme(colorScheme = Palette) {
        Scaffold { insets ->
            Column(Modifier.fillMaxSize().padding(insets)) {
                Row(Modifier.fillMaxWidth().background(DarkRed).padding(16.dp)) {
                    Text("GLOBAL MONEY UAE", color = Color.White, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                    TextButton(onClick = { bn = !bn }) { Text(if (bn) "English" else "বাংলা", color = Color.White) }
                }
                Column(Modifier.verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    Text(t("Your connection to home", "দেশের সাথে আপনার সংযোগ"), style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                    Text(t("Payments and transfers are not yet available.", "পেমেন্ট ও অর্থ স্থানান্তর এখনও চালু হয়নি।"), color = Red)
                    if (busy) LinearProgressIndicator(Modifier.fillMaxWidth())
                    if (notice.isNotEmpty()) Text(notice, color = MaterialTheme.colorScheme.error)
                    if (!signedIn) {
                        Text(t(if (register) "Create account" else "Sign in", if (register) "অ্যাকাউন্ট তৈরি করুন" else "লগইন করুন"), style = MaterialTheme.typography.titleLarge)
                        if (register) Field(name, { name = it }, t("Full name", "পুরো নাম"))
                        OutlinedTextField(email, { email = it.take(254) }, label = { Text(t("Email", "ইমেইল")) }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email), modifier = Modifier.fillMaxWidth())
                        OutlinedTextField(password, { password = it.take(128) }, label = { Text(t("Password (12–128 characters)", "পাসওয়ার্ড (১২–১২৮ অক্ষর)")) }, visualTransformation = PasswordVisualTransformation(), singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password), modifier = Modifier.fillMaxWidth())
                        if (password.isNotEmpty() && password.length < 12) {
                            Text(t("Enter at least 12 characters to continue.", "এগোতে কমপক্ষে ১২ অক্ষরের পাসওয়ার্ড লিখুন।"), color = MaterialTheme.colorScheme.error)
                        }
                        Button(enabled = !busy && email.isNotBlank() && password.length >= 12 && (!register || name.isNotBlank()), onClick = {
                            val payload = JSONObject().put("email", email).put("password", password).put("name", name)
                            val creating = register
                            password = ""
                            call({ api.request(if (creating) "auth/register" else "auth/login", "POST", payload) }) { response ->
                                if (creating) { register = false; notice = t("Please sign in to your account.", "আপনার অ্যাকাউন্টে লগইন করুন।") }
                                else { api.token = JSONObject(response).getString("token"); signedIn = true; email = ""; name = ""; page = "Home" }
                            }
                        }, modifier = Modifier.fillMaxWidth()) { Text(t(if (register) "Register" else "Sign in", if (register) "নিবন্ধন" else "লগইন")) }
                        TextButton(enabled = !busy, onClick = { register = !register; password = "" }) { Text(t(if (register) "Already have an account? Sign in" else "Create account", if (register) "লগইন করুন" else "অ্যাকাউন্ট তৈরি করুন")) }
                    } else {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            TextButton(enabled = !busy, onClick = { page = "Home"; rows = JSONArray(); loadWallet() }) { Text(t("Home", "হোম")) }
                            TextButton(enabled = !busy, onClick = { call({ api.request("me") }) { name = JSONObject(it).getString("name"); page = "Profile" } }) { Text(t("Profile", "প্রোফাইল")) }
                            TextButton(enabled = !busy, onClick = {
                                call({ api.request("auth/logout", "POST", JSONObject()) }) {
                                    api.token = null; session.pendingSendMoney = null; signedIn = false; paymentMethods = emptyList(); methodsLoaded = false; rows = JSONArray(); name = ""; account = ""; bank = ""; subject = ""; message = ""
                                }
                            }) { Text(t("Logout", "লগআউট")) }
                        }
                        when(page) {
                            "Home" -> {
                                WalletHome(walletAmounts, rate, bn, busy, onRefresh = { loadWallet() }) { action ->
                                    when (action) {
                                        HomeAction.ADD_MONEY -> call({ api.request("add-money-request-methods") }) { addMethods = JSONArray(it); page = "AddMoneyRequest" }
                                        HomeAction.SEND_MONEY -> {
                                            call({
                                                JSONObject().put("customer", JSONObject(api.request("me")))
                                                    .put("recipients", JSONArray(api.request("beneficiaries"))).toString()
                                            }) {
                                                val data = JSONObject(it)
                                                val customerId = data.getJSONObject("customer").getString("id")
                                                val pending = pendingStore.load(customerId)
                                                sendCustomerId = customerId
                                                session.pendingSendMoney = pending
                                                sendRecipients = data.getJSONArray("recipients")
                                                page = "SendMoney"
                                            }
                                        }
                                        HomeAction.REQUESTS -> call({ api.request("add-money-requests") }) { requestRows = JSONArray(it); page = "AddMoneyHistory" }
                                        HomeAction.HISTORY -> call({ api.request("transactions") }) { rows = JSONArray(it); page = "History" }
                                        HomeAction.PROFILE -> call({ api.request("me") }) { name = JSONObject(it).getString("name"); page = "Profile" }
                                        HomeAction.SUPPORT -> call({ api.request("support") }) { rows = JSONArray(it); page = "Support" }
                                        HomeAction.PAYMENT_METHODS -> loadPaymentMethods()
                                        HomeAction.BENEFICIARIES -> call({ api.request("beneficiaries") }) { rows = JSONArray(it); page = "Beneficiaries" }
                                    }
                                }
                                Text(t("Identity verification is not available. Do not submit identity documents.", "পরিচয় যাচাই চালু হয়নি। পরিচয়পত্র জমা দেবেন না।"))
                            }
                            "SendMoney" -> {
                                Text(t("Send Money", "অর্থ পাঠান"), style = MaterialTheme.typography.titleLarge)
                                Text(t("Payouts and transfers are not available.", "পেআউট ও অর্থ স্থানান্তর উপলব্ধ নয়।"))
                                Text(t("Supported recipient formats (not payout availability)", "প্রাপকের সমর্থিত ধরন (পেআউট উপলব্ধতার নির্দেশ নয়)"))
                                Text("bKash · Nagad · Rocket · Upay · Bank")
                                Text(t("Payout bank availability is not provided to customers.", "গ্রাহকদের জন্য পেআউট ব্যাংকের উপলব্ধতা দেওয়া হয় না।"))
                                Text(t("A review request reserves your available balance. Only an administrator can release a reservation. No payout or debit is made.", "পর্যালোচনার অনুরোধে আপনার ব্যবহারযোগ্য ব্যালেন্স সংরক্ষিত হবে। শুধু অ্যাডমিন সংরক্ষণ মুক্ত করতে পারেন। কোনো পেআউট বা ডেবিট হবে না।"))
                                val pending = session.pendingSendMoney
                                val selectedRecipient = (0 until sendRecipients.length())
                                    .map { sendRecipients.getJSONObject(it) }
                                    .firstOrNull { it.optString("id") == sendRecipient }
                                if (pending == null) {
                                    OutlinedTextField(sendAmount, { sendAmount = it.take(10) }, enabled = !busy,
                                        label = { Text(t("Amount (AED)", "পরিমাণ (AED)")) },
                                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.fillMaxWidth())
                                    if (sendRecipients.length() == 0) Text(t("Add a recipient first.", "প্রথমে একজন প্রাপক যোগ করুন।"))
                                    for (i in 0 until sendRecipients.length()) {
                                        val recipient = sendRecipients.getJSONObject(i)
                                        val id = recipient.getString("id")
                                        Row {
                                            RadioButton(enabled = !busy, selected = sendRecipient == id, onClick = { sendRecipient = id })
                                            Text(recipient.getString("name") + " · " + recipient.getString("provider"), modifier = Modifier.padding(top = 12.dp))
                                        }
                                    }
                                    Row {
                                        Checkbox(checked = acceptReservation, enabled = !busy, onCheckedChange = { acceptReservation = it })
                                        Text(t("I understand this reserves my balance for review.", "আমি বুঝেছি পর্যালোচনার জন্য আমার ব্যালেন্স সংরক্ষিত হবে।"), modifier = Modifier.padding(top = 12.dp))
                                    }
                                } else {
                                    Text(t("Submission awaiting confirmation. Retry uses the same request; check request history before starting another.", "জমার নিশ্চিতকরণ অপেক্ষমাণ। আবার চেষ্টা করলে একই অনুরোধ পাঠানো হবে; নতুন অনুরোধের আগে ইতিহাস দেখুন।"))
                                    val recipient = (0 until sendRecipients.length()).map { sendRecipients.getJSONObject(it) }
                                        .firstOrNull { it.optString("id") == pending.beneficiaryId }
                                    Text("AED ${pending.amount} · ${recipient?.optString("name") ?: pending.beneficiaryId}")
                                }
                                Button(enabled = !busy && (pending != null || (acceptReservation && AddMoneyDraft.validAmount(sendAmount) && selectedRecipient != null && SendMoneyDraft.validBeneficiary(sendRecipient))), onClick = {
                                    val draft = pending ?: SendMoneyDraft.create(sendAmount, sendRecipient)
                                    try {
                                        pendingStore.save(sendCustomerId, draft)
                                    } catch (_: IllegalStateException) {
                                        notice = t("Could not save this request safely. Nothing was submitted.", "অনুরোধ নিরাপদে সংরক্ষণ করা যায়নি। কিছুই জমা হয়নি।")
                                        return@Button
                                    }
                                    session.pendingSendMoney = draft
                                    call({ api.request("send-money-requests", "POST", draft.payload()) }, onFailure = { error ->
                                        if (error is AccountFailure.Rejected && error.status in listOf(400, 404, 409, 422)) {
                                            try {
                                                pendingStore.clear(sendCustomerId)
                                                session.pendingSendMoney = null
                                                notice = t("Request rejected. Check the recipient, available balance and request history before trying again.", "অনুরোধ গ্রহণ করা হয়নি। আবার চেষ্টা করার আগে প্রাপক, ব্যবহারযোগ্য ব্যালেন্স ও অনুরোধের ইতিহাস দেখুন।")
                                            } catch (_: IllegalStateException) {
                                                notice = t("Could not clear the saved request. Retry the same request.", "সংরক্ষিত অনুরোধ মুছতে পারেনি। একই অনুরোধ আবার পাঠান।")
                                            }
                                        }
                                    }) { response ->
                                        val result = JSONObject(response)
                                        val status = result.getString("status")
                                        val hold = result.getString("holdStatus")
                                        pendingStore.clear(sendCustomerId)
                                        notice = t("Review request: $status. Reservation: $hold. No payout was made.", "পর্যালোচনার অনুরোধ: $status। সংরক্ষণ: $hold। কোনো পেআউট করা হয়নি।")
                                        session.pendingSendMoney = null; sendAmount = ""; sendRecipient = ""; acceptReservation = false
                                        walletAmounts = WalletAmounts(null, null)
                                    }
                                }) { Text(if (pending == null) t("Submit review request", "পর্যালোচনার অনুরোধ জমা দিন") else t("Retry same request", "একই অনুরোধ পুনরায় পাঠান")) }
                                OutlinedButton(enabled = !busy, onClick = {
                                    call({ api.request("send-money-requests") }) { rows = JSONArray(it); page = "SendMoneyHistory" }
                                }) { Text(t("View Send Money requests", "অর্থ পাঠানোর অনুরোধ দেখুন")) }
                                OutlinedButton(enabled = false, onClick = {}) { Text(t("Send money unavailable", "অর্থ পাঠানো অনুপলব্ধ")) }
                                OutlinedButton(enabled = !busy, onClick = {
                                    call({ api.request("beneficiaries") }) { rows = JSONArray(it); page = "Beneficiaries" }
                                }) { Text(t("Manage recipients", "প্রাপক পরিচালনা")) }
                            }
                            "PaymentMethods" -> {
                                Text(t("Payment Methods", "পেমেন্ট পদ্ধতি"), style = MaterialTheme.typography.titleLarge)
                                Text(t("Service not yet available", "সেবাটি এখনও চালু হয়নি"))
                                if (methodsLoaded && paymentMethods.isEmpty()) Text(t("No payment methods available.", "কোনো পেমেন্ট পদ্ধতি পাওয়া যায়নি।"))
                                if (!busy && !methodsLoaded) Text(t("Payment methods could not be loaded.", "পেমেন্ট পদ্ধতি লোড হয়নি।"))
                                OutlinedButton(enabled = !busy, onClick = { loadPaymentMethods() }) { Text(t("Refresh", "আবার লোড করুন")) }
                                paymentMethods.forEach { method ->
                                    Card(Modifier.fillMaxWidth()) {
                                        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                            Text(method.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                                            Text(t("Country", "দেশ") + ": " + method.country)
                                            Text(t("Currency", "মুদ্রা") + ": " + method.currency)
                                            method.logoUrl?.let { logo -> Text(t("Logo URL", "লোগোর ঠিকানা") + ": " + logo, style = MaterialTheme.typography.bodySmall) }
                                            OutlinedButton(enabled = method.enabled, onClick = {}, modifier = Modifier.fillMaxWidth()) {
                                                Text(t("Service not yet available", "সেবাটি এখনও চালু হয়নি"))
                                            }
                                        }
                                    }
                                }
                            }
                            "AddMoneyRequest" -> {
                                Text(t("Add Money Request", "অর্থ যোগ করার অনুরোধ"), style = MaterialTheme.typography.titleLarge)
                                Text(t("Request only. No money moves or wallet credit. Upload a receipt from request history; do not include credentials or identity documents.", "শুধু অনুরোধ। অর্থ লেনদেন বা ওয়ালেটে জমা হবে না। অনুরোধ তালিকা থেকে রসিদ জমা দিন; পেমেন্ট তথ্য বা পরিচয়পত্র দেবেন না।"))
                                OutlinedTextField(addAmount, { addAmount = it.take(10) }, enabled = addPayload == null && !busy, label = { Text("Amount (AED)") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.fillMaxWidth())
                                for (i in 0 until addMethods.length()) {
                                    val method = addMethods.getJSONObject(i)
                                    Row { RadioButton(enabled = addPayload == null && !busy, selected = addMethod == method.getString("id"), onClick = { addMethod = method.getString("id") }); Text(method.getString("name"), modifier = Modifier.padding(top = 12.dp)) }
                                }
                                if (addMethods.length() == 0) Text("No request methods available.")
                                OutlinedTextField(addNote, { addNote = it.take(500) }, enabled = addPayload == null && !busy, label = { Text("Optional note (no sensitive information)") }, modifier = Modifier.fillMaxWidth())
                                if (addPayload != null) Text("Submission awaiting confirmation. Retry sends the same request. Check My Add Money Requests before starting another.")
                                Button(enabled = !busy && (addPayload != null || (AddMoneyDraft.validAmount(addAmount) && addMethod.isNotEmpty())), onClick = {
                                    val payload = addPayload ?: JSONObject().put("amount_aed", addAmount).put("payment_method_id", addMethod).put("note", addNote).put("idempotency_key", addKey).toString().also { addPayload = it }
                                    call({ api.request("add-money-requests", "POST", JSONObject(payload)) }) {
                                        val result = JSONObject(it)
                                        notice = "Request " + result.getString("id") + " • " + result.getString("status") + ". No money moved."
                                        addPayload = null; addKey = UUID.randomUUID().toString(); addAmount = ""; addNote = ""; addMethod = ""; page = "Home"
                                    }
                                }) { Text(if (addPayload == null) "Submit request only" else "Retry same request") }
                                TextButton(enabled = !busy, onClick = { call({ api.request("add-money-requests") }) { requestRows = JSONArray(it); page = "AddMoneyHistory" } }) { Text("My Add Money Requests") }
                            }
                            "AddMoneyHistory" -> {
                                Text(t("My Requests", "আমার অনুরোধ"), style = MaterialTheme.typography.titleLarge)
                                TextButton(enabled = !busy, onClick = {
                                    call({ api.request("send-money-requests") }) { rows = JSONArray(it); page = "SendMoneyHistory" }
                                }) { Text(t("View Send Money requests", "অর্থ পাঠানোর অনুরোধ দেখুন")) }
                                Text("My Add Money Requests", style = MaterialTheme.typography.titleMedium)
                                Text("Review status only. No balance adjustment or payment processing.")
                                OutlinedButton(enabled = !busy, onClick = { call({ api.request("add-money-requests") }) { requestRows = JSONArray(it) } }) { Text("Refresh statuses") }
                                if (requestRows.length() == 0) Text("No requests.")
                                for (i in 0 until requestRows.length()) {
                                    val row = requestRows.getJSONObject(i)
                                    Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(16.dp)) {
                                        Text(row.getString("id")); Text("AED " + row.getString("amount_aed") + " • " + row.getString("status"))
                                        Text(row.optString("payment_method_id")); Text(row.optString("created_at"))
                                        if (row.optString("status") in listOf("pending", "under_review")) {
                                            OutlinedButton(enabled = !busy, onClick = {
                                                receiptRequestId = row.getString("id")
                                                receiptPicker.launch(arrayOf("image/jpeg", "image/png", "application/pdf"))
                                            }) { Text(t("Upload receipt (max 5 MB)", "রসিদ জমা দিন (সর্বোচ্চ ৫ এমবি)")) }
                                        }
                                    } }
                                }
                            }
                            "SendMoneyHistory" -> {
                                Text(t("Send Money requests", "অর্থ পাঠানোর অনুরোধ"), style = MaterialTheme.typography.titleLarge)
                                Text(t("Review only. Payouts are unavailable.", "শুধু পর্যালোচনা। পেআউট উপলব্ধ নয়।"))
                                OutlinedButton(enabled = !busy, onClick = {
                                    call({ api.request("add-money-requests") }) { requestRows = JSONArray(it); page = "AddMoneyHistory" }
                                }) { Text(t("View Add Money requests", "অর্থ যোগ করার অনুরোধ দেখুন")) }
                                OutlinedButton(enabled = !busy, onClick = {
                                    call({ api.request("send-money-requests") }) { rows = JSONArray(it) }
                                }) { Text(t("Refresh", "আবার লোড করুন")) }
                                if (rows.length() == 0) Text(t("No requests.", "কোনো অনুরোধ নেই।"))
                                for (i in 0 until rows.length()) {
                                    val row = rows.getJSONObject(i)
                                    Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(16.dp)) {
                                        Text(row.getString("id"))
                                        Text("AED " + row.getString("amount_aed") + " · " + row.getString("status"))
                                        Text(t("Reservation", "সংরক্ষণ") + ": " + row.getString("hold_status"))
                                    } }
                                }
                            }
                            "Profile" -> {
                                Field(name, { name = it }, t("Full name", "পুরো নাম"))
                                Button(enabled = !busy && name.isNotBlank(), onClick = {
                                    val payload = JSONObject().put("name",name)
                                    call({ api.request("me","PATCH",payload) }) { notice = t("Profile updated.", "প্রোফাইল আপডেট হয়েছে।") }
                                }) { Text(t("Save profile", "প্রোফাইল সংরক্ষণ")) }
                            }
                            "Beneficiaries" -> {
                                Text(t("Manage recipients", "প্রাপক পরিচালনা"), style = MaterialTheme.typography.titleLarge)
                                listOf("bKash","Nagad","Rocket","Upay","Bank").forEach { value ->
                                    Row { RadioButton(selected = provider == value, onClick = { provider = value }); Text(if (value == "Bank") t("Bank", "ব্যাংক") else value, modifier = Modifier.padding(top=12.dp)) }
                                }
                                Field(name, { name = it }, t("Recipient name", "প্রাপকের নাম"))
                                Field(account, { account = it.take(40) }, t("Account number", "অ্যাকাউন্ট নম্বর"))
                                if(provider == "Bank") Field(bank, { bank = it }, t("Bank name", "ব্যাংকের নাম"))
                                Button(enabled = !busy && name.isNotBlank() && account.length >= 6 && (provider != "Bank" || bank.isNotBlank()), onClick = {
                                    val payload = JSONObject().put("provider",provider).put("name",name).put("account",account).put("bank",bank)
                                    call({ api.request("beneficiaries","POST",payload); api.request("beneficiaries") }) { rows=JSONArray(it); name=""; account=""; bank="" }
                                }) { Text(t("Save beneficiary", "প্রাপক সংরক্ষণ")) }
                                for(i in 0 until rows.length()) {
                                    val row=rows.getJSONObject(i)
                                    Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(16.dp)) {
                                        Text(row.optString("name") + " • " + row.optString("provider"))
                                        TextButton(enabled = !busy, onClick = {
                                            val id=row.getString("id")
                                            call({ api.request("beneficiaries/$id","DELETE"); api.request("beneficiaries") }) { rows=JSONArray(it) }
                                        }) { Text(t("Remove", "মুছুন")) }
                                    } }
                                }
                            }
                            "History" -> {
                                Text(t("Transactions", "লেনদেন"), style = MaterialTheme.typography.titleLarge)
                                if(rows.length()==0) Text(t("No transactions.", "কোনো লেনদেন নেই।"))
                                for(i in 0 until rows.length()) {
                                    val row = rows.getJSONObject(i)
                                    Text(row.getString("id") + " • " + row.getString("status"))
                                }
                            }
                            "Support" -> {
                                Text(t("Contact support", "সহায়তা নিন"), style = MaterialTheme.typography.titleLarge)
                                Text(t("Do not include passwords, account numbers or identity documents.", "পাসওয়ার্ড, অ্যাকাউন্ট নম্বর বা পরিচয়পত্র দেবেন না।"))
                                Field(subject, { subject=it }, t("Subject", "বিষয়"))
                                OutlinedTextField(message,{ message=it.take(2000) },label={Text(t("Message", "বার্তা"))},modifier=Modifier.fillMaxWidth())
                                Button(enabled=!busy && subject.isNotBlank() && message.isNotBlank(),onClick={
                                    val payload=JSONObject().put("subject",subject).put("message",message)
                                    call({ api.request("support","POST",payload); api.request("support") }) { rows=JSONArray(it); subject=""; message="" }
                                }) { Text(t("Submit ticket", "টিকিট জমা দিন")) }
                                for(i in 0 until rows.length()) {
                                    val row=rows.getJSONObject(i)
                                    Text(row.optString("subject") + " • " + when(row.optString("status")) { "closed" -> t("Closed","বন্ধ"); "in_progress" -> t("In progress","চলমান"); else -> t("Open","খোলা") })
                                }
                            }
                        }
                    }
                    Spacer(Modifier.height(24.dp))
                }
            }
        }
    }
}
@Composable private fun Field(value:String, change:(String)->Unit, title:String) {
    OutlinedTextField(value, { change(it.take(120)) }, label={Text(title)}, singleLine=true, modifier=Modifier.fillMaxWidth())
}
