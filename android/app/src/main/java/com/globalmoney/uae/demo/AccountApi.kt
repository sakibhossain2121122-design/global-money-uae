package com.globalmoney.uae.demo

import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/** User-facing errors never contain credentials or raw server response content. */
internal sealed class AccountFailure(message: String) : Exception(message) {
    class NotConfigured : AccountFailure("Account service is not configured.")
    class Network : AccountFailure("Cannot connect to the account service.")
    class Session : AccountFailure("Your session has expired. Please sign in again.")
    class Rejected(val status: Int) : AccountFailure("Account request was rejected ($status).")
    class Unavailable : AccountFailure("Account service is temporarily unavailable.")
}

/** HTTPS-only API transport. Bearer credentials are held only in process memory. */
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
        val origin = runCatching { URL(baseUrl) }.getOrNull()
        if (origin == null || origin.protocol != "https" || origin.host.isNullOrBlank() ||
            origin.userInfo != null || origin.path !in listOf("", "/") || origin.query != null || origin.ref != null) {
            throw AccountFailure.NotConfigured()
        }
        if (!path.matches(Regex("[A-Za-z0-9/_-]{1,120}")) || path.split('/').any { it == ".." }) {
            throw IllegalArgumentException("Invalid API path")
        }
        if (method !in setOf("GET", "POST", "PATCH", "DELETE", "PUT")) {
            throw IllegalArgumentException("Invalid API method")
        }
        val connection = try {
            openConnection(URL(origin.toString().trimEnd('/') + "/v1/" + path))
        } catch (_: IOException) {
            throw AccountFailure.Network()
        }
        try {
            connection.connectTimeout = 10_000
            connection.readTimeout = 10_000
            connection.instanceFollowRedirects = false
            connection.requestMethod = method
            connection.setRequestProperty("Accept", "application/json")
            token?.let { connection.setRequestProperty("Authorization", "Bearer $it") }
            if (data != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                connection.outputStream.use { it.write(data.toString().toByteArray(Charsets.UTF_8)) }
            }
            val status = connection.responseCode
            if (status == 401) {
                token = null
                throw AccountFailure.Session()
            }
            if (status >= 500) throw AccountFailure.Unavailable()
            if (status !in 200..299) throw AccountFailure.Rejected(status)
            val stream = connection.inputStream
            return stream.bufferedReader(Charsets.UTF_8).use { reader ->
                if (path == "payment-methods") PaymentMethods.readLimited(reader) else reader.readText()
            }
        } catch (error: AccountFailure) {
            throw error
        } catch (_: IOException) {
            throw AccountFailure.Network()
        } finally {
            connection.disconnect()
        }
    }
}
