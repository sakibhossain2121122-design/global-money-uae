package com.globalmoney.uae.demo

import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL

/** User-facing errors. Never expose secrets or raw server responses. */
internal sealed class AccountFailure(message: String) : Exception(message) {
    class NotConfigured : AccountFailure("Account service is not configured.")
    class Network : AccountFailure("Cannot connect to the account service.")
    class Session : AccountFailure("Your session has expired. Please sign in again.")
    class Rejected(val status: Int) : AccountFailure("Account request was rejected ($status).")
    class Unavailable : AccountFailure("Account service is temporarily unavailable.")
    class InvalidReceipt : AccountFailure("Choose a JPG, PNG or PDF receipt of at most 5 MB.")
}

/** HTTPS only. Tokens remain in process memory. */
internal class AccountApi(
    private val baseUrl: String = BuildConfig.API_BASE_URL,
    private val openConnection: (URL) -> HttpURLConnection = {
        it.openConnection() as HttpURLConnection
    }
) {



    @Volatile var token: String? = null
    fun paymentMethods(): String {
        check(!token.isNullOrBlank()) { "Sign in required" }
        return request("payment-methods")
    }
    fun request(path: String, method: String = "GET", data: JSONObject? = null): String =
        send(path, method, data?.toString()?.toByteArray(Charsets.UTF_8), "application/json")

    fun uploadReceipt(requestId: String, contentType: String?, input: InputStream): String {
        val bytes = ByteArrayOutputStream()
        val buffer = ByteArray(8192)
        input.use {
            if (contentType !in listOf("image/jpeg", "image/png", "application/pdf")) throw AccountFailure.InvalidReceipt()
            while (true) {
                val count = it.read(buffer)
                if (count < 0) break
                if (bytes.size() + count > 5 * 1024 * 1024) throw AccountFailure.InvalidReceipt()
                bytes.write(buffer, 0, count)
            }
        }
        return send("add-money-requests/$requestId/receipt", "PUT", bytes.toByteArray(), contentType!!)
    }

    private fun send(path: String, method: String, data: ByteArray?, contentType: String): String {
if (!baseUrl.startsWith("https://")) {
            throw AccountFailure.NotConfigured()
        }

        val connection = try {
            openConnection(URL(baseUrl + "/v1/" + path))
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
                connection.setRequestProperty("Content-Type", contentType)
                connection.setFixedLengthStreamingMode(data.size)
                connection.outputStream.use { it.write(data) }
            }
val status = connection.responseCode
if (status == 401) {
                token = null
                throw AccountFailure.Session()
            }

            if (status >= 500) {
                throw AccountFailure.Unavailable()
            }

            if (status !in 200..299) {
                throw AccountFailure.Rejected(status)
            }

            return connection.inputStream.bufferedReader(Charsets.UTF_8).use {
                if (path == "payment-methods") {
                    PaymentMethods.readLimited(it)
                } else {
                    it.readText()
                }
            }
        } catch (_: IOException) {
            throw AccountFailure.Network()
        } finally {
            connection.disconnect()

    }
}

}
