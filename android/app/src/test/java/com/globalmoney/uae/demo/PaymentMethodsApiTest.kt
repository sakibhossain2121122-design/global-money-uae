package com.globalmoney.uae.demo

import org.junit.Assert.*
import org.junit.Test
import java.net.HttpURLConnection
import java.net.URL
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream

class PaymentMethodsApiTest {
    private class Connection(val status: Int, val body: String) : HttpURLConnection(URL("https://api.example/v1/payment-methods")) {
        var disconnected = false
        override fun connect() {}
        override fun disconnect() { disconnected = true }
        override fun usingProxy() = false
        override fun getResponseCode() = status
        override fun getInputStream() = ByteArrayInputStream(body.toByteArray(Charsets.UTF_8))
    }
    @Test fun existingBearerSessionIsSentOnlyToTheApiUsingGet() {
        val connection = Connection(200, "[]")
        val api = AccountApi("https://api.example") { url -> assertEquals("https://api.example/v1/payment-methods", url.toString()); connection }
        api.token = "test-session"
        assertEquals("[]", api.paymentMethods())
        assertEquals("GET", connection.requestMethod)
        assertEquals("Bearer test-session", connection.getRequestProperty("Authorization"))
        assertFalse(connection.instanceFollowRedirects)
        assertFalse(connection.doOutput)
        assertTrue(connection.disconnected)
    }
    @Test fun missingSessionDoesNotOpenAConnection() {
        val api = AccountApi("https://api.example") { fail("Unauthenticated request"); throw AssertionError() }
        try { api.paymentMethods(); fail() } catch (_: IllegalStateException) { }
    }
    @Test fun expiryClearsTokenWhileOtherErrorsPreserveSessionForRetry() {
        for (status in listOf(401, 403, 429, 500, 503)) {
            val connection = Connection(status, "not an array")
            val api = AccountApi("https://api.example") { connection }
            api.token = "test-session"
            try {
                api.paymentMethods()
                fail("Expected AccountFailure for HTTP $status")
            } catch (error: AccountFailure) {
                when {
                    status == 401 ->
                        assertTrue(error is AccountFailure.Session)
                    status >= 500 ->
                        assertTrue(error is AccountFailure.Unavailable)
                    else -> {
                        assertTrue(error is AccountFailure.Rejected)
                        assertEquals(status, (error as AccountFailure.Rejected).status)
                    }
                }
            }
            assertEquals(if (status == 401) null else "test-session", api.token)
            assertTrue(connection.disconnected)
        }
    }
    @Test fun receiptUploadUsesAuthenticatedBoundedBinaryRequest() {
        val written = ByteArrayOutputStream()
        val connection = object : HttpURLConnection(URL("https://api.example")) {
            override fun connect() {}
            override fun disconnect() {}
            override fun usingProxy() = false
            override fun getResponseCode() = 201
            override fun getInputStream() = ByteArrayInputStream("{}".toByteArray())
            override fun getOutputStream() = written
        }
        val api = AccountApi("https://api.example") { url ->
            assertEquals("https://api.example/v1/add-money-requests/123/receipt", url.toString())
            connection
        }
        api.token = "session"
        assertEquals("{}", api.uploadReceipt("123", "image/png", ByteArrayInputStream(byteArrayOf(1, 2, 3))))
        assertEquals("PUT", connection.requestMethod)
        assertEquals("image/png", connection.getRequestProperty("Content-Type"))
        assertEquals("Bearer session", connection.getRequestProperty("Authorization"))
        assertArrayEquals(byteArrayOf(1, 2, 3), written.toByteArray())
    }
    @Test fun oversizedOrUnsupportedReceiptNeverOpensNetwork() {
        val api = AccountApi("https://api.example") { fail("Unexpected network request"); throw AssertionError() }
        for ((type, size) in listOf("image/png" to (5 * 1024 * 1024 + 1), "image/gif" to 1)) {
            try {
                api.uploadReceipt("123", type, ByteArrayInputStream(ByteArray(size)))
                fail("Expected invalid receipt")
            } catch (_: AccountFailure.InvalidReceipt) { }
        }
    }
}
