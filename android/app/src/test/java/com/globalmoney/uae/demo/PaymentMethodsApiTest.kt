package com.globalmoney.uae.demo

import org.junit.Assert.*
import org.junit.Test
import java.net.HttpURLConnection
import java.net.URL
import java.io.ByteArrayInputStream

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
            try { api.paymentMethods(); fail() } catch (_: IllegalStateException) { }
            assertEquals(if (status == 401) null else "test-session", api.token)
            assertTrue(connection.disconnected)
        }
    }
}
