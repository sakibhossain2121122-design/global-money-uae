package com.globalmoney.uae.demo

import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/** User-facing error categories. Never include secrets or raw server responses. */
internal sealed class AccountFailure(message: String) : Exception(message) {
    class NotConfigured : AccountFailure("Account service is not configured.")
    class Network : AccountFailure("Cannot connect to the account service.")
    class Session : AccountFailure("Your session has expired. Please sign in again.")
    class Rejected(val status: Int) : AccountFailure("Account request was rejected ($status).")
    class Unavailable : AccountFailure("Account service is temporarily unavailable.")
}

/** HTTPS only. Tokens remain in process memory; financial actions stay disabled. */
internal class AccountApi {
    @Volatile var token: String? = null
    fun request(path: String, method: String = "GET", data: JSONObject? = null): String {
        if (!BuildConfig.API_BASE_URL.startsWith("https://")) throw AccountFailure.NotConfigured()
        val connection = try {
            URL(BuildConfig.API_BASE_URL + "/v1/" + path).openConnection() as HttpURLConnection
        } catch (_: IOException) {
            throw AccountFailure.Network()
        }
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
            if (status == 401) {
                token = null
                throw AccountFailure.Session()
            }
            if (status == 503 || status >= 500) throw AccountFailure.Unavailable()
            if (status !in 200..299) throw AccountFailure.Rejected(status)
            return connection.inputStream.bufferedReader().use { it.readText() }
        } catch (_: IOException) {
            throw AccountFailure.Network()
        } finally {
            connection.disconnect()
        }
    }
}
