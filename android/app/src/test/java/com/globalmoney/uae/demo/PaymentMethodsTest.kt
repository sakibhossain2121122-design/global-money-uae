package com.globalmoney.uae.demo

import org.json.JSONException
import org.junit.Assert.*
import org.junit.Test
import java.io.StringReader

class PaymentMethodsTest {
    @Test fun allProviderEnableFlagsAreIgnored() {
        for (flag in listOf("true", "false", "null", "123", "\"true\"")) {
            val method = PaymentMethods.parse("""[{"name":"Bank","country":"AE","currency":"AED","enabled":$flag,"logo_url":"https://cdn.example/logo.png"}]""").single()
            assertEquals("Bank", method.name)
            assertEquals("AE", method.country)
            assertEquals("AED", method.currency)
            assertEquals("https://cdn.example/logo.png", method.logoUrl)
            assertFalse(method.enabled)
        }
    }
    @Test fun emptyListAndOptionalLogoAreSafe() {
        assertTrue(PaymentMethods.parse("[]").isEmpty())
        for (logo in listOf("", ",\"logo_url\":null", ",\"logo_url\":\"\"", ",\"logo_url\":\"http://cdn.example/logo\"", ",\"logo_url\":\"https://user:secret@cdn.example/logo\"", ",\"logo_url\":\"javascript:alert(1)\"")) {
            assertNull(PaymentMethods.parse("""[{"name":"পদ্ধতি","country":"BD","currency":"BDT"$logo}]""").single().logoUrl)
        }
    }
    @Test fun malformedShapesAndFieldsFailWithoutPartialResults() {
        for (json in listOf("", "not JSON", "{}", "null", "[null]", "[42]", "[{}]", "[] trailing", """[{"name":3,"country":"AE","currency":"AED"}]""", """[{"name":"Bank","country":"UAE","currency":"AED"}]""")) {
            try { PaymentMethods.parse(json); fail("Expected invalid metadata to fail") } catch (_: JSONException) { }
        }
    }
    @Test fun responseAndListSizeAreBounded() {
        try { PaymentMethods.readLimited(StringReader("x".repeat(PaymentMethods.MAX_RESPONSE_CHARS + 1))); fail() } catch (_: JSONException) { }
        val entry = """{"name":"Bank","country":"AE","currency":"AED"}"""
        try { PaymentMethods.parse(List(201) { entry }.joinToString(",", "[", "]")); fail() } catch (_: JSONException) { }
        assertEquals("[]", PaymentMethods.readLimited(StringReader("[]")))
    }
}
