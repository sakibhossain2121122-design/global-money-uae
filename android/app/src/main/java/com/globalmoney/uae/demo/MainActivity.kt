package com.globalmoney.uae.demo

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.WindowManager
import androidx.activity.ComponentActivity
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
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors

private val Emerald = Color(0xFF007F60)
private val Navy = Color(0xFF102A43)
private val Gold = Color(0xFFE8BC56)
private val Palette = lightColorScheme(primary = Emerald, secondary = Navy, tertiary = Gold,
    background = Color(0xFFF3F7F6), surface = Color.White, onSurface = Navy, onBackground = Navy)

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
    var busy by remember { mutableStateOf(false) }
    var notice by remember { mutableStateOf("") }
    var requestAmount by remember { mutableStateOf("") }
    var selectedMethod by remember { mutableStateOf("") }
    var selectedBeneficiary by remember { mutableStateOf("") }
    var requestKey by remember {
        mutableStateOf(java.util.UUID.randomUUID().toString())
    }

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
                        400 -> t("Check your registration details and password.", "নিবন্ধনের তথ্য ও পাসওয়ার্ড পরীক্ষা করুন।")
                        409 -> t("Account request could not be accepted.", "অ্যাকাউন্টের অনুরোধ গ্রহণ করা যায়নি।")
                        429 -> t("Too many attempts. Try again later.", "অনেকবার চেষ্টা হয়েছে। পরে আবার চেষ্টা করুন।")
                        else -> t("Request rejected. Please check your details.", "অনুরোধ গ্রহণ করা হয়নি। তথ্য পরীক্ষা করুন।")
                    }

                    else ->
                        t("Unable to complete request.", "অনুরোধ সম্পন্ন হয়নি।")
                }

                if (api.token == null && signedIn) {
                    requestAmount = ""
                    selectedMethod = ""
                    selectedBeneficiary = ""
                    requestKey = java.util.UUID.randomUUID().toString()
                    page = "Home"
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
    fun loadPaymentMethods() {
        // Clear prior results before each read, including retries, so errors never show stale metadata.
        page = "PaymentMethods"; paymentMethods = emptyList(); methodsLoaded = false
        call({ api.paymentMethods() }) { response ->
            paymentMethods = PaymentMethods.parse(response)
            methodsLoaded = true
        }
    }
    MaterialTheme(colorScheme = Palette) {
        Scaffold { insets ->
            Column(Modifier.fillMaxSize().padding(insets)) {
                Row(Modifier.fillMaxWidth().background(Navy).padding(16.dp)) {
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
                            TextButton(enabled = !busy, onClick = { page = "Home"; rows = JSONArray() }) { Text(t("Home", "হোম")) }
                            TextButton(enabled = !busy, onClick = { call({ api.request("me") }) { name = JSONObject(it).getString("name"); page = "Profile" } }) { Text(t("Profile", "প্রোফাইল")) }
                            TextButton(enabled = !busy, onClick = {
                                call({ api.request("auth/logout", "POST", JSONObject()) }) {
                                    requestAmount = ""
                                    selectedMethod = ""
                                    selectedBeneficiary = ""
                                    requestKey = java.util.UUID.randomUUID().toString()
                                    page = "Home"
                                    api.token = null; signedIn = false; paymentMethods = emptyList(); methodsLoaded = false; rows = JSONArray(); name = ""; account = ""; bank = ""; subject = ""; message = ""
                                }
                            }) { Text(t("Logout", "লগআউট")) }
                        }
                        when(page) {
                            "Home" -> {
                                Card(colors = CardDefaults.cardColors(containerColor = Emerald), modifier = Modifier.fillMaxWidth()) {
                                    Column(Modifier.padding(24.dp)) {
                                        Text(t("Available balance • AED", "ব্যালেন্স • AED"), color = Color.White)
                                        Text("—", style = MaterialTheme.typography.displayMedium, color = Color.White)
                                    }
                                }
                                Text(t("AED / BDT rate: —", "AED / BDT রেট: —"))

Button(
    enabled = !busy,
    onClick = {
        rows = JSONArray()
        page = "AddMoney"
    },
    modifier = Modifier.fillMaxWidth()
) {
    Text(t("Add Money", "অর্থ যোগ করুন"))
}

OutlinedButton(
    enabled = !busy,
    onClick = { loadPaymentMethods() },
    modifier = Modifier.fillMaxWidth()
) {
    Text("BOTIM MONEY")
}

Button(
    enabled = !busy,
    onClick = {
        rows = JSONArray()
        call({ api.request("beneficiaries") }) {
            rows = JSONArray(it)
            page = "SendMoney"
        }
    },
    modifier = Modifier.fillMaxWidth()
) {
    Text(t("Send Money", "অর্থ পাঠান"))
}

Button(enabled = !busy, onClick = { loadPaymentMethods() }, modifier = Modifier.fillMaxWidth()) { Text(t("Payment Methods", "পেমেন্ট পদ্ধতি")) }
                                Button(enabled = !busy, onClick = { call({ api.request("beneficiaries") }) { rows = JSONArray(it); page = "Beneficiaries" } }, modifier = Modifier.fillMaxWidth()) { Text(t("Beneficiaries", "প্রাপক")) }
                                Button(enabled = !busy, onClick = { rows = JSONArray(); call({ api.request("deposit-requests") }) { rows = JSONArray(it); page = "History" } }, modifier = Modifier.fillMaxWidth()) { Text(t("Transactions", "লেনদেন")) }
                                Button(enabled = !busy, onClick = { call({ api.request("support") }) { rows = JSONArray(it); page = "Support" } }, modifier = Modifier.fillMaxWidth()) { Text(t("Support", "সহায়তা")) }
                                Text(t("Identity verification is not available. Do not submit identity documents.", "পরিচয় যাচাই চালু হয়নি। পরিচয়পত্র জমা দেবেন না।"))
                            }

"AddMoney" -> {
    Text(t("Add Money", "অর্থ যোগ করুন"),
        style = MaterialTheme.typography.titleLarge)

    Text(t("Staging only. Do not transfer real money.",
        "শুধু স্টেজিং। প্রকৃত টাকা পাঠাবেন না।"))

    Text(t("Select payment method", "পেমেন্ট পদ্ধতি নির্বাচন করুন"))

    listOf(
        "botim_money" to "BOTIM Money",
        "e_money" to "e& money",
        "adcb" to "ADCB Bank",
        "emirates_nbd" to "Emirates NBD",
        "adib" to "ADIB Bank"
    ).forEach { (id,label) ->
        Row {
            RadioButton(
                selected = selectedMethod == id,
                enabled = !busy,
                onClick = { selectedMethod = id }
            )
            Text(label, modifier = Modifier.padding(top=12.dp))
        }
    }

    Field(requestAmount,
        { requestAmount = it.take(12) },
        t("Amount (AED)", "পরিমাণ (AED)"))

    val amount = requestAmount.toDoubleOrNull()

    Button(
        enabled = !busy &&
            selectedMethod.isNotBlank() &&
            amount != null &&
            amount in 0.01..100000.0,
        onClick = {
            val payload = JSONObject()
                .put("amountAed", amount)
                .put("paymentMethodId", selectedMethod)
                .put("receiptFixtureKey", "synthetic:" + requestKey)
                .put("idempotencyKey", "deposit-" + requestKey)

            call({ api.request("deposit-requests","POST",payload) }) {
                requestAmount = ""
                selectedMethod = ""
                requestKey = java.util.UUID.randomUUID().toString()
                rows = JSONArray()
                page = "History"
                notice = t("Staging request submitted.",
                    "স্টেজিং রিকোয়েস্ট জমা হয়েছে।")
                call({ api.request("deposit-requests") }) { rows = JSONArray(it) }
            }
        },
        modifier = Modifier.fillMaxWidth()
    ) {
        Text(t("Submit Request", "রিকোয়েস্ট জমা দিন"))
    }
}

"SendMoney" -> {
    Text(t("Send Money", "অর্থ পাঠান"),
        style = MaterialTheme.typography.titleLarge)

    Text(t("Staging only. No real funds transferred.",
        "শুধু স্টেজিং। প্রকৃত টাকা পাঠানো হবে না।"))

    Text(t("Select beneficiary", "প্রাপক নির্বাচন করুন"))

    if(rows.length()==0)
        Text(t("No beneficiaries available.",
            "কোনো প্রাপক পাওয়া যায়নি।"))

    for(i in 0 until rows.length()) {
        val row = rows.getJSONObject(i)
        val id = row.optString("id")

        Row {
            RadioButton(
                selected = selectedBeneficiary == id,
                enabled = !busy && id.isNotBlank(),
                onClick = { selectedBeneficiary = id }
            )

            Column(Modifier.padding(top=8.dp)) {
                Text(row.optString("name"))
                Text(row.optString("provider"))
            }
        }
    }

    Field(requestAmount,
        { requestAmount = it.take(12) },
        t("Amount (AED)", "পরিমাণ (AED)"))

    val amount = requestAmount.toDoubleOrNull()

    Button(
        enabled = !busy &&
            selectedBeneficiary.isNotBlank() &&
            amount != null &&
            amount in 0.01..100000.0 &&
            (0 until rows.length()).any {
                rows.getJSONObject(it).optString("id") ==
                    selectedBeneficiary
            },
        onClick = {
            val payload = JSONObject()
                .put("amountAed", amount)
                .put("beneficiaryId", selectedBeneficiary)
                .put("idempotencyKey",
                    "synthetic:" + requestKey)

            call({
                api.request("send-money-requests","POST",payload)
            }) {
                requestAmount = ""
                selectedBeneficiary = ""
                requestKey = java.util.UUID.randomUUID().toString()
                rows = JSONArray()
                page = "History"
                notice = t("Staging request submitted.",
                    "স্টেজিং রিকোয়েস্ট জমা হয়েছে।")
                call({ api.request("send-money-requests") }) { rows = JSONArray(it) }
            }
        },
        modifier = Modifier.fillMaxWidth()
    ) {
        Text(t("Submit Request", "রিকোয়েস্ট জমা দিন"))
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
    Text(t("Transaction History", "লেনদেনের ইতিহাস"),
        style = MaterialTheme.typography.titleLarge)

    Text(t("Test requests only. No real funds transferred.",
        "শুধু পরীক্ষামূলক রিকোয়েস্ট। প্রকৃত টাকা পাঠানো হয়নি।"))

    Button(
        enabled = !busy,
        onClick = {
            rows = JSONArray()
            call({ api.request("deposit-requests") }) {
                rows = JSONArray(it)
            }
        },
        modifier = Modifier.fillMaxWidth()
    ) {
        Text(t("Add Money History", "অর্থ যোগের ইতিহাস"))
    }

    Button(
        enabled = !busy,
        onClick = {
            rows = JSONArray()
            call({ api.request("send-money-requests") }) {
                rows = JSONArray(it)
            }
        },
        modifier = Modifier.fillMaxWidth()
    ) {
        Text(t("Send Money History", "অর্থ পাঠানোর ইতিহাস"))
    }

    if(rows.length()==0)
        Text(t("No requests found.", "কোনো রিকোয়েস্ট নেই।"))

    for(i in 0 until rows.length()) {
        val row = rows.getJSONObject(i)
        val status = row.optString("status")

        Card(Modifier.fillMaxWidth()) {
            Column(
                Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(
                    if(row.has("beneficiary_id"))
                        t("Send Money", "অর্থ পাঠানো")
                    else
                        t("Add Money", "অর্থ যোগ"),
                    fontWeight = FontWeight.Bold
                )

                Text(row.optString("amount_aed", "—") + " AED")

                Text(when(status) {
                    "successful" -> t("Successful (Staging)", "সফল (স্টেজিং)")
                    "rejected" -> t("Rejected", "প্রত্যাখ্যাত")
                    "pending" -> t("Pending", "অপেক্ষমাণ")
                    "under_review" -> t("Under review", "পর্যালোচনাধীন")
                    "cancelled" -> t("Cancelled", "বাতিল")
                    else -> t("Unavailable", "অনুপলব্ধ")
                })

                Text(t("Request ID", "রিকোয়েস্ট আইডি") +
                    ": " + row.optString("id"))

                if(status == "successful" &&
                    row.has("transaction_reference") &&
                    !row.isNull("transaction_reference")) {

                    val trx = row.optString("transaction_reference")
                    val clipboard = LocalClipboardManager.current
                    Text("TRX ID: " + trx)
                    OutlinedButton(onClick = { clipboard.setText(AnnotatedString(trx)) }) { Text("Copy TRX ID") }
                }
            }
        }
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
