package com.globalmoney.uae.demo

import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

** User-facing errors. Never expose secrets or raw server responses. */
internal sealed class AccountFailure(message: String) : Exception(message) {
    class NotConfigured : AccountFailure("Account service is not configured.")
    class Network : AccountFailure("Cannot connect to the account service.")
    class Session : AccountFailure("Your session has expired. Please sign in again.")
    class Rejected(val status: Int) : AccountFailure("Account request was rejected ($status).")
    class Unavailable : AccountFailure("Account service is temporarily unavailable.")
}

/** HTTPS only. Tokens remain in process memory. */
internal class AccountApi(
    private val baseUrl: String = BuildConfig.API_BASE_URL,
    private val openConnection: (URL) -> HttpURLConnection = {
        it.openConnection() as HttpURLConnection
    }
) {



Android মোবাইল থেকে পরবর্তী ধাপ:
1. GitHub-এর conflict editor-এ এই অংশটি প্রতিস্থাপন করুন।
2. নিচের @Volatile var token এবং request() ফাংশন অক্ষত রাখুন।
3. অন্য conflict থাকলে এখনই Mark as resolved চাপবেন না।
গুরুত্বপূর্ণ: শুধু এই অংশ ঠিক করলেই পুরো ফাইল ঠিক হবে না। আগের সম্পাদনায় AccountApi.kt-এর কিছু কোড মুছে গিয়ে থাকলে সেগুলোও পুনরুদ্ধার করতে হবে।

এখন এই অংশ পেস্ট করার পর AccountApi.kt-এর পরবর্তী অংশের স্ক্রিনশট পাঠান।
    @Volatile var token: String? = null
    fun paymentMethods(): String {
        check(!token.isNullOrBlank()) { "Sign in required" }
        return request("payment-methods")
    }
    fun request(path: String, method: String = "GET", data: JSONObject? = null): String {
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
                connection.setRequestProperty("Content-Type", "application/json")
                connection.outputStream.use { it.write(data.toString().toByteArray(Charsets.UTF_8)) }
            }
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
        }            val status = connection.responseCode

    }
}
