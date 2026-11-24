package com.globalmoney.uae.demo

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.ui.platform.LocalContext
import android.util.Base64
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors
import java.util.UUID

private val Emerald = Color(0xFFB7192D)
private val Navy = Color(0xFF31171D)
private val Gold = Color(0xFFFFE8EC)
private val Palette = lightColorScheme(primary = Emerald, secondary = Navy, tertiary = Gold,
    background = Color(0xFFFFF8F9), surface = Color.White, onSurface = Navy, onBackground = Navy)

class MainActivity : ComponentActivity() {
    private val api = AccountApi()
    private val executor = Executors.newSingleThreadExecutor()
    private val handler = Handler(Looper.getMainLooper())
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        setContent { PremiumApp(api) { work, done ->
            executor.execute {
                val result = runCatching(work)
                handler.post { if (!isDestroyed) done(result) }
            }
        } }
    }
    override fun onDestroy() {
        api.token = null
        executor.shutdownNow()
        handler.removeCallbacksAndMessages(null)
        super.onDestroy()
    }
}

@Composable
private fun PremiumApp(api: AccountApi, run: (() -> String, (Result<String>) -> Unit) -> Unit) {
    var bn by rememberSaveable { mutableStateOf(false) }
    fun t(en: String, bengali: String) = if (bn) bengali else en
    var signedIn by remember { mutableStateOf(false) }
    var page by rememberSaveable { mutableStateOf("Home") }
    var register by remember { mutableStateOf(false) }
    var email by remember { mutableStateOf("") }
    var signInIdentifier by remember { mutableStateOf("") }
    var registrationPhone by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
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
    var busy by remember { mutableStateOf(false) }
    var availableBalance by remember { mutableStateOf("—") }
    var heldBalance by remember { mutableStateOf("—") }
    var historyFilter by remember { mutableStateOf("all") }
    var configuredFees by remember { mutableStateOf<Map<String,String>>(emptyMap()) }
    var sendAmount by remember { mutableStateOf("") }
    var sendBeneficiary by remember { mutableStateOf("") }
    var sendKey by remember { mutableStateOf(UUID.randomUUID().toString()) }
    var sendPayload by remember { mutableStateOf<String?>(null) }
    var receiptRequest by remember { mutableStateOf("") }
    val context = LocalContext.current
    var notice by remember { mutableStateOf("") }
    fun call(work: () -> String, done: (String) -> Unit = {}) {
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
                        t("Session expired. Please sign in again.", "সেশনের মেয়াদ শেষ। আবার লগইন করুন।")

                    is AccountFailure.Unavailable ->
                        t("Account service temporarily unavailable.", "অ্যাকাউন্ট সেবা সাময়িক অনুপলব্ধ।")

                    is AccountFailure.Rejected -> when (error.status) {
                        400 -> t("Check your account details and password.", "অ্যাকাউন্টের তথ্য ও পাসওয়ার্ড পরীক্ষা করুন।")
                        401 -> t("Sign-in details were not accepted. Check your email or mobile number and password.", "লগইনের তথ্য গ্রহণ করা হয়নি। ইমেইল বা মোবাইল নম্বর ও পাসওয়ার্ড মিলিয়ে দেখুন।")
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
                if (page == "SendMoneyRequest" && error is AccountFailure.Rejected && error.status in listOf(400, 404, 409)) {
                    sendPayload = null; sendKey = UUID.randomUUID().toString()
                }
                if (api.token == null && signedIn) {
                    signedIn = false
                    paymentMethods = emptyList()
                    methodsLoaded = false
                    rows = JSONArray()
                    name = ""
                    account = ""
                    bank = ""
                    subject = ""
                    message = ""
                }
            }
        }
    }
    val receiptPicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null && receiptRequest.isNotEmpty() && signedIn) {
            val requestId = receiptRequest
            call({
                val media = context.contentResolver.getType(uri)
                require(media == "image/png" || media == "image/jpeg") { "PNG or JPEG receipt required" }
                val bytes = context.contentResolver.openInputStream(uri)?.use { input ->
                    val output = java.io.ByteArrayOutputStream()
                    val buffer = ByteArray(8192)
                    while (true) {
                        val count = input.read(buffer)
                        if (count < 0) break
                        require(output.size() + count <= 1000000) { "Receipt must be under 1 MB" }
                        output.write(buffer, 0, count)
                    }
                    output.toByteArray() }
                    ?: throw IllegalArgumentException("Cannot read receipt")
                require(bytes.size in 8..1000000) { "Receipt must be under 1 MB" }
                api.request("add-money-requests/$requestId/receipts", "POST", JSONObject()
                    .put("media_type", media).put("content_base64", Base64.encodeToString(bytes, Base64.NO_WRAP)))
            }) { notice = "Receipt submitted for review. No payment verification or wallet credit." }
        }
        receiptRequest = ""
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
        availableBalance = "—"; heldBalance = "—"
        call({ api.request("wallet") }) { response ->
            val wallet = JSONObject(response)
            availableBalance = if (wallet.isNull("available")) "—" else wallet.getString("available")
            heldBalance = if (wallet.isNull("held")) "—" else wallet.getString("held")
        }
    }
    LaunchedEffect(signedIn) {
        if (!signedIn) { availableBalance = "—"; heldBalance = "—"; historyFilter = "all"; configuredFees = emptyMap(); sendPayload = null; sendKey = UUID.randomUUID().toString(); sendAmount = ""; sendBeneficiary = ""; receiptRequest = ""; addPayload = null; addKey = UUID.randomUUID().toString(); addAmount = ""; addNote = ""; addMethod = ""; addMethods = JSONArray(); requestRows = JSONArray() } else loadWallet()
    }
    MaterialTheme(colorScheme = Palette) {
        Scaffold { insets ->
            Column(Modifier.fillMaxSize().padding(insets)) {
                Row(Modifier.fillMaxWidth().background(Emerald).padding(16.dp)) {
                    Text("GLOBAL MONEY UAE", color = Color.White, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                    TextButton(onClick = { bn = !bn }) { Text(if (bn) "English" else "বাংলা", color = Gold) }
                }
                Column(Modifier.verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    Text(t("Your connection to home", "দেশের সাথে আপনার সংযোগ"), style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                    Text(t("Service not yet available.", "সেবাটি এখনও চালু হয়নি।"), color = Emerald)
                    if (busy) LinearProgressIndicator(Modifier.fillMaxWidth())
                    if (notice.isNotEmpty()) Text(notice, color = MaterialTheme.colorScheme.error)
                    if (!signedIn) {
                        Text(t(if (register) "Create account" else "Sign in", if (register) "অ্যাকাউন্ট তৈরি করুন" else "লগইন করুন"), style = MaterialTheme.typography.titleLarge)
                        val validPhone = Regex("""\+[1-9][0-9]{6,14}""").matches(registrationPhone.trim())
                        if (register) {
                            Field(name, { name = it.take(120) }, t("Full name", "পুরো নাম"))
                            OutlinedTextField(
                                registrationPhone, { registrationPhone = it.take(16) },
                                label = { Text(t("Mobile number", "মোবাইল নম্বর")) },
                                supportingText = { Text(t("Include the country code (e.g. +971 or +880).", "দেশের কোডসহ লিখুন (যেমন +971 বা +880)।")) },
                                singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                                modifier = Modifier.fillMaxWidth()
                            )
                            OutlinedTextField(
                                email, { email = it.take(254) }, label = { Text(t("Email (optional)", "ইমেইল (ঐচ্ছিক)")) },
                                singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                                modifier = Modifier.fillMaxWidth()
                            )
                        } else {
                            OutlinedTextField(
                                signInIdentifier, { signInIdentifier = it.take(254) },
                                label = { Text(t("Email or mobile number", "ইমেইল বা মোবাইল নম্বর")) },
                                singleLine = true, modifier = Modifier.fillMaxWidth()
                            )
                        }
                        OutlinedTextField(password, { password = it.take(128) }, label = { Text(t("Password (12–128 characters)", "পাসওয়ার্ড (১২–১২৮ অক্ষর)")) }, visualTransformation = PasswordVisualTransformation(), singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password), modifier = Modifier.fillMaxWidth())
                        if (password.isNotEmpty() && password.length < 12) {
                            Text(t("Enter at least 12 characters to continue.", "এগোতে কমপক্ষে ১২ অক্ষরের পাসওয়ার্ড লিখুন।"), color = MaterialTheme.colorScheme.error)
                        }
                        if (register) {
                            val mismatch = confirmPassword.isNotEmpty() && confirmPassword != password
                            OutlinedTextField(
                                confirmPassword, { confirmPassword = it.take(128) },
                                label = { Text(t("Confirm password", "পাসওয়ার্ড আবার লিখুন")) },
                                isError = mismatch, visualTransformation = PasswordVisualTransformation(),
                                singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                                modifier = Modifier.fillMaxWidth()
                            )
                            if (mismatch) Text(t("Passwords do not match.", "দুই পাসওয়ার্ড মেলেনি।"), color = MaterialTheme.colorScheme.error)
                            Text(t("Identity documents", "পরিচয়পত্র জমা"), style = MaterialTheme.typography.titleMedium)
                            Text(t("Document submission is currently unavailable. You can register without uploading files.", "পরিচয়পত্র জমা এখন বন্ধ। ছবি ছাড়াই নিবন্ধন করতে পারবেন।"))
                            listOf(
                                t("Upload passport", "পাসপোর্ট আপলোড"),
                                t("Upload UAE ID card", "UAE ID কার্ড আপলোড"),
                                t("Upload selfie or image", "সেলফি বা ছবি আপলোড")
                            ).forEach { label ->
                                OutlinedButton(onClick = {}, enabled = false, modifier = Modifier.fillMaxWidth()) { Text(label) }
                            }
                        }
                        val entryReady = if (register) name.isNotBlank() && validPhone && confirmPassword == password
                            else signInIdentifier.isNotBlank()
                        Button(enabled = !busy && entryReady && password.length >= 12, onClick = {
                            val creating = register
                            val submittedPhone = registrationPhone.trim()
                            val identifier = signInIdentifier.trim()
                            val payload = JSONObject().put("password", password)
                            val path = if (creating) {
                                payload.put("name", name.trim()).put("phone_number", submittedPhone)
                                    .put("confirm_password", confirmPassword)
                                if (email.isNotBlank()) payload.put("email", email.trim())
                                "auth/register-mobile"
                            } else {
                                payload.put(if (identifier.startsWith("+")) "phone_number" else "email", identifier)
                                "auth/login"
                            }
                            password = ""
                            confirmPassword = ""
                            call({ api.request(path, "POST", payload) }) { response ->
                                if (creating) {
                                    register = false
                                    signInIdentifier = submittedPhone
                                    registrationPhone = ""
                                    email = ""
                                    name = ""
                                    notice = t("Please sign in to your account.", "আপনার অ্যাকাউন্টে লগইন করুন।")
                                } else {
                                    api.token = JSONObject(response).getString("token")
                                    signedIn = true
                                    signInIdentifier = ""
                                    page = "Home"
                                }
                            }
                        }, modifier = Modifier.fillMaxWidth()) {
                            Text(t(if (register) "Register" else "Sign in", if (register) "নিবন্ধন" else "লগইন"))
                        }
                        TextButton(enabled = !busy, onClick = {
                            register = !register
                            password = ""
                            confirmPassword = ""
                            notice = ""
                        }) {
                            Text(t(if (register) "Already have an account? Sign in" else "Create account", if (register) "লগইন করুন" else "অ্যাকাউন্ট তৈরি করুন"))
                        }
                    } else {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            TextButton(enabled = !busy, onClick = { page = "Home"; rows = JSONArray(); loadWallet() }) { Text(t("Home", "হোম")) }
                            TextButton(enabled = !busy, onClick = { call({ api.request("me") }) { name = JSONObject(it).getString("name"); page = "Profile" } }) { Text(t("Profile", "প্রোফাইল")) }
                            TextButton(enabled = !busy, onClick = {
                                call({ api.request("auth/logout", "POST", JSONObject()) }) {
                                    api.token = null; signedIn = false; paymentMethods = emptyList(); methodsLoaded = false; rows = JSONArray(); name = ""; account = ""; bank = ""; subject = ""; message = ""
                                }
                            }) { Text(t("Logout", "লগআউট")) }
                        }
                        when(page) {
                            "Home" -> {
                                Card(colors = CardDefaults.cardColors(containerColor = Emerald), modifier = Modifier.fillMaxWidth()) {
                                    Column(Modifier.padding(24.dp)) {
                                        Text(t("Available balance • AED", "ব্যালেন্স • AED"), color = Color.White)
                                        Text(availableBalance, style = MaterialTheme.typography.displayMedium, color = Color.White)
                                        Text(t("Reserved • AED ", "সংরক্ষিত • AED ") + heldBalance, color = Color.White)
                                        Text(t("From your authenticated ledger", "আপনার সুরক্ষিত লেজার থেকে"), color = Color.White)
                                    }
                                }
                                OutlinedButton(enabled = !busy, onClick = { loadWallet() }) { Text(t("Refresh wallet", "ওয়ালেট রিফ্রেশ")) }
                                Text(t("AED / BDT rate: —", "AED / BDT রেট: —"))
                                listOf("BOTIM MONEY" to "BOTIM MONEY", "Send money" to "অর্থ পাঠান").forEach { (en,bengali) ->
                                    OutlinedButton(onClick = {}, enabled = false, modifier = Modifier.fillMaxWidth()) { Text(t(en,bengali)) }
                                }
                                Button(enabled = !busy, modifier = Modifier.fillMaxWidth(), onClick = {
                                    call({ JSONObject().put("recipients",JSONArray(api.request("beneficiaries"))).put("options",JSONObject(api.request("request-options"))).toString() }) {
                                        val data = JSONObject(it); rows = data.getJSONArray("recipients")
                                        val fees = data.getJSONObject("options").getJSONArray("fees")
                                        configuredFees = (0 until fees.length()).associate { i -> val fee = fees.getJSONObject(i); fee.getString("provider") to fee.getString("flat_aed") }
                                        page = "SendMoneyRequest"
                                    }
                                }) { Text("Send Money request only") }
                                Button(enabled = !busy, modifier = Modifier.fillMaxWidth(), onClick = {
                                    call({ api.request("send-money-requests") }) { rows = JSONArray(it); page = "SendMoneyHistory" }
                                }) { Text("My Send Money requests") }
                                Button(enabled = !busy, modifier = Modifier.fillMaxWidth(), onClick = {
                                    call({ api.request("add-money-request-methods") }) { addMethods = JSONArray(it); page = "AddMoneyRequest" }
                                }) { Text(t("Add Money Request", "অর্থ যোগ করার অনুরোধ")) }
                                Button(enabled = !busy, modifier = Modifier.fillMaxWidth(), onClick = {
                                    call({ api.request("add-money-requests") }) { requestRows = JSONArray(it); page = "AddMoneyHistory" }
                                }) { Text(t("My Add Money Requests", "আমার অনুরোধসমূহ")) }
                                Button(enabled = !busy, onClick = { call({ api.request("payment-accounts") }) { rows = JSONArray(it); page = "PaymentAccounts" } }, modifier = Modifier.fillMaxWidth()) { Text(t("Payment account directory", "পেমেন্ট অ্যাকাউন্ট তালিকা")) }
                                Button(enabled = !busy, onClick = { loadPaymentMethods() }, modifier = Modifier.fillMaxWidth()) { Text(t("Payment Methods", "পেমেন্ট পদ্ধতি")) }
                                Button(enabled = !busy, onClick = { call({ api.request("beneficiaries") }) { rows = JSONArray(it); page = "Beneficiaries" } }, modifier = Modifier.fillMaxWidth()) { Text(t("Beneficiaries", "প্রাপক")) }
                                Button(enabled = !busy, onClick = { call({ api.request("request-history") }) { rows = JSONArray(it); historyFilter = "all"; page = "RequestHistory" } }, modifier = Modifier.fillMaxWidth()) { Text(t("Request history", "অনুরোধের ইতিহাস")) }
                                Button(enabled = !busy, onClick = { call({ api.request("transactions") }) { rows = JSONArray(it); page = "History" } }, modifier = Modifier.fillMaxWidth()) { Text(t("Transactions", "লেনদেন")) }
                                Button(enabled = !busy, onClick = { call({ api.request("support") }) { rows = JSONArray(it); page = "Support" } }, modifier = Modifier.fillMaxWidth()) { Text(t("Support", "সহায়তা")) }
                                Text(t("Identity verification is not available. Do not submit identity documents.", "পরিচয় যাচাই চালু হয়নি। পরিচয়পত্র জমা দেবেন না।"))
                            }
                            "SendMoneyRequest" -> {
                                Text("Send Money request only", style = MaterialTheme.typography.titleLarge)
                                Text("No payout is executed. If a funded wallet exists, amount plus configured fee is reserved until rejection or cancellation. Approval does not mean settlement.")
                                Field(sendAmount, { if (sendPayload == null) sendAmount = it.take(10) }, "Requested AED amount")
                                if (sendPayload == null) {
                                    Text(t("Add recipient", "প্রাপক যোগ করুন"), style = MaterialTheme.typography.titleMedium)
                                    listOf("bKash", "Nagad", "Rocket", "Upay", "Bank").forEach { value ->
                                        Row { RadioButton(selected = provider == value, onClick = { provider = value }); Text(value) }
                                    }
                                    Field(name, { name = it }, t("Recipient name", "প্রাপকের নাম"))
                                    Field(account, { account = it.take(40) }, t("Recipient number", "প্রাপকের নম্বর"))
                                    if (provider == "Bank") Field(bank, { bank = it }, t("Bank name", "ব্যাংকের নাম"))
                                    OutlinedButton(enabled = !busy && name.isNotBlank() && account.isNotBlank() && (provider != "Bank" || bank.isNotBlank()), onClick = {
                                        val payload = JSONObject().put("name",name).put("provider",provider).put("account",account).put("bank",bank)
                                        call({ val saved = JSONObject(api.request("beneficiaries","POST",payload)); JSONObject().put("recipient",saved.getString("id")).put("rows",JSONArray(api.request("beneficiaries"))).toString() }) {
                                            val data = JSONObject(it); sendBeneficiary = data.getString("recipient"); rows = data.getJSONArray("rows"); name = ""; account = ""; bank = ""
                                        }
                                    }) { Text(t("Save recipient", "প্রাপক সংরক্ষণ")) }
                                }
                                for (i in 0 until rows.length()) {
                                    val recipient = rows.getJSONObject(i)
                                    Row {
                                        RadioButton(selected = sendBeneficiary == recipient.optString("id"), enabled = sendPayload == null,
                                            onClick = { sendBeneficiary = recipient.optString("id") })
                                        Text(recipient.optString("name"))
                                    }
                                }
                                if (rows.length() == 0) Text("Add a beneficiary before submitting a request.")
                                val selectedProvider = (0 until rows.length()).map { rows.getJSONObject(it) }.firstOrNull { it.optString("id") == sendBeneficiary }?.optString("provider")
                                val confirmedFee = configuredFees[selectedProvider] ?: "0.00"
                                Text("Configured fee • AED " + confirmedFee + ". This amount is included in any funded wallet reservation.")
                                Button(enabled = !busy && sendBeneficiary.isNotEmpty() && AddMoneyDraft.validAmount(sendAmount), onClick = {
                                    val payload = sendPayload ?: JSONObject().put("amount_aed",sendAmount).put("expected_fee_aed",confirmedFee).put("beneficiary_id",sendBeneficiary)
                                        .put("idempotency_key",sendKey).toString().also { sendPayload = it }
                                    call({ api.request("send-money-requests","POST",JSONObject(payload)) }) {
                                        sendPayload = null; sendKey = UUID.randomUUID().toString(); sendAmount = ""; sendBeneficiary = ""
                                        page = "Home"; loadWallet(); notice = "Request submitted. No payout was executed."
                                    }
                                }) { Text(if (sendPayload == null) "Submit request" else "Retry same request") }
                            }
                            "SendMoneyHistory" -> {
                                Text("My Send Money requests")
                                Text("Requests only. No real transfers.")
                                for (i in 0 until rows.length()) {
                                    val row = rows.getJSONObject(i)
                                    Text(row.optString("id") + " • AED " + row.optString("amount_aed") + " • " + row.optString("status"))
                                }
                            }
                            "PaymentAccounts" -> {
                                Text(t("Payment account directory", "পেমেন্ট অ্যাকাউন্ট তালিকা"), style = MaterialTheme.typography.titleLarge)
                                Text("Reference only. Payments and wallet credits are disabled. Do not transfer funds.")
                                OutlinedButton(enabled = !busy, onClick = { rows = JSONArray(); call({ api.request("payment-accounts") }) { rows = JSONArray(it) } }) { Text("Refresh") }
                                if (rows.length() == 0) Text("No payment accounts available.")
                                for (i in 0 until rows.length()) {
                                    val row = rows.getJSONObject(i)
                                    Card(Modifier.fillMaxWidth()) {
                                        Column(Modifier.padding(20.dp)) {
                                            for (key in listOf("payment_method_id", "account_holder", "account_number", "iban", "instructions")) {
                                                if (!row.isNull(key)) Text(key + ": " + row.optString(key))
                                            }
                                        }
                                    }
                                }
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
                                Text(t("Request only. No money moves or wallet credit. Do not include receipts, payment credentials or identity documents.", "শুধু অনুরোধ। অর্থ লেনদেন বা ওয়ালেটে জমা হবে না। রসিদ বা পরিচয়পত্র দেবেন না।"))
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
                                Text("My Add Money Requests", style = MaterialTheme.typography.titleLarge)
                                Text("Review status only. No balance adjustment or payment processing.")
                                OutlinedButton(enabled = !busy, onClick = { call({ api.request("add-money-requests") }) { requestRows = JSONArray(it) } }) { Text("Refresh statuses") }
                                if (requestRows.length() == 0) Text("No requests.")
                                for (i in 0 until requestRows.length()) {
                                    val row = requestRows.getJSONObject(i)
                                    Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(16.dp)) {
                                        Text(row.getString("id")); Text("AED " + row.getString("amount_aed") + " • " + row.getString("status"))
                                        Text(row.optString("payment_method_id")); Text(row.optString("created_at"))
                                        if (row.optString("status") in listOf("pending", "under_review")) {
                                            TextButton(enabled = !busy, onClick = { receiptRequest = row.getString("id"); receiptPicker.launch("image/*") }) { Text("Upload PNG/JPEG payment receipt (1 MB). No identity documents.") }
                                        }
                                    } }
                                }
                            }
                            "RequestHistory" -> {
                                Text(t("Request history", "অনুরোধের ইতিহাস"), style = MaterialTheme.typography.titleLarge)
                                Text("Review states only. Successful requires independently verified settlement and cannot be entered manually.")
                                listOf("all", "pending", "processing", "approved", "rejected", "successful").forEach { status ->
                                    FilterChip(selected = historyFilter == status, onClick = { historyFilter = status }, label = { Text(status.replaceFirstChar { it.uppercase() }) })
                                }
                                val visible = (0 until rows.length()).map { rows.getJSONObject(it) }.filter { historyFilter == "all" || it.optString("display_status") == historyFilter }
                                if (visible.isEmpty()) Text("No matching records. No unverified settlement is shown as Successful.")
                                visible.forEach { row ->
                                    Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(16.dp)) {
                                        Text(row.optString("request_type").replace('_',' '), fontWeight = FontWeight.Bold)
                                        Text("AED " + row.optString("amount_aed") + " • " + row.optString("display_status"))
                                        Text("Configured fee • AED " + row.optString("fee_aed"))
                                        Text(row.optString("created_at"))
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
                                for(i in 0 until rows.length()) Text(rows.getJSONObject(i).optString("id") + " • " + t("Under review / unavailable", "পর্যালোচনাধীন / অনুপলব্ধ"))
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
