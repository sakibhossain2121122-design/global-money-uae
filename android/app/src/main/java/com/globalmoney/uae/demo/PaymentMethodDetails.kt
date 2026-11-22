package com.globalmoney.uae.demo

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.unit.dp
import org.json.JSONObject

@Composable
internal fun PaymentMethodDetails(details: JSONObject, bn: Boolean) {
    fun t(en: String, Bengali: String) = if (bn) Bengali else en
    Text(details.getString("name"), style = MaterialTheme.typography.titleLarge)
    Text(t("Account information only. Payments and wallet credits are disabled. Do not send money.",
        "শুধু অ্যাকাউন্টের তথ্য। পেমেন্ট ও ওয়ালেটে অর্থ জমা বন্ধ। অর্থ পাঠাবেন না।"))
    val accounts = details.getJSONArray("accounts")
    if (accounts.length() == 0) Text(t("No enabled account details available.", "সক্রিয় অ্যাকাউন্টের তথ্য নেই।"))
    for (i in 0 until accounts.length()) {
        val account = accounts.getJSONObject(i)
        OutlinedCard(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("account_holder" to t("Account holder", "অ্যাকাউন্টধারী"),
                    "account_number" to t("Account number", "অ্যাকাউন্ট নম্বর"),
                    "iban" to "IBAN", "instructions" to t("Instructions", "নির্দেশনা")).forEach { (key, label) ->
                    if (!account.isNull(key) && account.optString(key).isNotEmpty()) Text(label + ": " + account.getString(key))
                }
                val payload = account.optString("qr_payload", "").takeIf { !account.isNull("qr_payload") } ?: ""
                val qr = remember(payload) {
                    if (payload.isEmpty() || payload.length > 512) null else runCatching {
                        val matrix = AccountQr.encode(payload)
                        val pixels = IntArray(384 * 384) { p -> if (matrix[p % 384, p / 384]) android.graphics.Color.BLACK else android.graphics.Color.WHITE }
                        Bitmap.createBitmap(pixels, 384, 384, Bitmap.Config.ARGB_8888).asImageBitmap()
                    }.getOrNull()
                }
                if (qr != null) {
                    Text(t("Reference QR only; do not pay", "শুধু তথ্যের QR; পেমেন্ট করবেন না"))
                    Image(qr, contentDescription = t("Admin configured account QR", "অ্যাডমিন নির্ধারিত অ্যাকাউন্টের QR"), modifier = Modifier.size(220.dp))
                }
            }
        }
    }
}
