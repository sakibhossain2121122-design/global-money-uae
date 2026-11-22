package com.globalmoney.uae.demo

import org.junit.Assert.*
import org.junit.Test

class AddMoneyDraftTest {
    @Test fun boundedDecimalAedOnly() {
        for (value in listOf("0.01", "12.34", "1000000")) assertTrue(AddMoneyDraft.validAmount(value))
        for (value in listOf("", "0", "-1", "1e2", "1.001", "01", "1000000.01")) assertFalse(AddMoneyDraft.validAmount(value))
    }
}
