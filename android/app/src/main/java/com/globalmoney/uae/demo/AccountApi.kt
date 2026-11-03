package com.globalmoney.uae.demo

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** HTTPS only. Tokens are held in process memory and never written to preferences or logs. */
internal class AccountApi {
    @Volatile var token: String? = null
    fun request(path: String, method: String = "GET", data: JSONObject? = null): String {
        check(BuildConfig.API_BASE_URL.startsWith("https://")) { "Account service is not configured." }
        val connection = URL(BuildConfig.API_BASE_URL + "/v1/" + path).openConnection() as HttpURLConnection
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
            return connection.inputStream.bufferedReader().use { it.readText() }
        } finally { connection.disconnect() }
    }
}
