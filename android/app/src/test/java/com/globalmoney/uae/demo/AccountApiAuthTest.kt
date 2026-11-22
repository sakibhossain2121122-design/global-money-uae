package com.globalmoney.uae.demo

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL

class AccountApiAuthTest {
    private class Connection(private val status: Int, private val body: String = "{}") :
        HttpURLConnection(URL("https://api.example")) {
        val written = ByteArrayOutputStream()
        var disconnected = false
        override fun connect() {}
        override fun disconnect() { disconnected = true }
        override fun usingProxy() = false
        override fun getResponseCode() = status
        override fun getOutputStream() = written
        override fun getInputStream() = ByteArrayInputStream(body.toByteArray(Charsets.UTF_8))
    }

    @Test fun registrationPostsUtf8JsonAndAccepts202WithoutCreatingASession() {
        val connection = Connection(202, """{"message":"Please sign in"}""")
        val api = AccountApi("https://api.example") { url ->
            assertEquals("https://api.example/v1/auth/register", url.toString())
            connection
        }
        val payload = JSONObject().put("email", "person@example.com")
            .put("password", "example-password").put("name", "নাম")
        assertEquals("""{"message":"Please sign in"}""", api.request("auth/register", "POST", payload))
        assertEquals("POST", connection.requestMethod)
        assertEquals("application/json", connection.getRequestProperty("Content-Type"))
        assertNull(connection.getRequestProperty("Authorization"))
        assertEquals("নাম", JSONObject(connection.written.toString("UTF-8")).getString("name"))
        assertNull(api.token)
        assertTrue(connection.disconnected)
    }

    @Test fun registration401IsNotReportedAsAnExpiredSession() {
        val connection = Connection(401)
        val api = AccountApi("https://api.example") { connection }
        try {
            api.request("auth/register", "POST", JSONObject())
            fail("Expected registration rejection")
        } catch (error: AccountFailure.Rejected) {
            assertEquals(401, error.status)
        }
        assertNull(api.token)
        assertTrue(connection.disconnected)
    }

    @Test fun login401IsInvalidCredentialsNotAnExpiredSession() {
        val connection = Connection(401)
        val api = AccountApi("https://api.example") { connection }
        try {
            api.request("auth/login", "POST", JSONObject())
            fail("Expected invalid credentials")
        } catch (_: AccountFailure.InvalidCredentials) { }
        assertNull(api.token)
        assertTrue(connection.disconnected)
    }

    @Test fun authenticatedWalletProfileAndAddMoneyRequestsUseBearer() {
        val requests = mutableListOf<Pair<String, Connection>>()
        val api = AccountApi("https://api.example") { url ->
            Connection(200, "{}").also { requests.add(url.path to it) }
        }
        api.token = "session"
        api.request("wallet")
        api.request("me")
        api.request("add-money-request-methods")
        api.request("add-money-requests", "POST", JSONObject().put("idempotency_key", "test-key"))
        api.request("add-money-requests")
        assertEquals(listOf("/v1/wallet", "/v1/me", "/v1/add-money-request-methods",
            "/v1/add-money-requests", "/v1/add-money-requests"), requests.map { it.first })
        assertTrue(requests.all { it.second.getRequestProperty("Authorization") == "Bearer session" })
        assertEquals("POST", requests[3].second.requestMethod)
        assertEquals("test-key", JSONObject(requests[3].second.written.toString("UTF-8")).getString("idempotency_key"))
        assertEquals("GET", requests[4].second.requestMethod)
    }

    @Test fun mobileLoginPostsMobileAndPasswordWithoutRequiringOtp() {
        val connection = Connection(200, """{"token":"session"}""")
        val api = AccountApi("https://api.example") { connection }
        api.request("auth/login", "POST", JSONObject().put("mobile_uae", "+971501234567").put("password", "example-password"))
        val data = JSONObject(connection.written.toString("UTF-8"))
        assertEquals("+971501234567", data.getString("mobile_uae"))
        assertFalse(data.has("otp"))
        assertFalse(data.has("email"))
        assertFalse(connection.instanceFollowRedirects)
    }

    @Test fun paymentDetailsUseAuthenticatedGetAndNeverPostPayment() {
        val connection = Connection(200, """{"accounts":[],"paymentsEnabled":false}""")
        val api = AccountApi("https://api.example") { url ->
            assertEquals("https://api.example/v1/payment-methods/adcb", url.toString())
            connection
        }
        api.token = "session"
        val details = JSONObject(api.request("payment-methods/adcb"))
        assertFalse(details.getBoolean("paymentsEnabled"))
        assertEquals("GET", connection.requestMethod)
        assertEquals("Bearer session", connection.getRequestProperty("Authorization"))
        assertEquals(0, connection.written.size())
    }
}
