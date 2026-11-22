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
}
