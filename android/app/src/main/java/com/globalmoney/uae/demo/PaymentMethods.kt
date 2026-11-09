package com.globalmoney.uae.demo

import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import org.json.JSONTokener
import java.io.Reader
import java.net.URI

/** Display metadata only: provider flags never grant permission to move money. */
internal data class PaymentMethod(
    val name: String, val country: String, val currency: String, val logoUrl: String?
) {
    val enabled: Boolean get() = false
}

internal object PaymentMethods {
    const val MAX_RESPONSE_CHARS = 512 * 1024
    fun readLimited(reader: Reader): String {
        val output = StringBuilder()
        val buffer = CharArray(4096)
        while (true) {
            val count = reader.read(buffer)
            if (count < 0) return output.toString()
            if (output.length + count > MAX_RESPONSE_CHARS) throw JSONException("Payment methods response too large")
            output.append(buffer, 0, count)
        }
    }
    fun parse(json: String): List<PaymentMethod> {
        if (json.length > MAX_RESPONSE_CHARS) throw JSONException("Payment methods response too large")
        val parser = JSONTokener(json)
        val array = parser.nextValue() as? JSONArray ?: throw JSONException("Expected payment methods array")
        if (parser.nextClean() != '\u0000' || array.length() > 200) throw JSONException("Invalid payment methods response")
        return (0 until array.length()).map { index ->
            val row = array.opt(index) as? JSONObject ?: throw JSONException("Expected payment method object")
            fun field(key: String, max: Int): String {
                val value = row.opt(key) as? String ?: throw JSONException("Invalid payment method field")
                return value.trim().also { if (it.isEmpty() || it.length > max) throw JSONException("Invalid payment method field") }
            }
            val name = field("name", 120)
            val country = field("country", 2)
            val currency = field("currency", 3)
            if (!country.matches(Regex("[A-Z]{2}")) || !currency.matches(Regex("[A-Z]{3}")))
                throw JSONException("Invalid country or currency")
            // Logo metadata is never opened or fetched. Credentials never leave AccountApi.
            val logo = (row.opt("logo_url") as? String)?.trim()?.takeIf { value ->
                value.length <= 2048 && runCatching {
                    val uri = URI(value)
                    uri.scheme == "https" && !uri.host.isNullOrEmpty() && uri.userInfo == null
                }.getOrDefault(false)
            }
            PaymentMethod(name, country, currency, logo)
        }
    }
}
