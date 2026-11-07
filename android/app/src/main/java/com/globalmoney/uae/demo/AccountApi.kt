package com.globalmoney.uae.demo

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** HTTPS only. Tokens are held in process memory and never written to preferences or logs. */
internal class AccountApi(
    private val baseUrl: String = BuildConfig.API_BASE_URL,
    private val openConnection: (URL) -> HttpURLConnection = { it.openConnection() as HttpURLConnection }
) {
    @Volatile var token: String? = null
    fun paymentMethods(): String {
        check(!token.isNullOrBlank()) { "Sign in required" }
        return request("payment-methods")
    }
    fun request(path: String, method: String = "GET", data: JSONObject? = null): String {
        check(baseUrl.startsWith("https://")) { "Account service is not configured." }
        val connection = openConnection(URL(baseUrl + "/v1/" + path))
        try {
            connection.connectTimeout = 10000
            connection.readTimeout = 10000
            connection.instanceFollowRedirects = false
            connection.requestMethod = method
            connection.setRequestProperty("Accept", "application/json")
            token?.let { connection.setRequestProperty("Authorization", "Bearer $it") }
            if (data != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                connection.outputStream.use { it.write(data.toString().toByteArray(Charsets.UTF_8)) }
            }
            val status = connection.responseCode
            if (status == 401) token = null
            if (status !in 200..299) throw IllegalStateException("Request failed ($status).")
            return connection.inputStream.bufferedReader(Charsets.UTF_8).use {
                if (path == "payment-methods") PaymentMethods.readLimited(it) else it.readText()
            }
        } finally { connection.disconnect() }
    }
}
