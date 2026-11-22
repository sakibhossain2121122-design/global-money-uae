package com.globalmoney.uae.demo

import org.junit.Assert.*
import org.junit.Test

class RegistrationTest {
    @Test fun mobileMustBeUaeMobileInInternationalFormat() {
        assertTrue(Registration.validMobile("+971501234567"))
        for (number in listOf("0501234567", "+971401234567", "+97150123456", "+9715012345678", "+97150abcdefg"))
            assertFalse(Registration.validMobile(number))
    }

    @Test fun confirmationMustMatchAValidLengthPassword() {
        assertTrue(Registration.validPasswords("abcdefghijkl", "abcdefghijkl"))
        assertFalse(Registration.validPasswords("short", "short"))
        assertFalse(Registration.validPasswords("abcdefghijkl", "abcdefghijkm"))
        assertFalse(Registration.validPasswords("x".repeat(129), "x".repeat(129)))
    }
}
